"use client";

import React, { useRef, useEffect } from "react";
import { DashboardEvent } from "@/lib/types";

export default function TranscriptLane({ events }: { events: DashboardEvent[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events]);

  const finals = events.filter(
    (e): e is Extract<DashboardEvent, { type: "transcript_final" }> =>
      e.type === "transcript_final"
  );

  const latestPartialByRole: Record<string, string> = {};
  for (const e of events) {
    if (e.type === "transcript_partial") latestPartialByRole[e.role] = e.text;
  }
  for (const e of events) {
    if (e.type === "transcript_final") latestPartialByRole[e.role] = "";
  }

  return (
    <div ref={scrollRef} className="h-full p-8 overflow-y-auto space-y-4">
      {finals.map((e) => (
        <div key={e.utterance_id} className="flex gap-4 group">
          <div className={`w-1 rounded-full ${e.role === "patient" ? "bg-orange-500" : "bg-blue-500"}`} />
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-gray-400 uppercase">{e.role}</span>
            <p className="text-sm text-gray-800 leading-relaxed">{e.text}</p>
          </div>
        </div>
      ))}
      {Object.entries(latestPartialByRole).map(([role, text]) =>
        text ? (
          <div key={`partial-${role}`} className="flex gap-4 opacity-50">
            <div className={`w-1 rounded-full ${role === "patient" ? "bg-orange-500" : "bg-blue-500"}`} />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-gray-400 uppercase">{role}</span>
              <p className="text-sm italic text-gray-600 leading-relaxed">{text}</p>
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}
