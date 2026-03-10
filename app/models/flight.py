from pydantic import BaseModel, Field
from typing import List, Optional


class FlightOption(BaseModel):
    # Route
    origin: str
    origin_name: str = ""
    destination: str
    destination_name: str = ""

    # Pricing
    price: float

    # Airline
    airline: str

    # Timing — now populated from scraped aria text
    departure_date: str          # Date string YYYY-MM-DD (from search input)
    departure_time: str = ""     # e.g. "9:00 AM"  — scraped from aria label
    arrival_time: str = ""       # e.g. "11:10 AM" — scraped from aria label
    duration: str = ""           # e.g. "2 hr 10 min" — scraped from aria label
    stops: str = "Unknown"       # e.g. "Nonstop", "1 stop" — scraped from aria label

    # UI flag
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