import operator
from typing import Annotated, List, TypedDict, Optional
from app.models.flight import FlightOption

class TravelState(TypedDict):
    # 1. User Inputs (Source, Destination, Date)
    origin_city: str
    dest_city: str
    date: str
    
    # 2. Geolocation Data (Added to pass between Airport and Flight services)
    origin_lat: Optional[float]
    origin_lon: Optional[float]
    
    # 3. Discovered Airport IATA Codes
    origin_airports: List[str]      # e.g. ["PNQ", "BOM", "CSK"]
    dest_airports: List[str]        # Primary destination, e.g. ["CCU"]
    
    # 4. Results (Annotated with operator.add to prevent overwriting during loops)
    collected_flights: Annotated[List[FlightOption], operator.add]
    
    # 5. Final AI Output
    final_recommendation: str
    
    # 6. Status tracking (Optional, good for UI progress bars)
    status: str

    # 7 destination
    dest_full_name: str