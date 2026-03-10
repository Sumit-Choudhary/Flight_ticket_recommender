import React from 'react';

// FIX: Defined outside the component — this array never changes so there
// is no reason to recreate it on every render.
// 4 cards fills the 2-column ResultsGrid layout with 2 complete rows.
const SKELETON_COUNT = [1, 2, 3, 4];

const LoadingSkeleton = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
      {SKELETON_COUNT.map((card) => (
        <div
          key={card}
          className="bg-slate-800/50 border border-slate-700 p-5 rounded-xl"
        >
          {/* Airline badge + price row */}
          <div className="flex justify-between items-start mb-4">
            <div className="h-6 w-20 bg-slate-700 rounded"></div>
            <div className="h-7 w-24 bg-slate-700 rounded"></div>
          </div>

          {/* Origin / destination rows */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-slate-700 flex-shrink-0"></div>
              <div className="h-4 w-full bg-slate-700 rounded"></div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-slate-700 flex-shrink-0"></div>
              <div className="h-4 w-3/4 bg-slate-700 rounded"></div>
            </div>
          </div>

          {/* Footer row */}
          <div className="mt-6 pt-4 border-t border-slate-700/50 flex justify-between">
            <div className="h-3 w-16 bg-slate-700 rounded"></div>
            <div className="h-4 w-20 bg-slate-700/50 rounded-full"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default LoadingSkeleton;