"""
AmadeusService — Backup flight data service.

This service is intentionally kept as a fallback for when FlightPriceService
is unavailable or broken. It is NOT currently wired into travel_graph.py.

To activate it as a fallback:
  1. Import AmadeusService in travel_graph.py
  2. Replace or wrap the FlightPriceService call in node_scrape with a
     try/except that falls back to AmadeusService.fetch_flight_prices()
"""

import asyncio
import os
from typing import Dict, List, Optional

from amadeus import Client, Location, ResponseError
from dotenv import load_dotenv

load_dotenv()


class AmadeusService:
    def __init__(self):
        # FIX: Corrected env var names to match .env file
        # Was: AMADEUS_API_KEY / AMADEUS_API_SECRET
        client_id = os.getenv("AMADEUS_CLIENT_ID")
        client_secret = os.getenv("AMADEUS_CLIENT_SECRET")

        if not client_id or not client_secret:
            raise EnvironmentError(
                "Missing Amadeus credentials. Ensure AMADEUS_CLIENT_ID and "
                "AMADEUS_CLIENT_SECRET are set in your .env file."
            )

        self.amadeus = Client(
            client_id=client_id,
            client_secret=client_secret,
        )

    async def get_city_info(self, city_name: str) -> Optional[Dict]:
        """
        Gets the IATA code and coordinates for a city name.
        Returns {"iata": "PNQ", "lat": 18.58, "lon": 73.91} or None.
        """
        try:
            # FIX: asyncio.to_thread — Amadeus SDK is synchronous/blocking
            response = await asyncio.to_thread(
                self.amadeus.reference_data.locations.get,
                keyword=city_name,
                subType=Location.CITY,
            )

            if not response.data:
                return None

            city_data = response.data[0]

            # FIX: Use .get() with fallbacks — some city entries lack iataCode
            geo = city_data.get("geoCode", {})
            iata = city_data.get("iataCode")
            lat = geo.get("latitude")
            lon = geo.get("longitude")

            if not lat or not lon:
                print(f"⚠️ Incomplete geoCode for city: {city_name}")
                return None

            return {"iata": iata, "lat": lat, "lon": lon}

        except ResponseError as e:
            print(f"❌ AmadeusService.get_city_info error for '{city_name}': {e}")
            return None

    async def get_nearby_airports(
        self, lat: float, lon: float, radius: int = 150
    ) -> List[Dict[str, str]]:
        """
        Finds airports within `radius` km of the given coordinates.

        FIX: Now returns List[Dict] matching AirportService.get_nearby_airports()
        shape: [{"iata": "PNQ", "name": "Pune Airport"}, ...]
        This ensures the fallback is a drop-in replacement without reshaping data.
        """
        try:
            # FIX: asyncio.to_thread — blocking SDK call
            response = await asyncio.to_thread(
                self.amadeus.reference_data.locations.airports.get,
                latitude=lat,
                longitude=lon,
                radius=radius,
            )

            airports = []
            for loc in response.data:
                iata = loc.get("iataCode")
                if not iata:
                    continue
                name = loc.get("name") or iata  # fallback to IATA if name missing
                airports.append({"iata": iata, "name": name})

            return airports[:3]

        except ResponseError as e:
            print(f"❌ AmadeusService.get_nearby_airports error: {e}")
            return []

    async def fetch_flight_prices(
        self, origin: str, destination: str, date: str
    ) -> List[Dict]:
        """
        Core pricing fallback — fetches one-way flight offers for a given
        origin → destination on a specific date.

        Returns a list of dicts compatible with FlightOption fields:
        [{"origin", "destination", "price", "airline", "departure_date"}, ...]

        NOTE: dateWindow='I2D' was removed — it is deprecated in newer SDK
        versions and raises ResponseError on some accounts. If date flexibility
        is needed, call this method for each date variant explicitly.
        """
        try:
            # FIX: asyncio.to_thread — blocking SDK call
            # FIX: Removed deprecated dateWindow='I2D' parameter
            response = await asyncio.to_thread(
                self.amadeus.shopping.flight_offers_search.get,
                originLocationCode=origin,
                destinationLocationCode=destination,
                departureDate=date,
                adults=1,
                oneWay=True,
            )

            flights = []
            for offer in response.data:
                try:
                    price = float(offer["price"]["total"])
                    airline = offer["validatingAirlineCodes"][0]
                    departure_at = (
                        offer["itineraries"][0]["segments"][0]["departure"]["at"]
                    )
                    flights.append({
                        "origin": origin,
                        "destination": destination,
                        "price": price,
                        "airline": airline,
                        "departure_date": departure_at,
                        "is_nearby": False,  # caller can override if needed
                    })
                except (KeyError, IndexError, ValueError) as e:
                    print(f"⚠️ Skipping malformed offer: {e}")
                    continue

            return flights

        except ResponseError as e:
            print(f"❌ AmadeusService.fetch_flight_prices error ({origin}→{destination}): {e}")
            return []