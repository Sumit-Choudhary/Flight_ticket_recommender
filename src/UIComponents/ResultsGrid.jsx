import React from 'react';

const ResultsGrid = ({ flights }) => {
  // 1. Check for Empty State
  if (!flights || flights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-700 rounded-2xl bg-slate-800/50">
        <div className="text-5xl mb-4 text-slate-600">✈️</div>
        <h3 className="text-xl font-medium text-slate-300">No flights to show yet</h3>
        <p className="text-slate-500 text-center max-w-xs mt-2">
          Enter your travel details above and click "Optimize Route" to see the best options from Pune and nearby cities.
        </p>
      </div>
    );
  }

  // 2. Render the Flight Cards
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {flights.map((flight, idx) => (
        <div key={idx} className="bg-slate-800 border border-slate-700 p-5 rounded-xl hover:border-cyan-500 hover:shadow-lg hover:shadow-cyan-900/10 transition-all group">
          <div className="flex justify-between items-start mb-4">
            <span className="bg-cyan-900/40 text-cyan-400 border border-cyan-800 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider">
              {flight.airline}
            </span>
            <span className="text-white font-bold text-xl">₹{flight.price.toLocaleString('en-IN')}</span>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-slate-500"></div>
              <p className="text-sm text-slate-300 flex-1 flex justify-between">
                <span className="text-slate-500">From:</span> {flight.origin_name}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
              <p className="text-sm text-slate-300 flex-1 flex justify-between">
                <span className="text-slate-500">To:</span> {flight.destination_name}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-700 flex justify-between items-center">
            <span className="text-[10px] text-slate-500 font-mono uppercase">
              {new Date(flight.departure_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
            {flight.is_nearby && (
              <span className="text-[10px] bg-amber-900/30 text-amber-400 px-2 py-0.5 rounded-full border border-amber-800">
                Alternative City
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ResultsGrid;