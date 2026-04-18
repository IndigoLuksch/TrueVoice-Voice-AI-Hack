"use client";

import React from "react";

export default function ConcordanceMeter({ events }: { events: any[] }) {
  const latestConcordance = events.filter((e) => e.type === "concordance_score").slice(-1)[0]?.value || 0;

  return (
    <div className="border border-orange-900/30 p-4 bg-orange-950/20 rounded">
      <h3 className="text-[10px] uppercase tracking-widest text-orange-500 font-bold mb-2">Concordance Score</h3>
      <div className="relative h-12 flex items-end gap-1">
        <div className="text-3xl font-mono text-white">{Math.round(latestConcordance)}</div>
        <div className="text-xs text-gray-500 mb-1">/ 100</div>
      </div>
      <div className="w-full bg-orange-900/30 h-2 mt-2 rounded-full overflow-hidden">
        <div 
            className={`h-full transition-all ${latestConcordance > 70 ? 'bg-green-500' : 'bg-red-500'}`} 
            style={{ width: `${latestConcordance}%` }} 
        />
      </div>
    </div>
  );
}