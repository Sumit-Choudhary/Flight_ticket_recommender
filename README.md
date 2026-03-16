# ✈️ Navigator — Flight Intelligence App

> AI-powered Indian domestic flight search with real-time streaming, nearby airport optimisation, and Gemini-driven fare analysis.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Frontend Components](#frontend-components)
- [Data Flow](#data-flow)
- [Deployment](#deployment)
- [Known Limitations](#known-limitations)
- [Roadmap](#roadmap)

---

## Overview

Navigator is a full-stack flight intelligence application built for Indian domestic travellers. It goes beyond a standard flight search by:

- **Scraping Google Flights in real time** via Playwright, streaming results to the UI as each origin–destination pair completes
- **Resolving nearby airports automatically** — a search from Pune also checks Mumbai (BOM), a search to Kolkata also checks Bagdogra (IXB), giving you a full price matrix across N origins × M destinations
- **Running a Gemini AI analysis** on the scraped results to surface ground travel cost tradeoffs, historical fare context, holiday surge warnings, and a booking urgency verdict
- **Providing an in-app AI chatbot** scoped to your specific search results so you can ask follow-up questions without leaving the page

---

## Features

| Feature | Description |
|---|---|
| 🔴 **Live streaming search** | Results stream to the UI pair-by-pair via NDJSON — no waiting for all routes to finish |
| 🏙️ **Nearby airport matrix** | Amadeus resolves origin and destination cities to all nearby airports and scrapes every combination |
| 🤖 **Gemini AI insight** | Two-section analysis: ground travel cost tradeoffs + 10-day historical fare range with BELOW / WITHIN / ABOVE verdict |
| 📊 **Fare range bar** | Visual Google Flights-style price range bar showing where the current cheapest fare sits in the historical window |
| 💬 **Contextual chatbot** | Gemini-powered chat scoped to your live search results — asks about timings, alternatives, layovers |
| 📅 **±3 day flex search** | Searches all 7 dates around your target date and aggregates results across the full window |
| 🧮 **Cost calculator** | Select any flight to calculate total trip cost including ground transport, hotel estimate, and FX conversion |
| ⭐ **Recommended picks** | Auto-surfaced best overall price and best price from your primary origin |
| 🔄 **Deduplication** | Cross-pair duplicate flights are merged, keeping the lowest price seen for each unique flight |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                           │
│  NavigatorUI → ResultsGrid / InsightSidebar / FlightChatbot    │
└────────────────────────┬────────────────────────────────────────┘
                         │  HTTP (fetch, NDJSON stream)
┌────────────────────────▼────────────────────────────────────────┐
│                      FastAPI Backend                            │
│   GET /search/stream   POST /insight   POST /chat              │
└──────┬──────────────────────┬──────────────────────────────────┘
       │                      │
┌──────▼──────┐      ┌────────▼────────┐
│  LangGraph  │      │  GeminiService  │
│  Pipeline   │      │  gemini-2.5-    │
│             │      │  flash          │
│ ┌─────────┐ │      └─────────────────┘
│ │Airports │ │
│ │  Node   │ │   ┌──────────────────┐
│ └────┬────┘ │   │  Amadeus API     │
│      │      │◄──│  City → IATA     │
│ ┌────▼────┐ │   │  Nearby airports │
│ │ Scrape  │ │   └──────────────────┘
│ │  Node   │ │
│ └────┬────┘ │   ┌──────────────────┐
│      │      │◄──│  Google Flights  │
│ ┌────▼────┐ │   │  Playwright +    │
│ │Insight  │ │   │  Stealth scraper │
│ │  Node   │ │   └──────────────────┘
│ └─────────┘ │
└─────────────┘
```

### Key Design Decisions

**Streaming over polling** — `GET /search/stream` uses a FastAPI `StreamingResponse` emitting NDJSON lines. The frontend reads the stream with a `ReadableStream` + `TextDecoder`, updating the UI flight-by-flight rather than waiting for all pairs to complete.

**Scraping vs API** — Google Flights is scraped via Playwright because no public API provides real-time fare data. Playwright-stealth is applied to bypass bot detection. The Amadeus API is used only for airport/city resolution, not pricing.

**AI insight separation** — Gemini analysis runs after streaming completes via a dedicated `POST /insight` endpoint that receives the already-scraped flights. This prevents the full scrape from running twice (a previous bug where `POST /search` re-ran the entire LangGraph pipeline).

**Python decides, Gemini narrates** — The ground travel cost logic (whether an alternate airport is worth it) is computed in Python with fixed cost constants (₹600–₹1,400). Gemini is passed the verdict and only writes the prose. This prevents AI hallucination on monetary recommendations.

---

## Tech Stack

### Backend
| Package | Version | Role |
|---|---|---|
| FastAPI | 0.115.6 | Async web framework, streaming responses |
| Uvicorn | 0.32.1 | ASGI server |
| LangGraph | 0.2.69 | Pipeline orchestration (airports → scrape → insight) |
| Playwright | 1.49.1 | Headless Chromium — Google Flights scraper |
| playwright-stealth | 1.0.6 | Bot detection bypass |
| google-genai | 1.14.0 | Gemini 2.5 Flash API client |
| Amadeus | 9.0.0 | City/airport resolution and nearby airport lookup |
| Pydantic | 2.10.3 | Request/response models |
| python-dotenv | 1.0.1 | Environment variable loading |

### Frontend
| Package | Role |
|---|---|
| React 18 | UI framework |
| Vite | Build tool + dev server |
| IBM Plex Mono | Monospace UI font |
| Playfair Display | Serif accent font |
| Native `fetch` | All HTTP calls (no axios) |

---

## Project Structure

```
project/
├── app/
│   ├── graphs/
│   │   ├── travel_graph.py        # LangGraph pipeline + scrape_and_stream generator
│   │   └── state.py               # TravelState TypedDict
│   ├── models/
│   │   └── flight.py              # FlightOption, SearchRequest, FlightRecommendation
│   ├── services/
│   │   ├── airport_service.py     # Amadeus city→IATA + nearby airport resolution
│   │   ├── gemini_service.py      # Gemini insight + chatbot
│   │   ├── amadeus_service.py     # Backup Amadeus client (not active in main pipeline)
│   │   └── flight_price_service.py
│   └── utils/
│       ├── flight_parser.py       # aria-label regex → FlightOption
│       └── flight_deduplicator.py # Cross-pair deduplication logic
├── main.py                        # FastAPI app — /search/stream, /insight, /chat
├── requirements.txt
│
└── src/                           # React frontend
    ├── NavigatorUI.jsx            # Main layout, search, streaming handler
    ├── ResultsGrid.jsx            # Flight cards grid
    ├── InsightSidebar.jsx         # Gemini insight panel
    ├── FlightChatbot.jsx          # In-app AI chat
    ├── CostCalculator.jsx         # Total trip cost breakdown
    ├── ErrorPage.jsx              # Error state UI
    ├── LoadingSkeleton.jsx        # Loading placeholder
    └── test_mock_Data.js          # Dev mock data (no backend required)
```

---

## Getting Started

### Prerequisites

- Python ≥ 3.11
- Node.js ≥ 18
- A [Gemini API key](https://aistudio.google.com/app/apikey)
- An [Amadeus for Developers](https://developers.amadeus.com/) account (free tier is sufficient)

### Backend Setup

```bash
# 1. Clone the repo
git clone https://github.com/your-org/navigator.git
cd navigator

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Download Chromium (one-time, ~170 MB)
playwright install chromium

# 4. Create .env file
cp .env.example .env
# Fill in your keys — see Environment Variables below

# 5. Start the backend
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend Setup

```bash
# From the project root
npm install

# Start the dev server
npm run dev
# → http://localhost:5173
```

> The frontend reads `VITE_API_URL` from `.env`. During local development this defaults to `http://127.0.0.1:8000` automatically.

---

## Environment Variables

### Backend — `.env`

```env
# Google Gemini
GEMINI_API_KEY=your_gemini_api_key_here

# Amadeus for Developers
AMADEUS_CLIENT_ID=your_amadeus_client_id
AMADEUS_CLIENT_SECRET=your_amadeus_client_secret
```

### Frontend — `.env` / `.env.production`

```env
# Override to point at your deployed backend
# Leave unset for local development (defaults to http://127.0.0.1:8000)
VITE_API_URL=https://your-cloud-run-url.run.app
```

---

## API Reference

### `GET /search/stream`

Streams flight results as NDJSON, one line per event. Call this first to get flights, then call `/insight` with the results.

**Query parameters:**

| Param | Type | Example |
|---|---|---|
| `source_city` | string | `Pune` |
| `destination_city` | string | `Kolkata` |
| `travel_date` | string (YYYY-MM-DD) | `2026-05-30` |

**Event types emitted:**

```jsonc
// Airport resolution complete — tells UI how many pairs to expect
{"type": "airports", "origins": ["PNQ", "BOM"], "dests": ["CCU", "BBI"], "airport_names": {...}, "dest_full_name": "Kolkata"}

// A pair is about to be scraped
{"type": "status", "origin": "PNQ", "origin_name": "Pune International", "dest": "CCU", "dest_name": "Netaji Subhash Chandra Bose Intl", "combo": 1, "total": 4}

// Scraped flights for a pair (top 5 cheapest)
{"type": "flights", "origin": "PNQ", "dest": "CCU", "flights": [...FlightOption]}

// A pair failed (timeout / no results)
{"type": "error", "origin": "RDP", "dest": "PNQ", "msg": "Timeout 15000ms exceeded"}

// All pairs complete
{"type": "done", "total_flights": 12}
```

---

### `POST /insight`

Runs Gemini AI analysis on already-scraped flights. Call this after `/search/stream` completes.

**Request body:**

```json
{
  "source_city": "Pune",
  "destination_city": "Kolkata",
  "travel_date": "2026-05-30",
  "flights": [ ...FlightOption array from stream... ]
}
```

**Response:**

```json
{
  "ai_insight": "## 🚗 Ground Travel Costs & Tradeoffs\n..."
}
```

---

### `POST /chat`

Stateless Gemini chatbot scoped to a specific set of search results. Send full conversation history on every call.

**Request body:**

```json
{
  "message": "Which flight has the shortest layover?",
  "history": [{"role": "user", "text": "..."}, {"role": "model", "text": "..."}],
  "flights": [ ...FlightOption array... ],
  "origin_city": "Pune",
  "dest_name": "Kolkata"
}
```

**Response:**

```json
{
  "reply": "The IndiGo flight at 9:40 PM has a 1h 30min layover in Delhi..."
}
```

---

### `FlightOption` schema

```typescript
{
  origin:           string       // IATA code e.g. "PNQ"
  origin_name:      string       // Full airport name
  destination:      string       // IATA code e.g. "CCU"
  destination_name: string
  price:            number       // INR
  airline:          string       // e.g. "IndiGo"
  departure_date:   string       // YYYY-MM-DD
  departure_time:   string       // e.g. "9:40 PM"
  arrival_time:     string       // e.g. "11:10 PM"
  duration:         string       // e.g. "2 hr 10 min"
  stops:            string       // "Nonstop" | "1 stop" | "2 stops"
  is_nearby:        boolean      // true if origin or dest is an alternate airport
}
```

---

## Frontend Components

### `NavigatorUI.jsx`
Root component. Owns all search state, streaming logic, and layout. Key internals:

- `streamSearch(date)` — opens the NDJSON stream, parses events, updates flight state live, returns the full `allFlights` array for passing to `/insight`
- `handleSearch()` — orchestrates the full search cycle: reset state → stream → fetch insight
- `insightLoading` state — separate from `isLoading` (which tracks streaming). Allows `InsightSidebar` to show its skeleton while Gemini fetches after the stream completes
- `FareRangeBar` — parses historical fare range + current price + verdict from Gemini's insight text via regex and renders a gradient range track with a positioned thumb

### `InsightSidebar.jsx`
Displays the Gemini insight text with markdown-to-HTML rendering. Accepts an `isLoading` prop (passed from parent) to show a shimmer skeleton while Gemini is fetching. Fades in content with a CSS transition on mount.

### `ResultsGrid.jsx`
Renders flight cards in a responsive auto-fill grid. Each card shows airline, stops badge, price, departure/arrival times, duration bar, airport names, date, and a nearby airport tag. Supports click-to-select for the cost calculator.

### `FlightChatbot.jsx`
Fixed-width (480px) right column chatbot. Resets conversation history on each new search. Sends full history on every call so Gemini has multi-turn context within a session.

### `CostCalculator.jsx`
Slides in above the results grid when a flight is selected. Breaks down total trip cost: flight price + ground transport (origin + destination) + accommodation estimate. Includes basic FX conversion for USD and EUR.

---

## Data Flow

```
User clicks "Run Flight Intelligence"
  │
  ├─ Reset all state (flights, insight, insightLoading)
  │
  ├─ GET /search/stream
  │    ├─ {type: airports}  → setPrimaryOrigin/Dest, set expected combos
  │    ├─ {type: status}    → update LoadingBanner scanning phase
  │    ├─ {type: flights}   → merge + deduplicate into flights state (live)
  │    ├─ {type: error}     → log warning, continue
  │    └─ {type: done}      → clear scanStatus, return allFlights[]
  │
  ├─ setInsightLoading(true)
  │
  ├─ POST /insight  { flights: allFlights }
  │    └─ GeminiService.get_recommendation()
  │         ├─ Section 1: Ground travel cost analysis (Python pre-computed)
  │         └─ Section 2: Historical fare range + holiday alert + urgency
  │
  ├─ setInsight(ai_insight)
  └─ setInsightLoading(false) / setIsLoading(false)
       └─ InsightSidebar fades in
          FareRangeBar parses insight text → renders range track
```

---

## Deployment

### Docker / Google Cloud Run

The backend requires a Playwright-compatible base image to avoid missing Chromium system dependencies.

**`Dockerfile`:**

```dockerfile
FROM mcr.microsoft.com/playwright/python:v1.49.0-jammy

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
RUN playwright install chromium

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

**Deploy to Cloud Run (asia-south1 recommended for Indian routes):**

```bash
gcloud run deploy navigator \
  --source . \
  --region asia-south1 \
  --memory 2Gi \
  --timeout 120 \
  --set-env-vars GEMINI_API_KEY=...,AMADEUS_CLIENT_ID=...,AMADEUS_CLIENT_SECRET=...
```

> **Memory:** 2 GiB minimum — Chromium requires ~600 MB per browser instance.
> **Timeout:** 120s — a full 4-pair scrape with slow pairs can take 60–90s.

### Frontend

Build and deploy to any static host (Vercel, Netlify, Firebase Hosting):

```bash
# Set your backend URL
echo "VITE_API_URL=https://your-cloud-run-url.run.app" > .env.production

npm run build
# Deploy the dist/ folder
```

---

## Known Limitations

| Limitation | Detail |
|---|---|
| **One-way only** | Round-trip search is not yet supported |
| **Nearby airports may timeout** | Smaller airports (e.g. RDP/Kazi Nazrul Islam) frequently return no results from Google Flights — these pairs are skipped silently |
| **Historical fare data is AI-estimated** | The 10-day fare range in Gemini's analysis is drawn from training knowledge, not a live pricing database. It is clearly labelled as an estimate |
| **FX rates are hardcoded** | EUR and USD conversion in the cost calculator use fixed rates (EUR×90, USD×83) and are not fetched live |
| **No mobile layout** | The UI is optimised for desktop (≥1024px). Column layouts will overflow on smaller screens |
| **Single passenger only** | All searches assume 1 adult. Group pricing is not supported |

---

## Roadmap

- [ ] Round-trip / return flight search
- [ ] Flex date heatmap calendar (7-day cheapest day view)
- [ ] Filters: nonstop only, airline, departure time window
- [ ] Shareable search URL (encode params in query string)
- [ ] Search history / recents
- [ ] Live FX rate fetch for cost calculator
- [ ] Retry logic for timed-out scrape pairs
- [ ] Playwright browser pool (reuse contexts across requests)
- [ ] Amadeus airport resolution cache (24h TTL)
- [ ] Booking handoff deep-link to Google Flights
- [ ] Mobile responsive layout

---

## Contributing

1. Fork the repo and create a feature branch
2. For backend changes — ensure `uvicorn main:app --reload` starts cleanly
3. For scraper changes — test against at least 2 city pairs including one with a nearby airport
4. For frontend changes — verify against mock data in `test_mock_Data.js` before testing against live backend
5. Open a pull request with a description of what changed and why

---

*Built for Indian domestic travellers. Prices in ₹ INR. All fare data scraped in real time from Google Flights.*
