import asyncio
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async

async def scrape_google_flights(origin_code, dest_code, travel_date):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Use a real-world viewport and user agent
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()
        await stealth_async(page)

        # Google Flights direct URL
        url = f"https://www.google.com/travel/flights?q=Flights%20to%20{dest_code}%20from%20{origin_code}%20on%20{travel_date}%20oneway"
        
        try:
            await page.goto(url, wait_until="networkidle")
            # Wait for the flight result list to appear
            await page.wait_for_selector('li.pIav2d', timeout=15000)

            # Scroll a bit to ensure all 'Top flights' are rendered
            await page.mouse.wheel(0, 1000)
            await asyncio.sleep(1)

            flight_elements = await page.query_selector_all('li.pIav2d')
            all_flights = []

            for row in flight_elements:
                # Extract text for parsing
                text_content = await row.inner_text()
                lines = text_content.split('\n')
                
                # Logic to map Google's UI to your JSON fields
                # Note: Google's structure usually puts Price and Airline in specific positions
                try:
                    # Look for the currency symbol to find the price
                    price_line = [l for l in lines if '₹' in l][0]
                    price_val = int(''.join(filter(str.isdigit, price_line)))
                    
                    # Airline is usually the first or second line
                    airline_name = lines[0] if "Details" not in lines[0] else lines[1]

                    all_flights.append({
                        "airline": airline_name,
                        "price": price_val,
                        "origin_name": origin_code,
                        "destination_name": dest_code,
                        "departure_date": travel_date,
                        "is_nearby": False
                    })
                except Exception:
                    continue # Skip if row is an ad or malformed

            return all_flights

        except Exception as e:
            print(f"Scraping Error: {e}")
            return []
        finally:
            await browser.close()