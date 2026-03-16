"""
app/graphs/travel_graph.py

LangGraph pipeline — three nodes wired in sequence:

  node_airports  →  node_scrape  →  node_insight

This file owns ONLY graph orchestration:
  - node function definitions (thin, delegating to services/utils)
  - _resolve_destination() — Amadeus airport resolution logic
  - StateGraph wiring

Parsing and deduplication logic live in:
  app/utils/flight_parser.py
  app/utils/flight_deduplicator.py
"""

import asyncio
from langgraph.graph import StateGraph, END
from playwright.async_api import async_playwright
from playwright_stealth.stealth import Stealth

from app.graphs.state import TravelState
from app.models.flight import FlightOption
from app.services.airport_service import AirportService
from app.services.gemini_service import GeminiService
from app.utils.flight_parser import parse_aria_text
from app.utils.flight_deduplicator import deduplicate_flights
import json

# ── Service singletons ────────────────────────────────────────────────────────
airport_svc = AirportService()
gemini_svc  = GeminiService()


# ── Destination resolution ────────────────────────────────────────────────────

async def _resolve_destination(dest_input: str) -> tuple[str, str, list[dict]]:
    """
    Resolves a destination string to (dest_iata, dest_full_name, dest_airports).

    Fires city lookup and IATA validation in parallel via asyncio.gather.
    Always prefers the city path — fixes GOA→GOI and Patna→PAT edge cases.

    Decision matrix:
      city resolved + airports found  → use city_iata as primary ✅
      city resolved, no airports      → use city_iata directly
      IATA confirmed only             → use raw IATA input
      neither                         → raw input + warning
    """
    dest_clean = dest_input.strip()

    (city_iata, dest_lat, dest_lon), iata_full_name = await asyncio.gather(
        airport_svc.get_city_info(dest_clean),
        airport_svc.get_airport_details(dest_clean.upper()),
    )

    city_resolved  = dest_lat is not None
    iata_confirmed = iata_full_name.upper() != dest_clean.upper()

    if city_resolved:
        dest_airports = await airport_svc.get_nearby_airports(dest_lat, dest_lon)

        if dest_airports:
            primary_iata  = city_iata or dest_airports[0]["iata"]
            airport_iatas = [a["iata"] for a in dest_airports]

            if primary_iata not in airport_iatas:
                primary_name  = await airport_svc.get_airport_details(primary_iata)
                dest_airports = [{"iata": primary_iata, "name": primary_name}] + dest_airports
            else:
                dest_airports = (
                    [a for a in dest_airports if a["iata"] == primary_iata] +
                    [a for a in dest_airports if a["iata"] != primary_iata]
                )

            print(f"✅ City path: '{dest_clean}' → primary {primary_iata}")
            print(f"   Nearby destination airports: {[a['iata'] for a in dest_airports]}")
            return primary_iata, dest_clean, dest_airports

        if city_iata:
            print(f"✅ Using city IATA directly (no nearby airports): {city_iata}")
            name = await airport_svc.get_airport_details(city_iata)
            return city_iata, dest_clean, [{"iata": city_iata, "name": name}]

        if iata_confirmed:
            print(f"✅ IATA fallback (coords found, no airports): {dest_clean.upper()}")
            return dest_clean.upper(), iata_full_name, [{"iata": dest_clean.upper(), "name": iata_full_name}]

        print(f"⚠️ Coords found for '{dest_clean}' but no airports. Using raw input.")
        return dest_clean, dest_clean, [{"iata": dest_clean, "name": dest_clean}]

    if iata_confirmed:
        print(f"✅ IATA path: '{dest_clean}' → {dest_clean.upper()} ({iata_full_name})")
        return dest_clean.upper(), iata_full_name, [{"iata": dest_clean.upper(), "name": iata_full_name}]

    print(f"⚠️ Could not resolve '{dest_clean}'. Using raw input.")
    return dest_clean, dest_clean, [{"iata": dest_clean, "name": dest_clean}]


# ── NODE 1: Resolve airports ──────────────────────────────────────────────────

