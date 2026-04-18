"use client";

import React from "react";
import { motion } from "motion/react";
import { BorderBeam } from "@/components/ui/border-beam";
import { ConcordanceFlag } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatTs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

const THRESHOLDS: Record<string, number> = {
  distress: 0.65,
  stress: 0.7,
  fatigue: 0.7,
  low_mood: 0.65,
  low_energy: 0.65,
  anhedonia: 0.65,
  sleep_issues: 0.65,
  nervousness: 0.7,
  worry: 0.65,
};

export default function FlagCard({
  flag,
  fresh = false,
  index = 0,
}: {
  flag: ConcordanceFlag;
  fresh?: boolean;
  index?: number;
}) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, x: 28, filter: "blur(8px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-white",
        fresh
          ? "border-red-200 shadow-[0_30px_60px_-30px_rgba(220,38,38,0.35)]"
          : "border-neutral-200"
      )}
    >
      {fresh && (
        <BorderBeam
          size={180}
          duration={6}
          colorFrom="#dc2626"
          colorTo="#f97316"
          borderWidth={1.2}
        />
      )}

      {/* header strip */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-neutral-100 bg-gradient-to-r from-red-50/70 via-red-50/30 to-transparent">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {fresh && (
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-70 tv-pulse-dot" />
            )}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-red-600">
            Concordance gap
          </span>
          <span className="text-[10px] font-mono text-neutral-400">
            · #{index + 1}
          </span>
        </div>
        <span className="text-[10px] font-mono text-neutral-400 tabular-nums">
          {formatTs(flag.ts_ms)}
        </span>
      </header>

      {/* quote */}
      <div className="px-5 py-4 relative">
        <span className="absolute -top-2 left-3 font-['Space_Grotesk'] text-6xl text-red-200/70 leading-none select-none pointer-events-none">
          &ldquo;
        </span>
        <p className="relative pl-6 font-['Space_Grotesk'] text-[18px] leading-snug italic text-neutral-900">
          {flag.utterance_text}
        </p>
        <div className="mt-2 pl-6 text-[10px] font-mono text-neutral-400">
          matched <span className="px-1 py-0.5 rounded bg-red-50 text-red-600 font-semibold">{flag.matched_phrase}</span>
        </div>
      </div>

      {/* biomarker evidence */}
      {flag.biomarker_evidence.length > 0 && (
        <div className="px-5 py-3 bg-neutral-50/60 border-t border-neutral-100">
          <div className="text-[9px] font-bold tracking-[0.22em] uppercase text-neutral-500 mb-2">
            Voice at this moment
          </div>
          <div className="flex flex-col gap-1.5">
            {flag.biomarker_evidence.slice(0, 4).map((b, i) => {
              const thr = THRESHOLDS[b.name] ?? 0.65;
              const breaching = b.value > thr;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.08, duration: 0.4 }}
                  className="flex items-center gap-3"
                >
                  <span className="text-[11px] font-mono text-neutral-700 flex-1">
                    {b.name}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-mono font-bold tabular-nums",
                      breaching ? "text-red-600" : "text-neutral-500"
                    )}
                  >
                    {b.value.toFixed(2)}
                  </span>
                  <div className="relative w-24 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full",
                        breaching ? "bg-red-500" : "bg-amber-400"
                      )}
                      style={{ width: `${Math.min(100, b.value * 100)}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-px bg-neutral-500/60"
                      style={{ left: `${thr * 100}%` }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* gloss */}
      <div className="px-5 py-3 border-t border-neutral-100">
        <div className="text-[9px] font-bold tracking-[0.22em] uppercase text-neutral-500 mb-1">
          Clinical note · Claude haiku
        </div>
        <p className="text-[13px] leading-relaxed text-neutral-800">
          {flag.claude_gloss}
        </p>
      </div>
    </motion.article>
  );
}
