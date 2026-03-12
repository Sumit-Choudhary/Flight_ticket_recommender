import asyncio
import os
from typing import Dict, List, Optional, Tuple

from amadeus import Client, Location, ResponseError
from dotenv import load_dotenv

load_dotenv()


class AirportService:
    def __init__(self):
        self.amadeus = Client(
            client_id=os.getenv("AMADEUS_CLIENT_ID"),
            client_secret=os.getenv("AMADEUS_CLIENT_SECRET"),
        )

    async def get_city_info(
        self, cityName: str
    ) -> Tuple[Optional[str], Optional[float], Optional[float]]:
        """
        Resolves any city name or IATA code to (iata, lat, lon).

        Three-layer fallback — each layer only runs if the previous returns nothing:

          Layer 1 — reference_data.locations (CITY then AIRPORT subType)
                    Fast, returns IATA code directly. Works for all cities
                    that have their own airport (Pune → PNQ, Patna → PAT).

          Layer 2 — reference_data.locations.cities
                    Broader geocoding — covers cities with no airport of their
                    own (Dumka, Darbhanga, Bikaner etc.). Returns lat/lon but
                    no IATA code. The caller (_resolve_destination) then calls
                    get_nearby_airports() on these coords to find the closest
                    airport — e.g. Dumka → lat/lon → IXR (Ranchi, 100km away).

          Layer 3 — AIRPORT subType keyword search
                    Last resort if the user typed a raw IATA code like "PNQ"
                    that doesn't appear as a city entry in either of the above.

        Returns (iata, lat, lon).
          - iata is None  when resolved via Layer 2 (no-airport city) —
            caller uses nearby airports from coordinates instead.
          - All three None on complete failure.
        """
        # ── Layer 1: standard city/airport location search ────────────────────
        result = await self._search_locations(cityName, Location.CITY)
        if not result:
            result = await self._search_locations(cityName, Location.AIRPORT)

        if result:
            iata, lat, lon = result
            print(f"   📌 [L1] Amadeus matched '{cityName}' → lat={lat}, lon={lon} (IATA: {iata})")
            return iata, lat, lon

        # ── Layer 2: cities API — covers non-airport cities ───────────────────
        # reference_data.locations.cities returns geoCode for any city,
        # even those with no commercial airport.
        print(f"   🔍 [L2] No airport-city match for '{cityName}' — trying Cities API...")
        lat, lon = await self._search_cities_api(cityName)

        if lat and lon:
            print(f"   📌 [L2] Cities API matched '{cityName}' → lat={lat}, lon={lon} "
                  f"(no direct airport — nearest will be found from coords)")
            return None, lat, lon   # iata=None intentionally; caller uses coords

        # ── Layer 3: raw IATA code typed by user (e.g. "PNQ") ─────────────────
        print(f"   🔍 [L3] Trying raw IATA lookup for '{cityName}'...")
        result = await self._search_locations(cityName, Location.AIRPORT)
        if result:
            iata, lat, lon = result
            print(f"   📌 [L3] IATA match: '{cityName}' → {iata} lat={lat}, lon={lon}")
            return iata, lat, lon

        print(f"⚠️ All three lookup layers failed for: '{cityName}'")
        return None, None, None

    async def _search_locations(
        self, keyword: str, sub_type: str
    ) -> Optional[Tuple[Optional[str], float, float]]:
        """
        Queries reference_data.locations for a keyword + subType.
        Returns (iata, lat, lon) of the best match, or None if no results.
        """
        try:
            response = await asyncio.to_thread(
                self.amadeus.reference_data.locations.get,
                keyword=keyword,
                subType=sub_type,
            )
            if not response.data:
                return None

            best = _best_match(response.data, keyword)
            geo  = best.get("geoCode", {})
            lat  = geo.get("latitude")
            lon  = geo.get("longitude")

            if lat and lon:
                return best.get("iataCode"), lat, lon

            return None

        except ResponseError:
            return None

    async def _search_cities_api(
        self, cityName: str
    ) -> Tuple[Optional[float], Optional[float]]:
        """
        Queries the Amadeus Cities API (reference_data.locations.cities).
        This endpoint covers cities that have no airport of their own —
        it returns geocoordinates so we can find the nearest airport from them.

        Returns (lat, lon) or (None, None).
        """
        try:
            response = await asyncio.to_thread(
                self.amadeus.reference_data.locations.cities.get,
                keyword=cityName,
                max=5,
            )
            if not response.data:
                return None, None

            best = _best_match(response.data, cityName)
            geo  = best.get("geoCode", {})
            lat  = geo.get("latitude")
            lon  = geo.get("longitude")

            return (lat, lon) if lat and lon else (None, None)

        except ResponseError as e:
            print(f"   ⚠️ Cities API error for '{cityName}': {e}")
            return None, None

    async def get_city_coordinates(
        self, cityName: str
    ) -> Tuple[Optional[float], Optional[float]]:
        """Backward-compatible wrapper — prefer get_city_info() for new code."""
        _, lat, lon = await self.get_city_info(cityName)
        return lat, lon

    async def get_nearby_airports(
        self, lat: float, lon: float, radius: int = 200
    ) -> List[Dict[str, str]]:
        """
        Finds airports within `radius` km of the given coordinates.
        Returns up to 5 results as [{"iata": "...", "name": "..."}, ...].
        Default 200 km — wide regional net; catches Pune→Mumbai (148 km),
        Delhi→Agra etc. For non-airport cities (Layer 2 fallback),
        this is how the nearest airport is resolved — e.g. Dumka → IXR (Ranchi ~100km).
        """
        try:
            response = await asyncio.to_thread(
                self.amadeus.reference_data.locations.airports.get,
                latitude=lat,
                longitude=lon,
                radius=radius,
            )

            airports = []
            for item in response.data:
                iata = item.get("iataCode")
                if not iata:
                    continue
                name = item.get("name") or iata
                airports.append({"iata": iata, "name": name})

            return airports[:5]

        except ResponseError as e:
            print(f"❌ Amadeus Nearby Airports Error: {e}")
            return []

    async def get_airport_details(self, iata_code: str) -> str:
        """
        Converts an IATA code to its full airport name.
        Returns the iata_code unchanged if lookup fails.
        """
        try:
            response = await asyncio.to_thread(
                self.amadeus.reference_data.locations.get,
                keyword=iata_code,
                subType=Location.AIRPORT,
            )

            if response.data:
                for loc in response.data:
                    if loc.get("iataCode") == iata_code.upper():
                        return loc.get("name") or iata_code

            return iata_code

        except ResponseError:
            return iata_code


# ── Helpers ───────────────────────────────────────────────────────────────────

def _best_match(results: list, query: str) -> dict:
    """
    Picks the best Amadeus result for a city name query.

    Scores results by name similarity to avoid false positives —
    e.g. "Patna" matching a suburb near Kolkata before the actual city.

      +3  exact name match (case-insensitive)
      +2  name starts with the query
      +1  query is contained in the name
       0  fallback to Amadeus relevance order (index 0)
    """
    query_lower = query.strip().lower()
    best_result = results[0]
    best_score  = -1

    for result in results:
        name  = (result.get("name") or result.get("detailedName") or "").lower()
        score = 0
        if name == query_lower:
            score = 3
        elif name.startswith(query_lower):
            score = 2
        elif query_lower in name:
            score = 1

        if score > best_score:
            best_score  = score
            best_result = result

    return best_result