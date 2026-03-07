import requests
import json
from tabulate import tabulate 

def test_search():
    url = "http://127.0.0.1:8000/search"
    # Matching the field names expected by your Pydantic model
    payload = {
        "source_city": "Pune",
        "destination_city": "Kolkata",
        "travel_date": "2026-04-11"
    }

    print(f"🚀 Optimizing travel for {payload['source_city']} to {payload['destination_city']}...")
    response = requests.post(url, json=payload)
    
    if response.status_code == 200:
        data = response.json()
        
        # 1. FIXED: Access "all_options" instead of "collected_flights"
        flights = data.get("all_options", []) 
        if flights:
            print("\n✈️  ALL FLIGHT OPTIONS FOUND:")
            table_data = [
                [f['airline'], f['origin_name'], f['destination_name'], f['departure_date'], f"₹{f['price'],}", "Yes" if f['is_nearby'] else "No"]
                for f in flights
            ]
            headers = ["Airline", "From", "To","Travel Date", "Price", "Nearby?"]
            print(tabulate(table_data, headers=headers, tablefmt="fancy_grid"))
        else:
            print("\n❌ No flight data found in the response.")

        # 2. FIXED: Access "ai_insight" instead of "final_recommendation"
        print("\n🤖 Gemini's Insight:")
        print("-" * 30)
        print(data.get("ai_insight", "No insight generated."))

if __name__ == "__main__":
    test_search()