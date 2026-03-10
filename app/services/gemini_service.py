"""
GeminiService — Generates AI travel insights using Google Gemini.
Called by final_insight_node in travel_graph.py after flights are collected.
"""

import os
from typing import List

from google import genai
from dotenv import load_dotenv

from app.models.flight import FlightOption

load_dotenv()


class GeminiService:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("❌ GEMINI_API_KEY is missing! Check your .env file.")

        self.client = genai.Client(api_key=api_key)

        # Updated to gemini-2.5-flash — gemini-2.0-flash is no longer available
        # to new users as of March 2026.
        self.model_id = "gemini-2.5-flash"

    def _build_flight_context(
        self,
        origin_city: str,
        dest_name: str,
        flights: List[FlightOption],
    ) -> str:
        """
        Builds a structured plain-text summary of all flight options.
        Used as the grounding context for both the insight report and the chatbot.
        Extracted here so both methods share identical flight data representation.
        """
        valid_flights = [f for f in flights if f.price > 0]
        if not valid_flights:
            return "No valid flight data available."

        primary_flight = next((f for f in valid_flights if not f.is_nearby), valid_flights[0])
        primary_origin = primary_flight.origin
        primary_dest   = primary_flight.destination

        exact      = [f for f in valid_flights if f.origin == primary_origin and f.destination == primary_dest]
        alt_origin = [f for f in valid_flights if f.origin != primary_origin and f.destination == primary_dest]
        alt_dest   = [f for f in valid_flights if f.origin == primary_origin and f.destination != primary_dest]
        alt_both   = [f for f in valid_flights if f.origin != primary_origin and f.destination != primary_dest]

        cheapest_overall  = min(valid_flights, key=lambda x: x.price)
        cheapest_exact    = min(exact,      key=lambda x: x.price) if exact      else None
        cheapest_origin   = min(alt_origin, key=lambda x: x.price) if alt_origin else None
        cheapest_alt_dest = min(alt_dest,   key=lambda x: x.price) if alt_dest   else None

        def fmt(f: FlightOption) -> str:
            orig = f.origin_name or f.origin
            dest = f.destination_name or f.destination
            time = f" | {f.departure_time}–{f.arrival_time}" if f.departure_time else ""
            dur  = f" | {f.duration}" if f.duration else ""
            stops = f" | {f.stops}" if f.stops else ""
            return f"{f.airline} | {orig} → {dest} | ₹{f.price:,.0f}{time}{dur}{stops}"

        def section(flights_list, label):
            if not flights_list:
                return f"{label}\n  (no options found)\n"
            lines = [f"  • {fmt(f)}" for f in sorted(flights_list, key=lambda x: x.price)[:5]]
            return f"{label}\n" + "\n".join(lines) + "\n"

        summary = (
            section(exact,      f"FROM {primary_origin} → TO {primary_dest} (Direct city pair):") + "\n" +
            section(alt_origin, f"FROM nearby origin → TO {primary_dest} (alt origin):") + "\n" +
            section(alt_dest,   f"FROM {primary_origin} → TO nearby destination (alt dest):") + "\n" +
            section(alt_both,   "FROM nearby origin → TO nearby destination (both alt):")
        )

        cheapest_lines = f"CHEAPEST OVERALL: {fmt(cheapest_overall)}"
        if cheapest_exact:    cheapest_lines += f"\nCHEAPEST EXACT ROUTE: {fmt(cheapest_exact)}"
        if cheapest_origin:   cheapest_lines += f"\nCHEAPEST ALT ORIGIN: {fmt(cheapest_origin)}"
        if cheapest_alt_dest: cheapest_lines += f"\nCHEAPEST ALT DEST: {fmt(cheapest_alt_dest)}"

        return f"""ROUTE: {origin_city} → {dest_name}
DATE(S): {", ".join(sorted(set(f.departure_date for f in valid_flights)))}

FLIGHT OPTIONS:
{summary}
{cheapest_lines}"""

    async def chat_response(
        self,
        user_message: str,
        history: list,
        origin_city: str,
        dest_name: str,
        flights: List[FlightOption],
    ) -> str:
        """
        Answers a user question about the current search results.

        Uses the same flight context as get_recommendation() as a system prompt,
        then appends the full conversation history so Gemini has multi-turn memory.
        History format: [{"role": "user"|"model", "parts": [{"text": "..."}]}]

        Strictly scoped — Gemini is instructed to only answer questions about
        the flights in context and decline off-topic queries.
        """
        if not flights:
            return "No flight data available yet — please run a search first."

        context = self._build_flight_context(origin_city, dest_name, flights)

        system_prompt = f"""You are a focused Indian travel assistant for a flight search app.
You have access to the following flight search results and NOTHING else.
Answer ONLY questions about these specific flights, prices, airports, timings, or travel tips
relevant to this route. If asked anything outside this scope, politely decline and redirect.
Keep answers concise — 2 to 4 sentences unless the user asks for detail.
Use ₹ for prices. Reference specific airlines and times from the data.

{context}"""

        # Build Gemini contents: system context + history + new user message
        contents = [{"role": "user", "parts": [{"text": system_prompt}]},
                    {"role": "model", "parts": [{"text": "Understood. I have the flight data loaded and I'm ready to answer questions about this route."}]}]

        for turn in history:
            contents.append({
                "role": turn["role"],
                "parts": [{"text": turn["text"]}]
            })

        contents.append({"role": "user", "parts": [{"text": user_message}]})

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_id,
                contents=contents,
            )
            return response.text.strip()
        except Exception as e:
            print(f"❌ Gemini Chat Error: {e}")
            return "Sorry, I couldn't process that. Please try again."

    async def get_recommendation(
        self,
        origin_city: str,
        dest_name: str,
        flights: List[FlightOption],
    ) -> str:
        if not flights:
            return f"No flights found from {origin_city} to {dest_name}."

        valid_flights = [f for f in flights if f.price > 0]
        if not valid_flights:
            return "Flights were found but all had invalid pricing data."

        # Reuse shared context builder — same data fed to the chatbot
        flight_data = self._build_flight_context(origin_city, dest_name, flights)

        # ── Build the structured insight prompt ───────────────────────────────
        prompt = f"""
You are a sharp, knowledgeable Indian travel assistant helping a user find the
smartest way to fly from {origin_city} to {dest_name}.

---
{flight_data}
---

Write a structured travel insight report with the following four sections.
Use **markdown headers** for each section. Be specific — reference actual airline
names, airport names, and rupee amounts from the data above. Do not generalise.

## 🏆 Best Price
State the single cheapest option across all combinations. Name the airline,
route, and price. If it involves a nearby airport, say so clearly.

## 🛫 Origin Airport Analysis
Compare flying from {origin_city}'s primary airport vs nearby origin airports.
Calculate the exact rupee saving of the cheapest nearby-origin option vs the
cheapest primary-origin option. Then factor in the tradeoff: a nearby airport
typically adds 1–3 hours of extra travel time and ₹500–1500 in cab/bus costs.
Give a clear recommendation: is the saving worth the extra effort?

## 🛬 Destination Airport Analysis
Compare landing at {dest_name}'s primary airport vs any nearby destination
airports. Calculate the saving. Factor in that a nearby destination airport
means extra ground travel to reach {dest_name} city centre, adding time and
local transport cost. Give a clear recommendation.

## ✅ Smart Pick
Give one final recommended flight — the best balance of price, convenience,
and total door-to-door cost. Name the airline, route, and price.
End with one practical tip specific to this route (e.g. check-in timing,
terminal info, or a known quirk of one of these airports).

Keep the tone warm and confident. Write for a cost-conscious Indian traveller
who values clear, honest advice over marketing fluff.
"""

        try:
            response = await self.client.aio.models.generate_content(
                model=self.model_id,
                contents=prompt,
            )
            return response.text

        except Exception as e:
            print(f"❌ Gemini Error: {e}")
            return "AI insight unavailable — but the prices are listed below!"