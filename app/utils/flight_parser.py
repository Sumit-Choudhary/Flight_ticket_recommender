"""
app/utils/flight_parser.py

Responsible for extracting structured FlightOption data from a single
Google Flights aria-label string.

Kept separate from travel_graph.py so:
  - regex patterns can be tested and updated in isolation
  - new fields (e.g. booking URL) can be added here without touching graph logic
  - unit tests can import this without pulling in Playwright or LangGraph
"""

import re
from typing import Optional
from app.models.flight import FlightOption


# ── Compiled regex patterns — compiled once at import, not per-call ──────────

_PRICE_RE    = re.compile(r"From ([\d,]+) Indian rupees")
_AIRLINE_RE  = re.compile(r"(Nonstop|\d+ stops?) flight with (.*?)\.")
# Duration: trailing period optional — some aria texts go straight to "Select flight"
_DURATION_RE = re.compile(r"Total duration ([\d\w\s]+?)(?:\.|  Select| Select|$)")

# Time extraction strategy — extract ALL time values from the aria text,
# then take first = departure, second = arrival.
#
# Why not use positional patterns like "Leaves .+? at HH:MM AM"?
# Google's aria-label format varies across locales and UI versions:
#   "Leaves Airport at 9:00 AM on..."      ← what we originally assumed
#   "Departs Airport, 9:00 AM, Tuesday..." ← comma-separated variant
#   "9:00 AM – 12:00 PM. Leaves..."        ← time-first variant
#   "09:00 on Tuesday..."                  ← 24hr format (no AM/PM)
#
# The only invariant across all variants: departure time is always the
# FIRST time value in the string, arrival is always the SECOND.
# Extracting all times and taking [0] / [1] is robust to all formats.
_ALL_TIMES_RE = re.compile(r"\b(\d{1,2}:\d{2}(?:\s?[AP]M)?)\b", re.IGNORECASE)


def parse_aria_text(
    aria_text: str,
    origin_iata: str,
    dest_iata: str,
    primary_origin: str,
    primary_dest: str,
    departure_date: str,
    airport_names: dict,
    debug: bool = False,
) -> Optional[FlightOption]:
    """
    Parses a single Google Flights aria-label string into a FlightOption.

    Returns None if the aria text does not contain the minimum required fields
    (price + airline). Timing fields (departure_time, arrival_time, duration)
    gracefully degrade to empty string if the pattern doesn't match — the UI
    shows '—' placeholders rather than crashing.

    Args:
        aria_text      : raw aria-label string from the DOM element
        origin_iata    : IATA code of the origin airport for this scrape pair
        dest_iata      : IATA code of the destination airport for this scrape pair
        primary_origin : primary origin IATA (first in origin_airports list)
        primary_dest   : primary destination IATA (state["dest_city"])
        departure_date : search date string YYYY-MM-DD
        airport_names  : dict mapping IATA → full airport name
        debug          : if True, print the raw aria_text for diagnosis

    Returns:
        FlightOption or None
    """
    if debug:
        print(f"   🔎 ARIA SAMPLE: {aria_text[:180]}")

    price_match   = _PRICE_RE.search(aria_text)
    airline_match = _AIRLINE_RE.search(aria_text)

    # Price and airline are mandatory — everything else degrades gracefully
    if not price_match or not airline_match:
        return None

    # Extract all time values — first = departure, second = arrival
    times          = _ALL_TIMES_RE.findall(aria_text)
    duration_match = _DURATION_RE.search(aria_text)

    try:
        return FlightOption(
            origin           = origin_iata,
            origin_name      = airport_names.get(origin_iata, origin_iata),
            destination      = dest_iata,
            destination_name = airport_names.get(dest_iata, dest_iata),
            price            = float(price_match.group(1).replace(",", "")),
            airline          = airline_match.group(2).strip(),
            stops            = airline_match.group(1).strip(),
            departure_date   = departure_date,
            departure_time   = times[0].strip() if len(times) > 0 else "",
            arrival_time     = times[1].strip() if len(times) > 1 else "",
            duration         = duration_match.group(1).strip() if duration_match else "",
            is_nearby        = (origin_iata != primary_origin or dest_iata != primary_dest),
        )
    except Exception as e:
        print(f"   ❌ FlightOption construction error: {e}")
        return None