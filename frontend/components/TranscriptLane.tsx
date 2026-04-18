"use client";

import React, { useRef, useEffect } from "react";

export default function TranscriptLane({ events }: { events: any[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if(scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [events]);

  const transcriptEvents = events.filter((e) => e.type === "transcript");

  return (
    <div ref={scrollRef} className="h-full p-8 overflow-y-auto space-y-6">
      {transcriptEvents.map((e, i) => {
        // Check if biomarker was active for this event (simulated logic)
        const isBiomarkerActive = e.metadata?.biomarker_active; 
        
        return (
          <div key={i} className="flex gap-4 group">
            {/* The Vertical Bar */}
            <div className={`w-1 rounded-full transition-colors ${isBiomarkerActive ? 'bg-orange-500' : 'bg-transparent'}`} />
            
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-gray-400 uppercase">{e.speaker || "Patient"}</span>
              <p className="text-sm text-gray-800 leading-relaxed">{e.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}