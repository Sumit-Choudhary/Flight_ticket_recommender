"""
FlightPriceService — Active flight pricing service used by travel_graph.py.

Fetches live flight offers from Amadeus and returns them as FlightOption objects.
Currency is requested as INR; manual conversion handles Test API quirks.

NOTE on is_nearby:
  FlightOption.is_nearby is NOT set here — it defaults to False.
  The caller (travel_graph.py / node_scrape) is responsible for setting
  is_nearby=True when the origin IATA is not the user's primary airport.
  Example:
      flights = await flight_svc.get_prices(iata, dest, date)
      if iata != primary_iata:
          flights = [f.model_copy(update={"is_nearby": True}) for f in flights]
"""

import asyncio
import os
from typing import List

from amadeus import Client, ResponseError
from dotenv import load_dotenv

from app.models.flight import FlightOption

# FIX: module-level load — no need to call on every instantiation
load_dotenv()


class FlightPriceService:
    def __init__(self):
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

        # Mapping IATA airline codes → full names for Gemini's AI context
        # FIX: Removed duplicate "GP" key (was silently keeping only the last entry)
        self.airline_map = {
            "AI": "Air India",
            "6E": "IndiGo",
            "UK": "Vistara",
            "QP": "Akasa Air",
            "SG": "SpiceJet",
            "GP": "APG Airlines",
            "IX": "Air India Express",
            "G8": "Go First",
        }

    async def get_prices(
        self, origin: str, destination: str, date: str
    ) -> List[FlightOption]:
        """
        Fetches one-way flight offers from Amadeus for a given route and date.
        Prices are requested in INR; manual conversion handles Test API overrides.

        Args:
            origin:      Origin IATA code (e.g. "PNQ")
            destination: Destination IATA code (e.g. "CCU")
            date:        Travel date in YYYY-MM-DD format

        Returns:
            List of FlightOption objects (empty list on error or no results).
        """
        try:
            # FIX: asyncio.to_thread — Amadeus SDK is synchronous/blocking.
            # Without this, every API call freezes the FastAPI event loop.
            response = await asyncio.to_thread(
                self.amadeus.shopping.flight_offers_search.get,
                originLocationCode=origin,
                destinationLocationCode=destination,
                departureDate=date,
                adults=1,
                currencyCode="INR",  # Test API may still return EUR/USD — handled below
            )

            flights = []
            for offer in response.data:
                # FIX: Per-offer try/except — one malformed offer no longer
                # silently aborts processing of all remaining offers
                try:
                    # 1. Price extraction with safe access
                    # FIX: .get() guards against missing 'price' subkeys
                    price_block = offer.get("price", {})
                    raw_price_str = price_block.get("total")
                    if raw_price_str is None:
                        print(f"⚠️ Skipping offer — missing price.total")
                        continue
                    raw_price = float(raw_price_str)

                    # 2. Currency conversion
                    # TODO: Replace hardcoded rates with a live FX API call
                    # (e.g. frankfurter.app) for production accuracy.
                    currency = price_block.get("currency", "INR")
                    if currency == "EUR":
                        final_price = raw_price * 90   # Approximate EUR → INR
                    elif currency == "USD":
                        final_price = raw_price * 83   # Approximate USD → INR
                    else:
                        final_price = raw_price        # Already INR (or unknown)

                    # 3. Airline name with safe access
                    # FIX: Guard against missing/empty validatingAirlineCodes
                    airline_codes = offer.get("validatingAirlineCodes", [])
                    raw_airline = airline_codes[0] if airline_codes else "Unknown"
                    airline_name = self.airline_map.get(raw_airline, raw_airline)

                    # 4. Departure datetime with safe access
                    try:
                        departure_at = (
                            offer["itineraries"][0]["segments"][0]["departure"]["at"]
                        )
                    except (KeyError, IndexError):
                        departure_at = date  # Fall back to search date if missing
                        print(f"⚠️ Missing departure time for {origin}→{destination}, using date.")

                    flights.append(
                        FlightOption(
                            origin=origin,
                            destination=destination,
                            price=round(final_price, 2),
                            airline=airline_name,
                            departure_date=departure_at,
                            # is_nearby intentionally left as default (False)
                            # — caller sets it based on whether this IATA is primary
                        )
                    )

                except (KeyError, IndexError, ValueError) as e:
                    print(f"⚠️ Skipping malformed offer from {origin}→{destination}: {e}")
                    continue

            print(f"✅ FlightPriceService: {len(flights)} flights found for {origin}→{destination}")
            return flights

        except ResponseError as e:
            print(f"❌ Amadeus Flight Error ({origin}→{destination}): {e}")
            return []