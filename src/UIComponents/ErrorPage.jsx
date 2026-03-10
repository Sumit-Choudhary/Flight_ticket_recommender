import React from 'react';

// FIX: Added errorCode prop so the real HTTP/error code from main.py can be
// displayed instead of the hardcoded "503_SERVICE_UNAVAILABLE".
// NavigatorUI can pass this from the axios error response when available.
// Defaults to "UNKNOWN_ERROR" if not provided.
const ErrorPage = ({ message, onRetry, errorCode = "UNKNOWN_ERROR" }) => {

  // FIX: Named handler instead of inline arrow in JSX — easier to test/debug
  const handleRefresh = () => window.location.reload();

  // FIX: Safe retry handler — guards against onRetry not being passed by parent
  const handleRetry = () => {
    if (typeof onRetry === 'function') {
      onRetry();
    } else {
      handleRefresh(); // Sensible fallback if no retry handler provided
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-6">
      <div className="max-w-md w-full bg-slate-900 border border-red-900/50 rounded-3xl p-8 shadow-2xl shadow-red-900/20 text-center">

        {/* Animated error icon */}
        <div className="relative inline-block mb-6">
          <div className="text-6xl animate-bounce">⛈️</div>
          <div className="absolute inset-0 bg-red-500 blur-3xl opacity-10 rounded-full"></div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-3">Connection Interrupted</h1>

        {/* FIX: Removed hardcoded "Amadeus servers" from default message.
            The error could originate from Gemini, LangGraph, or FastAPI —
            a generic message avoids misleading the user about the failure source. */}
        <p className="text-slate-400 mb-8 leading-relaxed">
          {message || "We encountered an issue while fetching your flight data. This could be due to a network timeout or a temporary service outage. Please try again."}
        </p>

        <div className="space-y-3">
          <button
            onClick={handleRetry}
            className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-red-900/40"
          >
            Try Again
          </button>

          <button
            onClick={handleRefresh}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-3 rounded-xl transition-all"
          >
            Refresh Dashboard
          </button>
        </div>

        {/* FIX: errorCode is now a dynamic prop instead of hardcoded "503_SERVICE_UNAVAILABLE".
            Pass errorCode from NavigatorUI via the axios error response status. */}
        <div className="mt-8 pt-6 border-t border-slate-800">
          <p className="text-[10px] text-slate-600 uppercase tracking-widest">
            Error Code: {errorCode}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ErrorPage;