async def find_nearby_airports_node(state: TravelState):
    origin_input = state["origin_city"]
    dest_input   = state["dest_city"]

    # Origin: three-layer city resolution → nearby airports
    # get_city_info() tries: L1 airport-city → L2 cities API → L3 raw IATA
    # For non-airport cities (e.g. Dumka), L2 returns coords with iata=None
    # and get_nearby_airports() finds the closest airport from those coords.
    origin_iata, lat, lon = await airport_svc.get_city_info(origin_input)
    if lat is None:
        print(f"⚠️ Could not resolve '{origin_input}' via any lookup layer. Using Pune fallback.")
        lat, lon = 18.5204, 73.8567

    origin_airport_data = await airport_svc.get_nearby_airports(lat, lon)
    if not origin_airport_data:
        print("⚠️ No nearby origin airports found. Using PNQ fallback.")
        origin_airport_data = [{"iata": "PNQ", "name": "Pune Airport"}]

    # For non-airport cities (origin_iata=None from L2), the primary origin
    # is the closest airport found from coordinates — log this clearly.
    if origin_iata and origin_iata != origin_airport_data[0]["iata"]:
        print(f"   ℹ️ '{origin_input}' has no direct airport — nearest is "
              f"{origin_airport_data[0]['iata']} ({origin_airport_data[0]['name']})")

    airport_names    = {a["iata"]: a["name"] for a in origin_airport_data}
    origin_iata_list = [a["iata"] for a in origin_airport_data]

    # Destination: parallel Amadeus validation + nearby airports
    print(f"🔍 Resolving destination '{dest_input}' via parallel Amadeus lookup...")
    dest_iata, dest_full_name, dest_airport_data = await _resolve_destination(dest_input)
    dest_iata_list = [a["iata"] for a in dest_airport_data]

    # Merge destination names into shared airport_names map
    for a in dest_airport_data:
        airport_names[a["iata"]] = a["name"]

    print(f"📍 Origin airports      : {origin_iata_list}")
    print(f"📍 Destination airports : {dest_iata_list}  (primary: {dest_iata})")

    return {
        "origin_airports": origin_iata_list,
        "dest_airports":   dest_iata_list,
        "airport_names":   airport_names,
        "dest_city":       dest_iata,
        "dest_full_name":  dest_full_name,
        "origin_lat":      lat,
        "origin_lon":      lon,
        "status":          f"Found {len(origin_iata_list)} origin, {len(dest_iata_list)} destination airports.",
    }


# ── NODE 2: Scrape Google Flights ─────────────────────────────────────────────

async def scrape_google_flights_node(state: TravelState):
    origin_airports = state["origin_airports"]
    dest_airports   = state.get("dest_airports") or [state["dest_city"]]
    primary_origin  = origin_airports[0] if origin_airports else None
    primary_dest    = state["dest_city"]
    airport_names   = state.get("airport_names", {})
    date            = state["date"]

    print(f"🔁 Scrape matrix: {len(origin_airports)} origins × {len(dest_airports)} destinations "
          f"= {len(origin_airports) * len(dest_airports)} combinations")

    raw_flights: list[FlightOption] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(locale="en-IN", timezone_id="Asia/Kolkata")
        page    = await context.new_page()

        # Apply stealth once per page
        if not getattr(page, "_stealth_applied", False):
            await Stealth().apply_stealth_async(page)
            page._stealth_applied = True

        for origin_iata in origin_airports:
            for dest_iata in dest_airports:
                url = (
                    f"https://www.google.com/travel/flights"
                    f"?q=Flights%20to%20{dest_iata}"
                    f"%20from%20{origin_iata}"
                    f"%20on%20{date}"
                    f"%20oneway"
                )

                try:
                    print(f"✈️  Scraping: {origin_iata} → {dest_iata}...")
                    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    await page.wait_for_selector(
                        "xpath=//div[contains(@aria-label,'From')]", timeout=15000
                    )

                    elements = await page.query_selector_all(
                        "xpath=//li//div[contains(@aria-label,'From')]"
                    )
                    print(f"   🔍 {len(elements)} elements found — collecting top 5 cheapest.")

                    pair_flights: list[FlightOption] = []

                    for element in elements:
                        aria_text = await element.get_attribute("aria-label")
                        if not aria_text:
                            continue

                        flight = parse_aria_text(
                            aria_text      = aria_text,
                            origin_iata    = origin_iata,
                            dest_iata      = dest_iata,
                            primary_origin = primary_origin,
                            primary_dest   = primary_dest,
                            departure_date = date,
                            airport_names  = airport_names,
                            debug          = False,
                        )

                        if flight:
                            pair_flights.append(flight)
                        else:
                            print(f"   ⚠️  Parse failed: {aria_text[:60]}...")

                    # Sort and keep top 5 cheapest for this pair
                    pair_flights.sort(key=lambda f: f.price)
                    top5 = pair_flights[:5]
                    raw_flights.extend(top5)

                    for f in top5:
                        tag = " [nearby]" if f.is_nearby else ""
                        print(f"   ✅ {f.airline} ₹{f.price}{tag}")
                    print(f"   📊 {len(pair_flights)} parsed → kept top {len(top5)}")

                except Exception as e:
                    print(f"⚠️  Skipping {origin_iata}→{dest_iata}: {e}")
                    continue

        await browser.close()

    # Deduplicate across all pairs before returning
    all_flights = deduplicate_flights(raw_flights)
    print(f"✅ Scraping complete. {len(raw_flights)} raw → {len(all_flights)} after dedup.")

    return {"collected_flights": all_flights}


