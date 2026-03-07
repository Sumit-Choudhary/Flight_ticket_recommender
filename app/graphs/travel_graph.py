import os
import operator
from typing import Annotated, List, TypedDict, Dict
from dotenv import load_dotenv
from langgraph.graph import StateGraph, END

load_dotenv()

from app.graphs.state import TravelState
from app.services.airport_service import AirportService
from app.services.flight_service import FlightPriceService
from app.services.gemini_service import GeminiService

# Init Services
airport_svc = AirportService()
flight_svc = FlightPriceService()
gemini_svc = GeminiService()

async def find_nearby_airports_node(state: TravelState):
    """
    
    Step 1: Convert City Names (Kolkata) to IATA Codes (CCU).
    """
    dest_input = state["dest_city"].strip()
    
    # 1. Normalize Destination (Name -> IATA)
    if len(dest_input) == 3 :
        # It's already an IATA code
        dest_iata = dest_input
        dest_full_name = await airport_svc.get_airport_details(dest_iata)
    else:
        # It's a city name! We must find its IATA code
        lat, lon = await airport_svc.get_city_coordinates(dest_input)
        if lat:
            # Look for the primary airport in that city
            nearby = await airport_svc.get_nearby_airports(lat, lon)
            if nearby:
                dest_iata = nearby[0]['iata']
                dest_full_name = nearby[0]['name']
            else:
                dest_iata = dest_input # Fallback
                dest_full_name = dest_input
        else:
            dest_iata = dest_input
            dest_full_name = dest_input
    
    

    # --- 2. Normalize Origin ---
    origin_input = state["origin_city"]
    lat, lon = await airport_svc.get_city_coordinates(origin_input)
    
    # Fallback to Pune coordinates if lookup fails
    if lat is None: lat, lon = 18.5204, 73.8567
    
    # Get all airports near the origin
    airport_data = await airport_svc.get_nearby_airports(lat, lon)
    if not airport_data:
        airport_data = [{"iata": "PNQ", "name": "Pune Airport"}]

    name_map = {a['iata']: a['name'] for a in airport_data}
    iata_list = [a['iata'] for a in airport_data]
    
    return {
        "dest_city": dest_iata,          # Save the IATA here for the Flight Service
        "origin_airports": iata_list,
        "airport_names": name_map,
        "dest_full_name": dest_full_name,
        "origin_lat": lat,
        "origin_lon": lon,
        "status": f"Searching from {len(iata_list)} airports to {dest_full_name}."
    }

async def fetch_all_prices_node(state: TravelState):
    """Step 2: Fetch flights for all discovered airport codes."""
    new_flights = []
    name_map = state.get("airport_names", {})
    dest_name = state.get("dest_full_name", state["dest_city"])
    
    for iata in state["origin_airports"]:
        try:
            # We now use the normalized dest_city (the IATA code)
            flights = await flight_svc.get_prices(
                origin=iata,
                destination=state["dest_city"], 
                date=state["date"]
            )
            for f in flights:
                f.origin_name = name_map.get(iata, iata)
                f.destination_name = dest_name
                
                # 1. Strip whitespace and use case-insensitive check
                clean_origin_city = state["origin_city"].strip().lower()
                clean_airport_name = f.origin_name.lower()
                
                # 2. If the user's city name IS found in the airport name, it's NOT nearby
                if clean_origin_city in clean_airport_name:
                    f.is_nearby = False
                else:
                    f.is_nearby = True
                    
                new_flights.append(f)
        except Exception as e:
            print(f"⚠️ Error fetching {iata}: {e}")
            
    return {"collected_flights": new_flights}

async def ai_recommendation_node(state: TravelState):
    """Step 3: Final AI Analysis with proper city/airport names."""
    recommendation = await gemini_svc.get_recommendation(
        origin_city=state["origin_city"],
        dest_name=state["dest_full_name"],
        flights=state["collected_flights"]
    )
    return {"final_recommendation": recommendation}

# --- Build Workflow ---
workflow = StateGraph(TravelState)
workflow.add_node("find_airports", find_nearby_airports_node)
workflow.add_node("fetch_flights", fetch_all_prices_node)
workflow.add_node("generate_insight", ai_recommendation_node)

workflow.set_entry_point("find_airports")
workflow.add_edge("find_airports", "fetch_flights")
workflow.add_edge("fetch_flights", "generate_insight")
workflow.add_edge("generate_insight", END)

travel_app = workflow.compile()