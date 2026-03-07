import os
from amadeus import Client, ResponseError, Location
from dotenv import load_dotenv

load_dotenv()

class AmadeusService:
    def __init__(self):
        # Initializing the Amadeus client using environment variables
        self.amadeus = Client(
            client_id=os.getenv("AMADEUS_API_KEY"),
            client_secret=os.getenv("AMADEUS_API_SECRET")
        )

    def get_city_info(self, city_name: str):
        """
        Step 1 & 3: Gets the IATA code and coordinates for a city.
        Essential for finding nearby airports.
        """
        try:
            response = self.amadeus.reference_data.locations.get(
                keyword=city_name,
                subType=Location.CITY
            )
            if not response.data:
                return None
            
            # We take the first result as the most relevant
            city_data = response.data[0]
            return {
                "iata": city_data['iataCode'],
                "lat": city_data['geoCode']['latitude'],
                "lon": city_data['geoCode']['longitude']
            }
        except ResponseError as error:
            print(f"Error fetching city info: {error}")
            return None

    def get_nearby_airports(self, lat: float, lon: float):
        """
        Step 3: Uses coordinates to find all airports within 200km.
        """
        try:
            nearby_locations = self.amadeus.reference_data.locations.airports.get(
                latitude=lat,
                longitude=lon,
                radius=200
            )
            # We want unique IATA codes for the flight search
            return [loc['iataCode'] for loc in nearby_locations.data]
        except ResponseError as error:
            print(f"Error fetching nearby airports: {error}")
            return []

    def fetch_flight_prices(self, origin: str, destination: str, date: str):
        """
        Steps 2, 4, 5, 6, & 7: The core pricing logic.
        Uses dateWindow='I2D' to automatically check +/- 2 days.
        """
        try:
            # Note: 'I2D' handles Step 7 (date flexibility) in one call.
            response = self.amadeus.shopping.flight_offers_search.get(
                originLocationCode=origin,
                destinationLocationCode=destination,
                departureDate=date,
                adults=1,
                dateWindow='I2D' 
            )
            
            flights = []
            for offer in response.data:
                flights.append({
                    "origin": origin,
                    "destination": destination,
                    "price": float(offer['price']['total']),
                    "currency": offer['price']['currency'],
                    "airline": offer['validatingAirlineCodes'][0],
                    "departure_date": offer['itineraries'][0]['segments'][0]['departure']['at']
                })
            return flights
        except ResponseError as error:
            print(f"Error fetching prices for {origin}->{destination}: {error}")
            return []