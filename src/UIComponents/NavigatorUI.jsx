import React, { useState } from 'react';
import { mockResults } from './test_mock_Data';
import ResultsGrid from './ResultsGrid';
import InsightSidebar from './InsightSidebar';
import ErrorPage from './ErrorPage';
import LoadingSkeleton from './LoadingSkeleton';

const NavigatorUI = () => {
  const [showError, setShowError] = useState(false); // For testing the error page
  const [hasError, setHasError] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  if (showError) return <ErrorPage onRetry={() => setShowError(false)} />;

  if (hasError) {
  return (
    <ErrorPage 
      onRetry={() => setHasError(false)} 
      message="Unable to reach the Python search graph. Please ensure the backend server is running."
    />
  );
}

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 font-sans">
      {/* Search Header */}
      <header className="bg-slate-800 p-6 rounded-xl shadow-lg mb-6 border border-slate-700">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Origin</label>
            <input type="text" placeholder="Pune" className="w-full bg-slate-700 border-none rounded mt-1 p-2 focus:ring-2 focus:ring-cyan-500" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Destination</label>
            <input type="text" placeholder="Kolkata" className="w-full bg-slate-700 border-none rounded mt-1 p-2 focus:ring-2 focus:ring-cyan-500" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase">Date</label>
            <input type="date" className="w-full bg-slate-700 border-none rounded mt-1 p-2" />
          </div>
          <button className="bg-cyan-600 hover:bg-cyan-500 transition-colors font-bold py-2 rounded text-white shadow-lg shadow-cyan-900/20">
            Optimize Route
          </button>
        </div>
      </header>

      {/* Main Content Grid */}
      <div className="grid grid-cols-12 gap-6">
        
        {/* Left: Flight Matrix */}
        <main className="col-span-12 lg:col-span-8 space-y-4">
          <h2 className="text-xl font-semibold mb-4 text-cyan-400">Route Comparison</h2>
        
          {isLoading ? (
              <LoadingSkeleton />
            ) : (
              <ResultsGrid flights={mockResults.all_options} />
            )}
        
       </main>

        {/* Right: Gemini Sidebar */}
        <InsightSidebar insight={mockResults.ai_insight} />
      </div>
    </div>
  );
};

const ErrorMessagePage = ({ onRetry }) => (
  <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-center p-6">
    <div className="text-6xl mb-4">⛈️</div>
    <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
    <p className="text-slate-400 mb-6 max-w-md">We couldn't reach the Amadeus servers. It might be a network issue or the test API is currently down.</p>
    <button onClick={onRetry} className="bg-slate-700 hover:bg-slate-600 px-6 py-2 rounded-full font-bold transition-all">
      Try Again
    </button>
  </div>
);

export default NavigatorUI;