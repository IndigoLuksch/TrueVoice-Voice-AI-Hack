"use client";

import React from "react";
import { DashboardEvent } from "@/lib/types";

type Marker = { key: string; label: string; val: number; progress?: number };

function barColor(val: number): string {
  if (val > 0.7) return "bg-red-500";
  if (val > 0.4) return "bg-amber-500";
  return "bg-emerald-500";
}

export default function BiomarkerLane({ events }: { events: DashboardEvent[] }) {
  const latestResult: Record<string, number> = {};
  const latestProgress: Record<string, { s: number; t: number }> = {};
  let latestPsyche: Record<string, number> | null = null;

  for (const e of events) {
    if (e.type === "biomarker_result") {
      latestResult[`${e.model}.${e.name}`] = e.value;
    } else if (e.type === "biomarker_progress") {
      latestProgress[`${e.model}.${e.name}`] = {
        s: e.speech_seconds,
        t: e.trigger_seconds,
      };
    } else if (e.type === "psyche_update") {
      latestPsyche = e.affect;
    }
  }

  const markers: Marker[] = Object.entries(latestResult).map(([k, v]) => ({
    key: k,
    label: k.split(".")[1] ?? k,
    val: v,
  }));

  for (const [k, p] of Object.entries(latestProgress)) {
    if (!(k in latestResult)) {
      markers.push({
        key: k,
        label: k.split(".")[1] ?? k,
        val: 0,
        progress: p.t > 0 ? Math.min(1, p.s / p.t) : 0,
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
          Biomarkers
        </h3>
        {markers.length === 0 ? (
          <p className="text-[10px] text-gray-400 italic">Listening…</p>
        ) : (
          <div className="flex flex-col gap-2">
            {markers.map((m) => (
              <div key={m.key} className="flex flex-col gap-1">
                <div className="flex justify-between text-[9px] font-mono uppercase">
                  <span className="text-gray-600">{m.label}</span>
                  <span className="text-gray-800">
                    {m.progress !== undefined
                      ? `${Math.round(m.progress * 100)}%`
                      : m.val.toFixed(2)}
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-sm overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      m.progress !== undefined ? "bg-gray-400" : barColor(m.val)
                    }`}
                    style={{
                      width: `${(m.progress !== undefined ? m.progress : m.val) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {latestPsyche && (
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
            Psyche affect
          </h3>
          <div className="flex flex-col gap-1">
            {Object.entries(latestPsyche).map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5">
                <div className="flex justify-between text-[9px] font-mono uppercase">
                  <span className="text-gray-600">{k}</span>
                  <span className="text-gray-800">{v.toFixed(2)}</span>
                </div>
                <div className="w-full h-1.5 bg-gray-200 rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-orange-500 transition-all duration-500"
                    style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
