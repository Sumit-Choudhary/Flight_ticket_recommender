import React from 'react';

const ErrorPage = ({ message, onRetry }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-6">
      <div className="max-w-md w-full bg-slate-900 border border-red-900/50 rounded-3xl p-8 shadow-2xl shadow-red-900/20 text-center">
        {/* Animated Error Icon */}
        <div className="relative inline-block mb-6">
          <div className="text-6xl animate-bounce">⛈️</div>
          <div className="absolute inset-0 bg-red-500 blur-3xl opacity-10 rounded-full"></div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-3">Connection Interrupted</h1>
        
        <p className="text-slate-400 mb-8 leading-relaxed">
          {message || "We encountered an issue while fetching the latest flight data from the Amadeus servers. This could be due to a network timeout or a temporary API outage."}
        </p>

        <div className="space-y-3">
          <button 
            onClick={onRetry}
            className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-red-900/40"
          >
            Try Again
          </button>
          
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-3 rounded-xl transition-all"
          >
            Refresh Dashboard
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-800">
          <p className="text-[10px] text-slate-600 uppercase tracking-widest">
            Error Code: 503_SERVICE_UNAVAILABLE
          </p>
        </div>
      </div>
    </div>
  );
};

export default ErrorPage;