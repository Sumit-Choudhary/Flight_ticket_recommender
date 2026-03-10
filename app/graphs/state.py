import operator
from typing import Annotated, Dict, List, Optional, TypedDict, Union
from app.models.flight import FlightOption


class TravelState(TypedDict):
    # 1. User Inputs
    origin_city: str
    dest_city: str
    date: str

    # 2. Geolocation Data
    # FIX: Use Union[float, None] instead of Optional[float] for correct
    # TypedDict runtime behaviour (Optional is a typing alias but can behave
    # unexpectedly in TypedDict without `from __future__ import annotations`).
    origin_lat: Union[float, None]
    origin_lon: Union[float, None]

    # 3. Discovered Airport IATA Codes
    origin_airports: List[str]   # e.g. ["PNQ", "BOM", "CSK"]
    dest_airports: List[str]     # e.g. ["CCU"]

    # 4. Airport display names  ← FIX: was missing entirely
    # find_nearby_airports_node returns {"airport_names": name_map} and
    # scrape_google_flights_node reads state.get("airport_names", {}).
    # Without this key declared, LangGraph silently drops it on every state
    # update, so origin_name always fell back to the raw IATA code.
    airport_names: Dict[str, str]  # iata -> full name, e.g. {"PNQ": "Pune Airport"}

    # 5. Results
    # operator.add reducer: LangGraph concatenates each node's returned list
    # onto the existing state list rather than replacing it.
    # NOTE: initial_state must seed this as [] so the first concat is clean.
    collected_flights: Annotated[List[FlightOption], operator.add]

    # 6. Final AI Output
    final_recommendation: str

    # 7. Status tracking (used for UI progress bars / server-side logging)
    status: str

    # 8. Destination display name (full city name, set by node_airports)
    dest_full_name: str