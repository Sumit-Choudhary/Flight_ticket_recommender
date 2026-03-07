from pydantic import BaseModel, Field
from typing import List, Optional

from pydantic import BaseModel

class FlightOption(BaseModel):
    origin: str
    origin_name: str = ""
    destination: str
    destination_name: str = ""
    price: float
    airline: str
    departure_date: str # Required field
    is_nearby: bool = False
    
class SearchRequest(BaseModel):
    """Structure for the user input from the UI."""
    source_city: str = Field(..., description="Name of the city (e.g. Pune)")
    destination_city: str = Field(..., description="Name of the city (e.g. Kolkata)")
    travel_date: str = Field(..., description="Format YYYY-MM-DD")

class FlightRecommendation(BaseModel):
    """The final response sent to the UI."""
    cheapest_flight: Optional[FlightOption] = None
    all_options: List[FlightOption]
    ai_insight: Optional[str] = "AI recommendation is being generated..."
    total_combinations_searched: int