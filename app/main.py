from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
import traceback
import sys

# Internal Imports
from app.models.flight import SearchRequest, FlightRecommendation, FlightOption
from app.graphs.travel_graph import travel_app
from app.services.gemini_service import GeminiService
from typing import List

gemini_svc = GeminiService()

app = FastAPI(title="Gemini Travel AI")

# --- CORS Setup (required for React frontend on a different port) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/search", response_model=FlightRecommendation)
async def search_flights(request: SearchRequest):
    """
    Main entry point for the travel agent.
    Maps UI request -> LangGraph state -> FlightRecommendation response.
    """

    # 1. Build the initial LangGraph state.
    #    Every key declared in TravelState must be seeded here to avoid
    #    TypedDict key errors during strict state validation by LangGraph.
    initial_state = {
        # User inputs
        "origin_city": request.source_city,
        "dest_city": request.destination_city,
        "date": request.travel_date,

        # Geolocation — seeded as None, populated by node_airports via
        # airport_svc.get_city_coordinates()
        "origin_lat": None,
        "origin_lon": None,

        # Airport IATA lists — populated by node_airports
        "origin_airports": [],

        # dest_airports — seeded as [], populated by node_airports
        # with nearby destination airports found via _resolve_destination().
        "dest_airports": [],

        # iata -> full name map — populated by node_airports, read by node_scrape.
        # Seeded here so node_scrape never hits a missing key if node_airports
        # fails or returns early.
        "airport_names": {},

        # collected_flights uses operator.add reducer in TravelState:
        # LangGraph concatenates each node's returned list onto this seed [].
        # Always seed as empty list; never pre-populate.
        "collected_flights": [],

        # AI output — populated by final_insight_node
        "final_recommendation": "",

        # dest_full_name — overwritten by node_airports from raw city input
        "dest_full_name": "",

        # Status string for logging / future UI progress bar support
        "status": "Initiating search...",
    }

    # 2. Execute the LangGraph pipeline.
    #    Single try/except — avoids the double-wrap bug where an inner
    #    HTTPException was caught and re-raised by an outer handler,
    #    losing the original error detail.
    try:
        print(f"Starting search: {request.source_city} -> {request.destination_city} on {request.travel_date}")
        final_state = await travel_app.ainvoke(initial_state)
        print("Graph execution completed.")

    except Exception as e:
        exc_type, exc_value, exc_traceback = sys.exc_info()
        error_details = traceback.format_exception(exc_type, exc_value, exc_traceback)

        print("-" * 60)
        print("CRITICAL ERROR during Graph Execution:")
        print(f"   Type    : {exc_type.__name__}")
        print(f"   Message : {str(e)}")
        print("-" * 60)
        print("".join(error_details))
        print("-" * 60)

        raise HTTPException(
            status_code=500,
            detail=f"Graph execution failed: {exc_type.__name__} - {str(e)}"
        )

    # 3. Extract results from the completed graph state.
    flights = final_state.get("collected_flights", [])

    # 4. Handle empty results gracefully — not an error, just no flights found.
    if not flights:
        return FlightRecommendation(
            cheapest_flight=None,
            all_options=[],
            total_combinations_searched=0,
            ai_insight="No flights were found for the selected route."
        )

    # 5. Filter out zero-price results before selecting cheapest.
    #    Amadeus Test API occasionally returns offers with price=0.0 which
    #    would produce a misleading "cheapest flight" in the UI.
    valid_flights = [f for f in flights if f.price > 0]
    cheapest = min(valid_flights, key=lambda x: x.price) if valid_flights else flights[0]

    # 6. Build and return the final response.
    return FlightRecommendation(
        cheapest_flight=cheapest,
        all_options=flights,
        ai_insight=final_state.get("final_recommendation") or "AI insight unavailable.",
        total_combinations_searched=len(flights)
    )


# ── Chat request model ───────────────────────────────────────────────────────
class ChatTurn(BaseModel):
    role: str   # "user" or "model"
    text: str

class ChatRequest(BaseModel):
    message:     str
    history:     List[ChatTurn] = []
    flights:     List[FlightOption] = []
    origin_city: str = ""
    dest_name:   str = ""

class ChatResponse(BaseModel):
    reply: str


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Single-turn chat endpoint — stateless on the backend.
    The frontend sends the full conversation history on every call
    so Gemini has multi-turn context without server-side session state.
    """
    try:
        history = [{"role": t.role, "text": t.text} for t in request.history]
        reply = await gemini_svc.chat_response(
            user_message = request.message,
            history      = history,
            origin_city  = request.origin_city,
            dest_name    = request.dest_name,
            flights      = request.flights,
        )
        return ChatResponse(reply=reply)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)