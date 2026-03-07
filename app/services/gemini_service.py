import os
from google import genai
from app.models.flight import FlightOption
from dotenv import load_dotenv

class GeminiService:
    def __init__(self):
        load_dotenv()
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("❌ GEMINI_API_KEY is missing! Check your .env file and load_dotenv().")
        
        self.client = genai.Client(api_key=api_key)
        # Switching to your preferred reliable model
        self.model_id = "gemini-2.5-flash"

    async def get_recommendation(self, origin_city: str, dest_name: str, flights: list[FlightOption]):
        if not flights:
            return f"No flights found from {origin_city} to {dest_name}."

        # 1. Identify the absolute cheapest flight from the list
        # We filter for price > 0 just to be safe
        cheapest_flight = min(flights, key=lambda x: x.price)
        cheapest_price = cheapest_flight.price
        cheapest_airport = cheapest_flight.origin_name

        # 2. Format the list for Gemini's context
        flight_summary = "\n".join([
            f"- {f.airline}: {f.origin_name} to {f.destination_name} at ₹{f.price} "
            f"({'Nearby Airport' if f.is_nearby else 'Direct City Airport'})"
            for f in flights[:10] # Top 10 options
        ])

        # 3. Enhanced Prompt
        prompt = f"""
        Namaste! You are 'Gemini', a witty Indian Travel Assistant.
        The user, is traveling from {origin_city} to {dest_name}.
        
        The absolute cheapest option found by the system is ₹{cheapest_price} via {cheapest_airport}.
        
        Here is the full list of options:
        {flight_summary}
        
        Task:
        1. Acknowledge the cheapest option specifically (₹{cheapest_price}).
        2. Compare the convenience of {origin_city} airport vs. nearby options.
        3. Provide one clever travel tip for an Indian traveler.
        
        Keep it warm, brief, and use bullet points.
        """

        try:
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=prompt,
                
            )
            return response.text
        except Exception as e:
            print(f"❌ Gemini Error: {e}")
            return "Insight unavailable, but the prices are listed below!"