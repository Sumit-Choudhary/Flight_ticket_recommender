"""
GeminiService — Generates AI travel insights using Google Gemini.
Called by final_insight_node in travel_graph.py after flights are collected.
"""

import os
from typing import List

from google import genai
from dotenv import load_dotenv

from app.models.flight import FlightOption

load_dotenv()


class GeminiService:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("❌ GEMINI_API_KEY is missing! Check your .env file.")

        self.client = genai.Client(api_key=api_key)

        # Updated to gemini-2.5-flash — gemini-2.0-flash is no longer available
        # to new users as of March 2026.
        self.model_id = "gemini-2.5-flash"

    def _build_flight_context(
        self,
        origin_city: str,
        dest_name: str,
        flights: List[FlightOption],
    ) -> str:
        """
        Builds a structured plain-text summary of all flight options.
        Used as the grounding context for both the insight report and the chatbot.
        Extracted here so both methods share identical flight data representation.
        """
        valid_flights = [f for f in flights if f.price > 0]
        if not valid_flights:
            return "No valid flight data available."

        primary_flight = next((f for f in valid_flights if not f.is_nearby), valid_flights[0])
        primary_origin = primary_flight.origin
        primary_dest   = primary_flight.destination

        exact      = [f for f in valid_flights if f.origin == primary_origin and f.destination == primary_dest]
        alt_origin = [f for f in valid_flights if f.origin != primary_origin and f.destination == primary_dest]
        alt_dest   = [f for f in valid_flights if f.origin == primary_origin and f.destination != primary_dest]
        alt_both   = [f for f in valid_flights if f.origin != primary_origin and f.destination != primary_dest]

        cheapest_overall  = min(valid_flights, key=lambda x: x.price)
        cheapest_exact    = min(exact,      key=lambda x: x.price) if exact      else None
        cheapest_origin   = min(alt_origin, key=lambda x: x.price) if alt_origin else None
        cheapest_alt_dest = min(alt_dest,   key=lambda x: x.price) if alt_dest   else None

        def fmt(f: FlightOption) -> str:
            orig = f.origin_name or f.origin
            dest = f.destination_name or f.destination
            time = f" | {f.departure_time}–{f.arrival_time}" if f.departure_time else ""
            dur  = f" | {f.duration}" if f.duration else ""
            stops = f" | {f.stops}" if f.stops else ""
            return f"{f.airline} | {orig} → {dest} | ₹{f.price:,.0f}{time}{dur}{stops}"

        def section(flights_list, label):
            if not flights_list:
                return f"{label}\n  (no options found)\n"
            lines = [f"  • {fmt(f)}" for f in sorted(flights_list, key=lambda x: x.price)[:5]]
            return f"{label}\n" + "\n".join(lines) + "\n"

        summary = (
            section(exact,      f"FROM {primary_origin} → TO {primary_dest} (Direct city pair):") + "\n" +
            section(alt_origin, f"FROM nearby origin → TO {primary_dest} (alt origin):") + "\n" +
            section(alt_dest,   f"FROM {primary_origin} → TO nearby destination (alt dest):") + "\n" +
            section(alt_both,   "FROM nearby origin → TO nearby destination (both alt):")
        )

        cheapest_lines = f"CHEAPEST OVERALL: {fmt(cheapest_overall)}"
        if cheapest_exact:    cheapest_lines += f"\nCHEAPEST EXACT ROUTE: {fmt(cheapest_exact)}"
        if cheapest_origin:   cheapest_lines += f"\nCHEAPEST ALT ORIGIN: {fmt(cheapest_origin)}"
        if cheapest_alt_dest: cheapest_lines += f"\nCHEAPEST ALT DEST: {fmt(cheapest_alt_dest)}"

        return f"""ROUTE: {origin_city} → {dest_name}
DATE(S): {", ".join(sorted(set(f.departure_date for f in valid_flights)))}

FLIGHT OPTIONS:
{summary}
{cheapest_lines}"""

    async def chat_response(
        self,
        user_message: str,
        history: list,
        origin_city: str,
        dest_name: str,
        flights: List[FlightOption],
    ) -> str:
        """
        Answers a user question about the current search results.

        Uses the same flight context as get_recommendation() as a system prompt,
        then appends the full conversation history so Gemini has multi-turn memory.
        History format: [{"role": "user"|"model", "parts": [{"text": "..."}]}]

        Strictly scoped — Gemini is instructed to only answer questions about
        the flights in context and decline off-topic queries.
        """
        if not flights:
            return "No flight data available yet — please run a search first."

        context = self._build_flight_context(origin_city, dest_name, flights)

        system_prompt = f"""You are a focused Indian travel assistant for a flight search app.
You have access to the following flight search results and NOTHING else.
Answer ONLY questions about these specific flights, prices, airports, timings, or travel tips
relevant to this route. If asked anything outside this scope, politely decline and redirect.
Keep answers concise — 2 to 4 sentences unless the user asks for detail.
Use ₹ for prices. Reference specific airlines and times from the data.

{context}"""

        # Build Gemini contents: system context + history + new user message
        contents = [{"role": "user", "parts": [{"text": system_prompt}]},
                    {"role": "model", "parts": [{"text": "Understood. I have the flight data loaded and I'm ready to answer questions about this route."}]}]

        for turn in history:
            contents.append({
                "role": turn["role"],
                "parts": [{"text": turn["text"]}]
            })

        contents.append({"role": "user", "parts": [{"text": user_message}]})

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_id,
                contents=contents,
            )
            return response.text.strip()
        except Exception as e:
            print(f"❌ Gemini Chat Error: {e}")
            return "Sorry, I couldn't process that. Please try again."

    async def get_recommendation(
        self,
        origin_city: str,
        dest_name: str,
        flights: List[FlightOption],
    ) -> str:
        if not flights:
            return f"No flights found from {origin_city} to {dest_name}."

        valid_flights = [f for f in flights if f.price > 0]
        if not valid_flights:
            return "Flights were found but all had invalid pricing data."

        # ── 1. Dynamically extract unique travel dates from results ───────────
        travel_dates = sorted(set(f.departure_date for f in valid_flights if f.departure_date))
        date_context = ", ".join(travel_dates) if travel_dates else "the requested date"

        # ── 2. Derive dynamic price facts directly from flight data ──────────
        cheapest_overall  = min(valid_flights, key=lambda x: x.price)

        primary_flight    = next((f for f in valid_flights if not f.is_nearby), valid_flights[0])
        primary_origin    = primary_flight.origin
        primary_dest      = primary_flight.destination

        exact      = [f for f in valid_flights if f.origin == primary_origin and f.destination == primary_dest]
        alt_origin = [f for f in valid_flights if f.origin != primary_origin and f.destination == primary_dest]
        alt_dest   = [f for f in valid_flights if f.origin == primary_origin and f.destination != primary_dest]

        cheapest_exact    = min(exact,      key=lambda x: x.price) if exact      else None
        cheapest_alt_orig = min(alt_origin, key=lambda x: x.price) if alt_origin else None
        cheapest_alt_dest = min(alt_dest,   key=lambda x: x.price) if alt_dest   else None

        # Savings vs primary exact route
        origin_saving = (
            cheapest_exact.price - cheapest_alt_orig.price
            if cheapest_exact and cheapest_alt_orig else None
        )
        dest_saving = (
            cheapest_exact.price - cheapest_alt_dest.price
            if cheapest_exact and cheapest_alt_dest else None
        )

        # ── 3. Pre-compute ground travel verdict entirely in Python ─────────
        # Ground transport cost estimates (INR) used for net saving calculation
        GROUND_COST_LOW  = 600
        GROUND_COST_HIGH = 1400

        primary_orig_name = primary_flight.origin_name or primary_origin
        primary_dest_name = primary_flight.destination_name or primary_dest

        # Alternate ORIGIN — only relevant if cheaper than direct after ground cost
        alt_orig_name = (cheapest_alt_orig.origin_name or cheapest_alt_orig.origin) if cheapest_alt_orig else None
        alt_orig_airline = cheapest_alt_orig.airline if cheapest_alt_orig else None
        alt_orig_price   = cheapest_alt_orig.price   if cheapest_alt_orig else None

        if origin_saving is not None and origin_saving > 0:
            net_orig_saving_low  = origin_saving - GROUND_COST_HIGH   # worst case
            net_orig_saving_high = origin_saving - GROUND_COST_LOW    # best case
            orig_worth_it = net_orig_saving_low > 0                   # still saves even in worst case
        else:
            net_orig_saving_low = net_orig_saving_high = None
            orig_worth_it = False

        # Alternate DESTINATION — only relevant if cheaper than direct after ground cost
        alt_dest_name    = (cheapest_alt_dest.destination_name or cheapest_alt_dest.destination) if cheapest_alt_dest else None
        alt_dest_airline = cheapest_alt_dest.airline if cheapest_alt_dest else None
        alt_dest_price   = cheapest_alt_dest.price   if cheapest_alt_dest else None

        if dest_saving is not None and dest_saving > 0:
            net_dest_saving_low  = dest_saving - GROUND_COST_HIGH
            net_dest_saving_high = dest_saving - GROUND_COST_LOW
            dest_worth_it = net_dest_saving_low > 0
        else:
            net_dest_saving_low = net_dest_saving_high = None
            dest_worth_it = False

        # Build the ground travel instruction block injected into the prompt.
        # All decisions are resolved here — Gemini only narrates, never decides.
        def _ground_block() -> str:
            lines = []

            # ── Origin comparison ─────────────────────────────────────────
            if not alt_orig_name:
                lines.append("No alternative origin airports were found in these results — origin comparison not applicable.")
            elif origin_saving is None or origin_saving <= 0:
                lines.append(
                    f"An alternative origin airport **{alt_orig_name}** exists in the results, "
                    f"but its cheapest flight (₹{alt_orig_price:,.0f} via {alt_orig_airline}) is "
                    f"MORE EXPENSIVE than flying from {primary_orig_name} (₹{cheapest_exact.price:,.0f}). "
                    f"**Do NOT recommend the alternate origin.** State clearly that {primary_orig_name} is the better departure point."
                )
            else:
                verdict = (
                    f"Even after adding ₹{GROUND_COST_LOW}–{GROUND_COST_HIGH} ground travel to {alt_orig_name}, "
                    f"the net saving is ₹{net_orig_saving_low:,.0f}–₹{net_orig_saving_high:,.0f}. **Recommend using {alt_orig_name}.**"
                    if orig_worth_it else
                    f"The flight saving of ₹{origin_saving:,.0f} is largely offset by ₹{GROUND_COST_LOW}–{GROUND_COST_HIGH} ground travel cost to {alt_orig_name}. "
                    f"**Do NOT recommend the alternate origin** — the net benefit is marginal at best."
                )
                lines.append(
                    f"Alternative origin **{alt_orig_name}** offers a flight at ₹{alt_orig_price:,.0f} ({alt_orig_airline}), "
                    f"saving ₹{origin_saving:,.0f} vs {primary_orig_name} (₹{cheapest_exact.price:,.0f}). "
                    f"Add ₹{GROUND_COST_LOW}–{GROUND_COST_HIGH} cab/bus cost and 1–2 hours to reach {alt_orig_name}. {verdict}"
                )

            lines.append("")  # blank line between sections

            # ── Destination comparison ────────────────────────────────────
            if not alt_dest_name:
                lines.append("No alternative destination airports were found in these results — destination comparison not applicable.")
            elif dest_saving is None or dest_saving <= 0:
                lines.append(
                    f"An alternative destination airport **{alt_dest_name}** exists in the results, "
                    f"but its cheapest flight (₹{alt_dest_price:,.0f} via {alt_dest_airline}) is "
                    f"MORE EXPENSIVE than flying directly to {primary_dest_name} (₹{cheapest_exact.price:,.0f}). "
                    f"**Do NOT recommend the alternate destination.** State clearly that flying direct to {primary_dest_name} is cheaper."
                )
            else:
                verdict = (
                    f"Even after adding ₹{GROUND_COST_LOW}–{GROUND_COST_HIGH} ground travel from {alt_dest_name} to {dest_name}, "
                    f"the net saving is ₹{net_dest_saving_low:,.0f}–₹{net_dest_saving_high:,.0f}. **Recommend using {alt_dest_name}.**"
                    if dest_worth_it else
                    f"The flight saving of ₹{dest_saving:,.0f} is largely offset by ₹{GROUND_COST_LOW}–{GROUND_COST_HIGH} ground travel from {alt_dest_name} to {dest_name} city centre. "
                    f"**Do NOT recommend the alternate destination** — flying direct to {primary_dest_name} is the better choice overall."
                )
                lines.append(
                    f"Alternative destination **{alt_dest_name}** offers a flight at ₹{alt_dest_price:,.0f} ({alt_dest_airline}), "
                    f"saving ₹{dest_saving:,.0f} vs {primary_dest_name} (₹{cheapest_exact.price:,.0f}). "
                    f"Add ₹{GROUND_COST_LOW}–{GROUND_COST_HIGH} cab/bus cost and 45–90 min to reach {dest_name} city centre. {verdict}"
                )

            return "\n".join(lines)

        ground_instructions = _ground_block()

        # Unique airlines found in results
        airlines_seen = sorted(set(f.airline for f in valid_flights if f.airline))

        # Today's date anchor for Gemini
        from datetime import date as _date
        current_date_str = _date.today().strftime("%A, %B %d, %Y")

        # ── 4. Build rich flight context ──────────────────────────────────────
        flight_data = self._build_flight_context(origin_city, dest_name, flights)

        # ── 5. Prompt — Gemini narrates, Python has already decided ──────────
        prompt = f"""
You are an expert Indian aviation and travel analyst. Today is {current_date_str}.
The user searched for flights from **{origin_city}** to **{dest_name}** on: **{date_context}**.

The search returned {len(valid_flights)} valid flight options across {len(airlines_seen)} airline(s): {", ".join(airlines_seen)}.

---
{flight_data}
---

Provide EXACTLY these two sections. Do not invent prices, airlines, or airports not
present in the data. Follow the instructions in each section precisely.

## 🚗 Ground Travel Costs & Tradeoffs

Your analysis is pre-computed below. Narrate it naturally in 2–4 sentences per airport pair.
Follow the RECOMMEND / DO NOT RECOMMEND verdicts exactly — do not override them.

{ground_instructions}

## 📊 10-Day Volatility & Holiday Alert

Analyse the 10-day booking window around {date_context}. Ground your analysis in:
- The cheapest flight currently available: ₹{cheapest_overall.price:,.0f} ({cheapest_overall.airline}, {cheapest_overall.origin} → {cheapest_overall.destination})
- The live price range seen in results: ₹{min(f.price for f in valid_flights):,.0f} – ₹{max(f.price for f in valid_flights):,.0f}

Address these points in order:

1. **Historical Fare Range (10-Day Window)**:
   Using your training knowledge of Indian domestic aviation fare patterns over the last 3 years,
   provide the typical fare range for the {origin_city} → {dest_name} route specifically during
   the 10-day window around {date_context} (i.e. the same calendar period in prior years).
   - State the historical low and high as a ₹ range, e.g. "Historically ₹X,XXX – ₹X,XXX for this window."
   - Then compare the current cheapest (₹{cheapest_overall.price:,.0f}) against that range:
     use one of these three labels:
     · **BELOW HISTORICAL RANGE** — current price is unusually cheap, strong buy signal.
     · **WITHIN HISTORICAL RANGE** — current price is normal, no urgency either way.
     · **ABOVE HISTORICAL RANGE** — current price is elevated, advise caution or flexibility.
   - If you have insufficient historical data for this specific route, say so honestly and
     use the broader Indian domestic market range for that calendar period as a fallback,
     clearly labelling it as a market-level estimate rather than route-specific data.

2. **Holiday / Long-weekend check**: Does {date_context} fall on or near any major Indian festival,
   public holiday, or long weekend (Holi, Eid, Ram Navami, Good Friday, Ambedkar Jayanti,
   Baisakhi, Easter, or regional holidays relevant to {origin_city} or {dest_name})?
   If yes, warn explicitly about surge pricing and limited seat availability.
   If no, state clearly that no major holiday pressure is detected in this window.

3. **Booking urgency**: Given the current price of ₹{cheapest_overall.price:,.0f},
   the historical range context from point 1, and the {len(valid_flights)} options visible,
   should the user book now or wait?
   Factor in that Indian domestic fares typically rise 15–25% in the final 7 days before travel.

4. **One-line verdict**: End with a single bold sentence — either **"You can Book now."** or
   **"It is safe to wait X more days."** — directly informed by the historical range label above.

Keep the tone direct, warm, and honest. Write for a cost-conscious Indian traveller.
No generic advice — every rupee figure and historical claim must be grounded in real data
or clearly labelled as an estimate.
"""

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_id,
                contents=prompt,
            )
            return response.text

        except Exception as e:
            print(f"❌ Gemini Error: {e}")
            return "AI trend and holiday analysis is currently unavailable."