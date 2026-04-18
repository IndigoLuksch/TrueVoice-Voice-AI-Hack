"use client";

import React from "react";
import { DashboardEvent } from "@/lib/types";

const THRESHOLDS: Record<string, number> = {
  "helios.distress": 0.65,
  "helios.stress": 0.7,
  "helios.fatigue": 0.7,
  "apollo.low_mood": 0.65,
  "apollo.low_energy": 0.65,
  "apollo.anhedonia": 0.65,
  "apollo.sleep_issues": 0.65,
  "apollo.nervousness": 0.7,
};

const LOOKBACK_MS = 60_000;

export default function ConcordanceMeter({ events }: { events: DashboardEvent[] }) {
  const latestTs = events.length > 0 ? (events[events.length - 1] as { ts_ms?: number }).ts_ms ?? 0 : 0;
  const cutoff = latestTs - LOOKBACK_MS;

  let maxRatio = 0;
  for (const e of events) {
    if (e.type === "biomarker_result" && e.ts_ms >= cutoff) {
      const thr = THRESHOLDS[`${e.model}.${e.name}`];
      if (thr !== undefined) {
        maxRatio = Math.max(maxRatio, e.value / thr);
      }
    }
  }

  const flagCount = events.filter((e) => e.type === "concordance_flag").length;
  const score = Math.min(100, Math.round(maxRatio * 100));
  const color =
    maxRatio > 1.3 ? "bg-red-500" : maxRatio > 1.0 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="border border-gray-200 p-4 bg-white rounded">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
          Concordance pressure
        </h3>
        <span className="text-[10px] font-mono text-red-600">
          {flagCount} flag{flagCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex items-end gap-1 mb-2">
        <span className="text-3xl font-mono text-black">{score}</span>
        <span className="text-xs text-gray-400 mb-1">/ 100 threshold</span>
      </div>
      <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
    </div>
  );
}