# ── STREAMING: scrape_and_stream — async generator for /search/stream ────────
#
# Yields NDJSON lines as each origin→dest pair completes.
# Each line is one of:
#   {"type": "status",  "origin": "PNQ", "dest": "CCU", "combo": 1, "total": 6}
#   {"type": "flights", "origin": "PNQ", "dest": "CCU", "flights": [...]}
#   {"type": "done",    "total_flights": 38}
#
# The existing scrape_google_flights_node is kept intact for non-streaming use.

async def scrape_and_stream(
    origin_airports: list[str],
    dest_airports:   list[str],
    primary_origin:  str,
    primary_dest:    str,
    airport_names:   dict,
    date:            str,
):
    """
    Drop-in streaming replacement for scrape_google_flights_node.
    Yields JSON strings (without trailing newline — caller adds \n).
    """
    raw_flights: list[FlightOption] = []
    total_combos = len(origin_airports) * len(dest_airports)
    combo_num    = 0

    origin_name_map = {iata: airport_names.get(iata, iata) for iata in origin_airports}
    dest_name_map   = {iata: airport_names.get(iata, iata) for iata in dest_airports}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(locale="en-IN", timezone_id="Asia/Kolkata")
        page    = await context.new_page()

        if not getattr(page, "_stealth_applied", False):
            await Stealth().apply_stealth_async(page)
            page._stealth_applied = True

        for origin_iata in origin_airports:
            for dest_iata in dest_airports:
                combo_num += 1

                # ── Emit status event so UI can show "Scanning PNQ → CCU" ──
                yield json.dumps({
                    "type":        "status",
                    "origin":      origin_iata,
                    "origin_name": origin_name_map.get(origin_iata, origin_iata),
                    "dest":        dest_iata,
                    "dest_name":   dest_name_map.get(dest_iata, dest_iata),
                    "combo":       combo_num,
                    "total":       total_combos,
                })

                url = (
                    f"https://www.google.com/travel/flights"
                    f"?q=Flights%20to%20{dest_iata}"
                    f"%20from%20{origin_iata}"
                    f"%20on%20{date}"
                    f"%20oneway"
                )

                try:
                    print(f"✈️  Streaming scrape: {origin_iata} → {dest_iata} ({combo_num}/{total_combos})")
                    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    await page.wait_for_selector(
                        "xpath=//div[contains(@aria-label,'From')]", timeout=15000
                    )
                    elements = await page.query_selector_all(
                        "xpath=//li//div[contains(@aria-label,'From')]"
                    )

                    pair_flights: list[FlightOption] = []
                    for element in elements:
                        aria_text = await element.get_attribute("aria-label")
                        if not aria_text:
                            continue
                        flight = parse_aria_text(
                            aria_text      = aria_text,
                            origin_iata    = origin_iata,
                            dest_iata      = dest_iata,
                            primary_origin = primary_origin,
                            primary_dest   = primary_dest,
                            departure_date = date,
                            airport_names  = airport_names,
                            debug          = False,
                        )
                        if flight:
                            pair_flights.append(flight)

                    pair_flights.sort(key=lambda f: f.price)
                    top5 = pair_flights[:5]
                    raw_flights.extend(top5)

                    # ── Emit flights event with this pair's results ────────
                    if top5:
                        yield json.dumps({
                            "type":    "flights",
                            "origin":  origin_iata,
                            "dest":    dest_iata,
                            "flights": [f.model_dump() for f in top5],
                        })
                        print(f"   ✅ Streamed {len(top5)} flights for {origin_iata}→{dest_iata}")

                except Exception as e:
                    print(f"⚠️  Skipping {origin_iata}→{dest_iata}: {e}")
                    yield json.dumps({
                        "type":  "error",
                        "origin": origin_iata,
                        "dest":   dest_iata,
                        "msg":    str(e),
                    })
                    continue

        await browser.close()

    # Final dedup across all pairs, then emit done
    all_flights = deduplicate_flights(raw_flights)
    print(f"✅ Stream complete: {len(raw_flights)} raw → {len(all_flights)} deduped")
    yield json.dumps({
        "type":          "done",
        "total_flights": len(all_flights),
    })


# ── NODE 3: Gemini AI insight ─────────────────────────────────────────────────

async def final_insight_node(state: TravelState):
    recommendation = await gemini_svc.get_recommendation(
        origin_city = state["origin_city"],
        dest_name   = state.get("dest_full_name", state["dest_city"]),
        flights     = state["collected_flights"],
    )
    return {"final_recommendation": recommendation}


# ── Graph wiring ──────────────────────────────────────────────────────────────

builder = StateGraph(TravelState)

builder.add_node("node_airports", find_nearby_airports_node)
builder.add_node("node_scrape",   scrape_google_flights_node)
builder.add_node("node_insight",  final_insight_node)

builder.set_entry_point("node_airports")
builder.add_edge("node_airports", "node_scrape")
builder.add_edge("node_scrape",   "node_insight")
builder.add_edge("node_insight",  END)

travel_app = builder.compile()