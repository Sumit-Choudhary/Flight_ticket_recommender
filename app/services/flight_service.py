from amadeus import Client, ResponseError
import os
from dotenv import load_dotenv
from app.models.flight import FlightOption

class FlightPriceService:
    def __init__(self):
        load_dotenv()
        # Initializes with your Amadeus Credentials
        self.amadeus = Client(
            client_id=os.getenv("AMADEUS_CLIENT_ID"),
            client_secret=os.getenv("AMADEUS_CLIENT_SECRET")
        )
    
        # Mapping common airline codes to full names for Gemini's context
        self.airline_map = {
            "AI": "Air India", 
            "6E": "IndiGo", 
            "UK": "Vistara", 
            "QP": "Akasa Air",
            "SG": "SpiceJet",
            "GP": "APG Airlines",
            "GP": "APG Airlines"
        }

    async def get_prices(self, origin: str, destination: str, date: str):
        """
        Fetches flights from Amadeus and ensures pricing is in INR.
        """
        try:
            # We explicitly request INR, but the Test API sometimes overrides this
            response = self.amadeus.shopping.flight_offers_search.get(
                originLocationCode=origin,
                destinationLocationCode=destination,
                departureDate=date,
                adults=1,
                currencyCode="INR" 
            )
            
            flights = []
            for offer in response.data:
                # 1. Currency Safety Logic
                currency = offer['price'].get('currency', 'INR')
                raw_price = float(offer['price']['total'])
                
                # Manual conversion if the Test API returns foreign currency
                if currency == "EUR":
                    final_price = raw_price * 90  # Rough EUR to INR
                elif currency == "USD":
                    final_price = raw_price * 83  # Rough USD to INR
                else:
                    final_price = raw_price

                # 2. Airline Name Mapping
                raw_airline = offer['validatingAirlineCodes'][0]
                airline_name = self.airline_map.get(raw_airline, raw_airline)
                
                flights.append(
                    FlightOption(
                        origin=origin,
                        destination=destination,
                        price=round(final_price, 2),
                        airline=airline_name,
                        departure_date=offer['itineraries'][0]['segments'][0]['departure']['at']
                    )
                )
            return flights

        except ResponseError as e:
            print(f"❌ Amadeus Flight Error: {e}")
            return []