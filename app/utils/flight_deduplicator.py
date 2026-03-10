"""
app/utils/flight_deduplicator.py

Deduplicates a list of FlightOption objects collected across multiple
origin × destination scrape pairs.

Why duplicates occur:
  The scraper runs an N × M matrix (e.g. 5 origins × 5 destinations).
  Google Flights sometimes shows the same physical flight on multiple
  route pages — particularly when nearby airports share a hub connection.
  Example: PNQ→CCU and BOM→CCU may both surface the same IndiGo
  connecting flight that stops at BOM, appearing in both result sets.

Deduplication key:
  (airline, origin, destination, departure_time)

  - airline + origin + destination       : identifies the route
  - departure_time                       : distinguishes same-airline
                                           multiple daily flights
  - price is intentionally excluded      : same flight can show
                                           slightly different prices
                                           across scrape pairs due to
                                           dynamic pricing; we keep
                                           the cheaper of the two.

When two flights share the same key, the one with the lower price wins.
If prices are equal, the one with a shorter duration wins (better value).
"""

from typing import List
from app.models.flight import FlightOption


def deduplicate_flights(flights: List[FlightOption]) -> List[FlightOption]:
    """
    Removes duplicate flights from a combined scrape result list.

    Dedup key: (airline, origin, destination, departure_time)
    Tie-break:  lower price wins → shorter duration wins

    Args:
        flights: raw combined list from all scrape pairs

    Returns:
        deduplicated list, preserving relative price order
    """
    seen: dict[tuple, FlightOption] = {}

    for flight in flights:
        key = (
            flight.airline.lower().strip(),
            flight.origin,
            flight.destination,
            flight.departure_time,   # distinguishes multiple daily flights
            flight.departure_date,   # IMPORTANT: keeps same flight on different dates
                                     # separate — critical for date-flexible search
                                     # where Tue/Wed/Thu results are merged together
        )

        if key not in seen:
            seen[key] = flight
        else:
            existing = seen[key]
            # Keep cheaper; on price tie keep shorter duration
            if flight.price < existing.price:
                seen[key] = flight
            elif flight.price == existing.price:
                if _duration_mins(flight.duration) < _duration_mins(existing.duration):
                    seen[key] = flight

    deduped = list(seen.values())

    removed = len(flights) - len(deduped)
    if removed:
        print(f"   🧹 Deduplication: {len(flights)} → {len(deduped)} flights ({removed} duplicates removed)")

    return deduped


def _duration_mins(duration: str) -> int:
    """
    Converts a duration string like '2 hr 10 min' to total minutes.
    Returns a large sentinel value if the string is empty or unparseable
    so that flights with unknown duration are never preferred in tie-breaks.
    """
    if not duration:
        return 9999
    h = int(m.group(1)) if (m := __import__('re').search(r'(\d+)\s*hr',  duration)) else 0
    m = int(m.group(1)) if (m := __import__('re').search(r'(\d+)\s*min', duration)) else 0
    return h * 60 + m