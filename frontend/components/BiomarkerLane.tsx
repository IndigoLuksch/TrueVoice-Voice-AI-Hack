"use client";

import React from "react";
import { motion } from "motion/react";
import { NumberTicker } from "@/components/ui/number-ticker";
import { DashboardEvent, BioModel } from "@/lib/types";
import { cn } from "@/lib/utils";

type Marker = {
  key: string;
  model: BioModel;
  name: string;
  value?: number;
  progress?: number;
};

const THRESHOLDS: Record<string, number> = {
  "helios.distress": 0.65,
  "helios.stress": 0.7,
  "helios.fatigue": 0.7,
  "apollo.low_mood": 0.65,
  "apollo.low_energy": 0.65,
  "apollo.anhedonia": 0.65,
  "apollo.sleep_issues": 0.65,
  "apollo.nervousness": 0.7,
  "apollo.worry": 0.65,
};

const MODEL_LABEL: Record<BioModel, string> = {
  helios: "Helios",
  apollo: "Apollo",
  psyche: "Psyche",
};

function colorFor(value: number, threshold: number) {
  const ratio = value / threshold;
  if (ratio > 1.15) return { bar: "bg-red-500", text: "text-red-600", dot: "bg-red-500" };
  if (ratio > 0.85) return { bar: "bg-amber-500", text: "text-amber-600", dot: "bg-amber-500" };
  return { bar: "bg-emerald-500", text: "text-emerald-600", dot: "bg-emerald-500" };
}

export default function BiomarkerLane({ events }: { events: DashboardEvent[] }) {
  const latestResult: Record<string, { model: BioModel; name: string; value: number }> = {};
  const latestProgress: Record<string, { model: BioModel; name: string; s: number; t: number }> = {};
  let latestPsyche: Record<string, number> | null = null;

  for (const e of events) {
    if (e.type === "biomarker_result") {
      latestResult[`${e.model}.${e.name}`] = { model: e.model, name: e.name, value: e.value };
    } else if (e.type === "biomarker_progress") {
      latestProgress[`${e.model}.${e.name}`] = {
        model: e.model,
        name: e.name,
        s: e.speech_seconds,
        t: e.trigger_seconds,
      };
    } else if (e.type === "psyche_update") {
      latestPsyche = e.affect;
    }
  }

  const markers: Marker[] = [];
  for (const [k, r] of Object.entries(latestResult)) {
    markers.push({ key: k, model: r.model, name: r.name, value: r.value });
  }
  for (const [k, p] of Object.entries(latestProgress)) {
    if (!(k in latestResult)) {
      markers.push({
        key: k,
        model: p.model,
        name: p.name,
        progress: p.t > 0 ? Math.min(1, p.s / p.t) : 0,
      });
    }
  }

  // Group by model
  const grouped: Record<string, Marker[]> = {};
  for (const m of markers) {
    (grouped[m.model] ||= []).push(m);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-neutral-500">
            Voice biomarkers
          </span>
          <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-[0.2em]">
            thymia · live
          </span>
        </div>

        {markers.length === 0 ? (
          <div className="text-[10px] font-mono text-neutral-400 italic py-3">
            warming up — biomarkers need ~15s of speech
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {(["helios", "apollo"] as BioModel[]).map((model) => {
              const rows = grouped[model];
              if (!rows?.length) return null;
              return (
                <div key={model}>
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="font-['Space_Grotesk'] text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-900">
                      {MODEL_LABEL[model]}
                    </span>
                    <span className="text-[9px] font-mono text-neutral-400">
                      {rows.length} marker{rows.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {rows.map((m, i) => {
                      const threshold = THRESHOLDS[`${m.model}.${m.name}`] ?? 0.65;
                      const isProgress = m.value === undefined;
                      const v = m.value ?? 0;
                      const col = colorFor(v, threshold);
                      return (
                        <motion.div
                          key={m.key}
                          initial={{ opacity: 0, x: 12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.4, delay: i * 0.03 }}
                        >
                          <div className="flex items-baseline justify-between text-[10px] mb-1">
                            <span className="font-mono text-neutral-600">
                              {m.name}
                            </span>
                            {isProgress ? (
                              <span className="font-mono text-neutral-400 tabular-nums">
                                {Math.round((m.progress ?? 0) * 100)}%
                              </span>
                            ) : (
                              <span className={cn("font-mono font-bold tabular-nums", col.text)}>
                                <NumberTicker
                                  value={v}
                                  decimalPlaces={2}
                                  className={col.text}
                                />
                              </span>
                            )}
                          </div>
                          <div className="relative h-1.5 rounded-full bg-neutral-200/70 overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-[width] duration-700 ease-out",
                                isProgress ? "bg-neutral-400" : col.bar
                              )}
                              style={{
                                width: `${Math.min(100, (isProgress ? (m.progress ?? 0) : v) * 100)}%`,
                              }}
                            />
                            {!isProgress && (
                              <div
                                className="pointer-events-none absolute top-0 bottom-0 w-px bg-neutral-500/70"
                                style={{ left: `${threshold * 100}%` }}
                              />
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {latestPsyche && (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="font-['Space_Grotesk'] text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-900">
              Psyche
            </span>
            <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-[0.18em]">
              affect · 5s window
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {Object.entries(latestPsyche).map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5">
                <div className="flex items-baseline justify-between text-[10px]">
                  <span className="font-mono text-neutral-600">{k}</span>
                  <span className="font-mono tabular-nums text-neutral-900">
                    {v.toFixed(2)}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-neutral-200/70 overflow-hidden">
                  <div
                    className="h-full bg-orange-500/80 transition-[width] duration-500"
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
