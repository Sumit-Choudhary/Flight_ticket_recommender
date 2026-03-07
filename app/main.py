from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Internal Imports
from app.models.flight import SearchRequest, FlightRecommendation
from app.graphs.travel_graph import travel_app

app = FastAPI(title="Gemini Travel AI - Amadeus Edition")

# --- CORS Setup (Crucial for Frontend) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/search", response_model=FlightRecommendation)
async def search_flights(request: SearchRequest):
    """
    The main entry point for the travel agent.
    Maps UI request to LangGraph state.
    """
    try:
        # 1. Initialize the State for LangGraph
        initial_state = {
            "origin_city": request.source_city,
            "dest_city": request.destination_city,
            "date": request.travel_date,
            "collected_flights": [], # operator.add will handle the appending
            "origin_airports": [],
            "dest_airports": [],
            "final_recommendation": "",
            "status": "Initiating search...",
            "dest_full_name": ""
        }

        # 2. Execute the Graph
        # We use await because our nodes (Amadeus/Gemini) are async
        final_state = await travel_app.ainvoke(initial_state)

        # 3. Process Results for the UI
        flights = final_state.get("collected_flights", [])
        
        if not flights:
            return FlightRecommendation(
                all_options=[],
                total_combinations_searched=0,
                ai_insight="No flights were found for the selected route in the test database."
            )

        # 4. Identify the cheapest option for the response_model
        cheapest = min(flights, key=lambda x: x.price)

        return FlightRecommendation(
            cheapest_flight=cheapest,
            all_options=flights,
            ai_insight=final_state.get("final_recommendation"),
            total_combinations_searched=len(flights)
        )

    except Exception as e:
        print(f"🔥 Server Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)