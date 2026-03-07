import os
from typing import List, Tuple, Optional, Dict
from amadeus import Client, ResponseError, Location
from dotenv import load_dotenv

class AirportService:
    def __init__(self):
        load_dotenv()
        self.amadeus = Client(
            client_id=os.getenv("AMADEUS_CLIENT_ID"),
            client_secret=os.getenv("AMADEUS_CLIENT_SECRET")
        )

    async def get_city_coordinates(self, cityName: str) -> Tuple[Optional[float], Optional[float]]:
        """
        Robust Helper: Finds Lat/Lon for either a City name or an IATA code.
        """
        try:
            # 1. Try searching as a CITY first
            response = self.amadeus.reference_data.locations.get(
                keyword=cityName,
                subType=Location.CITY
            )
            
            # 2. If no city found, try searching as an AIRPORT (in case user typed 'PNQ')
            if not response.data:
                response = self.amadeus.reference_data.locations.get(
                    keyword=cityName,
                    subType=Location.AIRPORT
                )

            if response.data:
                geo = response.data[0].get('geoCode', {})
                return geo.get('latitude'), geo.get('longitude')
            
            print(f"⚠️ No coordinates found for {cityName}")
            return None, None
        except ResponseError as e:
            print(f"❌ Amadeus Geo Error: {e}")
            return None, None

    async def get_nearby_airports(self, lat: float, lon: float) -> List[Dict[str, str]]:
        """Finds airports within a 500km radius using Amadeus."""
        try:
            response = self.amadeus.reference_data.locations.airports.get(
                latitude=lat,
                longitude=lon
            )
            
            airports = []
            for item in response.data:
                # Filter out entries without IATA codes
                if item.get("iataCode"):
                    airports.append({
                        "iata": item.get("iataCode"),
                        "name": item.get("name")
                    })
            # Sorting by relevance is handled by Amadeus; we take the top 5
            return airports[:5]
        except ResponseError as e:
            print(f"❌ Amadeus Nearby Error: {e}")
            return []

    async def get_airport_details(self, iata_code: str) -> str:
        """Converts IATA (CCU) to Full Name (Netaji Subhash Chandra Bose)."""
        try:
            response = self.amadeus.reference_data.locations.get(
                keyword=iata_code,
                subType=Location.AIRPORT
            )
            
            if response.data:
                for loc in response.data:
                    if loc.get('iataCode') == iata_code.upper():
                        return loc.get('name', iata_code)
            
            return iata_code
        except ResponseError:
            return iata_code