// test_mock_Data.js
// Mirrors the FlightRecommendation response model from app/models/flight.py.
// All FlightOption fields including the new timing fields are populated here
// so the UI renders realistically during development without a live backend.

const allOptions = [
  {
    origin: "PNQ",
    origin_name: "Pune Airport",
    destination: "CCU",
    destination_name: "Netaji Subhash Chandra Bose Intl",
    price: 6742.0,
    airline: "Air India",
    departure_date: "2026-03-15",
    departure_time: "10:30 AM",
    arrival_time: "1:45 PM",
    duration: "3 hr 15 min",
    stops: "Nonstop",
    is_nearby: false,
  },
  {
    origin: "BOM",
    origin_name: "Chhatrapati Shivaji Maharaj Intl",
    destination: "CCU",
    destination_name: "Netaji Subhash Chandra Bose Intl",
    price: 5200.0,
    airline: "IndiGo",
    departure_date: "2026-03-15",
    departure_time: "9:00 AM",
    arrival_time: "11:10 AM",
    duration: "2 hr 10 min",
    stops: "Nonstop",
    is_nearby: true,
  },
  {
    origin: "PNQ",
    origin_name: "Pune Airport",
    destination: "CCU",
    destination_name: "Netaji Subhash Chandra Bose Intl",
    price: 7100.0,
    airline: "IndiGo",
    departure_date: "2026-03-15",
    departure_time: "6:00 AM",
    arrival_time: "11:30 AM",
    duration: "5 hr 30 min",
    stops: "1 stop",
    is_nearby: false,
  },
  {
    origin: "BOM",
    origin_name: "Chhatrapati Shivaji Maharaj Intl",
    destination: "CCU",
    destination_name: "Netaji Subhash Chandra Bose Intl",
    price: 4890.0,
    airline: "Akasa Air",
    departure_date: "2026-03-15",
    departure_time: "6:15 PM",
    arrival_time: "8:30 PM",
    duration: "2 hr 15 min",
    stops: "Nonstop",
    is_nearby: true,
  },
];

export const mockResults = {
  cheapest_flight: allOptions[3], // Akasa Air at ₹4,890

  all_options: allOptions,

  ai_insight:
    "Saving ₹1,852 by flying via Mumbai is a great deal. " +
    "**Pro tip:** The BOM→CCU Akasa Air evening flight lands you in Kolkata " +
    "just in time for dinner — worth the cab to Mumbai!",

  total_combinations_searched: allOptions.length,
};