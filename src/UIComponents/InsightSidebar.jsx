import React, { useState, useEffect } from 'react';

const InsightSidebar = ({ insight }) => {
  const [isVisible, setIsVisible] = useState(false);

  // Trigger the fade-in whenever the insight changes
  useEffect(() => {
    if (insight) {
      setIsVisible(false);
      const timer = setTimeout(() => setIsVisible(true), 100);
      return () => clearTimeout(timer);
    }
  }, [insight]);

  return (
    <aside className="col-span-12 lg:col-span-4">
      <div className={`
        bg-gradient-to-br from-slate-800 to-slate-900 
        border border-slate-700 p-6 rounded-2xl sticky top-6
        transition-all duration-1000 ease-in-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
        shadow-[0_0_20px_rgba(34,211,238,0.05)]
      `}>
        {/* Header with AI Icon */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative">
            <div className="w-10 h-10 bg-cyan-500 rounded-full flex items-center justify-center text-white text-xl animate-pulse">
              🤖
            </div>
            {/* The "Glow" behind the bot */}
            <div className="absolute inset-0 bg-cyan-400 rounded-full blur-md opacity-20"></div>
          </div>
          <div>
            <h3 className="font-bold text-lg text-white">Gemini Insight</h3>
            <span className="text-[10px] text-cyan-500 uppercase tracking-widest font-bold">Route Optimizer</span>
          </div>
        </div>

        {/* The Animated Text Body */}
        <div className="relative">
          <div className="absolute -left-4 top-0 bottom-0 w-1 bg-cyan-500 rounded-full opacity-50"></div>
          <p className="text-slate-300 leading-relaxed text-sm italic pl-2">
            "{insight || "I'm analyzing the routes now. Please wait a moment..."}"
          </p>
        </div>

        {/* Small decorative element at the bottom */}
        <div className="mt-8 pt-4 border-t border-slate-800 flex justify-between items-center">
          <span className="text-[9px] text-slate-600 font-mono">MODEL: GEMINI-3-FLASH</span>
          <div className="flex gap-1">
            <div className="w-1 h-1 rounded-full bg-slate-700"></div>
            <div className="w-1 h-1 rounded-full bg-slate-700"></div>
            <div className="w-1 h-1 rounded-full bg-slate-700"></div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default InsightSidebar;