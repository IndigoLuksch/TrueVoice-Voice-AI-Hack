"use client";

import React, { useMemo } from "react";
import { motion } from "motion/react";
import { NumberTicker } from "@/components/ui/number-ticker";
import { DashboardEvent } from "@/lib/types";
import { biomarkerWindowRisk } from "@/lib/concordanceRisk";
import { cn } from "@/lib/utils";

function eventTimeMs(e: DashboardEvent): number {
  if ("ts_ms" in e && typeof e.ts_ms === "number") return e.ts_ms;
  if ("end_ms" in e && typeof e.end_ms === "number") return e.end_ms;
  return 0;
}

export default function ConcordanceMeter({ events }: { events: DashboardEvent[] }) {
  const { score, status, color, flagCount, dominant } = useMemo(() => {
    const sessionEnd = events.length ? Math.max(...events.map(eventTimeMs)) : 0;
    const biomarkers = events
      .filter((e): e is Extract<DashboardEvent, { type: "biomarker_result" }> => e.type === "biomarker_result")
      .map((e) => ({
        model: e.model,
        name: e.name,
        value: e.value,
        ts_ms: e.ts_ms,
      }));
    const { score: s, maxRatio, dominantName } = biomarkerWindowRisk(
      biomarkers,
      sessionEnd || undefined,
    );
    const flags = events.filter((e) => e.type === "concordance_flag").length;
    let color: "emerald" | "amber" | "red" = "emerald";
    let status = "Aligned";
    if (maxRatio > 1.3) {
      color = "red";
      status = "Divergent";
    } else if (maxRatio > 0.85) {
      color = "amber";
      status = "Elevated";
    }
    return { score: s, status, color, flagCount: flags, dominant: dominantName };
  }, [events]);

  const colorMap = {
    emerald: { stroke: "#10b981", text: "text-emerald-600", ring: "ring-emerald-200" },
    amber: { stroke: "#f59e0b", text: "text-amber-600", ring: "ring-amber-200" },
    red: { stroke: "#dc2626", text: "text-red-600", ring: "ring-red-200" },
  };
  const c = colorMap[color];

  const r = 62;
  const circumference = 2 * Math.PI * r;
  const dash = (score / 100) * circumference;

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-neutral-500">
          Concordance
        </span>
        {flagCount > 0 && (
          <motion.span
            key={flagCount}
            initial={{ scale: 1.25 }}
            animate={{ scale: 1 }}
            className="text-[10px] font-mono text-red-600 uppercase tracking-[0.18em] tabular-nums"
          >
            {flagCount} flag{flagCount === 1 ? "" : "s"}
          </motion.span>
        )}
      </div>

      <div className="relative flex items-center justify-center">
        <svg width="160" height="160" className="-rotate-90">
          <circle
            cx="80"
            cy="80"
            r={r}
            stroke="#f4f4f5"
            strokeWidth="8"
            fill="none"
          />
          <motion.circle
            cx="80"
            cy="80"
            r={r}
            stroke={c.stroke}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            initial={false}
            animate={{ strokeDasharray: `${dash} ${circumference}` }}
            transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={cn("font-['Space_Grotesk'] text-4xl font-bold tabular-nums", c.text)}>
            <NumberTicker value={score} className={c.text} decimalPlaces={0} />
          </div>
          <div className="text-[9px] font-mono tracking-[0.22em] uppercase text-neutral-400 mt-0.5">
            / 100
          </div>
        </div>
      </div>

      <div className="mt-4 text-center">
        <div className={cn("font-['Space_Grotesk'] text-lg font-bold uppercase tracking-[0.1em]", c.text)}>
          {status}
        </div>
        {dominant && color !== "emerald" && (
          <div className="mt-1 text-[10px] font-mono text-neutral-400 uppercase tracking-[0.18em]">
            dominant · {dominant}
          </div>
        )}
      </div>
    </div>
  );
}
