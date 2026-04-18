"use client";

import React from "react";

export default function BiomarkerLane({ events }: { events: any[] }) {
  const latest = events.filter((e) => e.type === "biomarker").slice(-1)[0]?.data || { arousal: 0.5, valence: 0.5, engagement: 0.5 };

  const markers = [
    { label: "Arousal", val: latest.arousal },
    { label: "Valence", val: latest.valence },
    { label: "Engagement", val: latest.engagement },
  ];

  return (
    <div className="flex gap-4 h-48 items-end">
      {markers.map((m) => (
        <div key={m.label} className="flex-1 flex flex-col items-center gap-2">
          <div className="flex-1 w-full bg-gray-200 rounded-sm overflow-hidden flex flex-col-reverse">
            <div className="bg-orange-500 transition-all duration-500" style={{ height: `${m.val * 100}%` }} />
          </div>
          <span className="text-[9px] font-mono uppercase text-gray-500">{m.label}</span>
        </div>
      ))}
    </div>
  );
}