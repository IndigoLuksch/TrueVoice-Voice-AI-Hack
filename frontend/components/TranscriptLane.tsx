"use client";

import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { DashboardEvent, Role } from "@/lib/types";
import { cn } from "@/lib/utils";

type Final = Extract<DashboardEvent, { type: "transcript_final" }>;
type Turn = {
  role: Role;
  utteranceIds: string[];
  text: string;
  startMs: number;
};

function groupIntoTurns(finals: Final[]): Turn[] {
  const turns: Turn[] = [];
  for (const f of finals) {
    const last = turns[turns.length - 1];
    if (last && last.role === f.role) {
      last.text = `${last.text} ${f.text}`.replace(/\s+/g, " ").trim();
      last.utteranceIds.push(f.utterance_id);
    } else {
      turns.push({
        role: f.role,
        text: f.text,
        utteranceIds: [f.utterance_id],
        startMs: f.start_ms,
      });
    }
  }
  return turns;
}

function formatTs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function roleStyle(role: Role) {
  if (role === "patient") {
    return {
      label: "PATIENT",
      labelColor: "text-orange-600",
      accent: "bg-orange-500",
      barBg: "bg-orange-500/10",
      quoteColor: "text-neutral-900",
    };
  }
  return {
    label: "DOCTOR",
    labelColor: "text-neutral-900",
    accent: "bg-neutral-900",
    barBg: "bg-neutral-100",
    quoteColor: "text-neutral-700",
  };
}

export default function TranscriptLane({ events }: { events: DashboardEvent[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [events]);

  const finals = events.filter((e): e is Final => e.type === "transcript_final");
  const turns = groupIntoTurns(finals);

  // Active partial per role (only if newer than the latest final for that role)
  const lastFinalTsByRole: Record<string, number> = {};
  for (const f of finals) lastFinalTsByRole[f.role] = f.end_ms;
  const latestPartialByRole: Record<string, string> = {};
  for (const e of events) {
    if (e.type === "transcript_partial") {
      const lastFinal = lastFinalTsByRole[e.role] ?? 0;
      if (e.ts_ms > lastFinal) latestPartialByRole[e.role] = e.text;
    }
  }

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto px-8 md:px-14 py-10 relative"
    >
      {/* Top kicker */}
      <div className="sticky top-0 -mx-8 md:-mx-14 px-8 md:px-14 pb-5 mb-4 bg-gradient-to-b from-white via-white to-transparent z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 tv-pulse-dot" />
            <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-neutral-500">
              Live transcript · diarized
            </span>
          </div>
          <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-[0.2em]">
            {turns.length} turn{turns.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {turns.length === 0 && Object.keys(latestPartialByRole).length === 0 && (
        <div className="mt-20 text-center">
          <div className="text-[10px] font-bold tracking-[0.25em] uppercase text-neutral-400">
            · Awaiting first utterance
          </div>
          <p className="mt-3 text-xs font-mono text-neutral-300">
            speak into the mic — diarization kicks in after ~2s
          </p>
        </div>
      )}

      <AnimatePresence initial={false}>
        <div className="flex flex-col gap-9">
          {turns.map((t) => {
            const s = roleStyle(t.role);
            return (
              <motion.article
                key={t.utteranceIds[0]}
                layout
                initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
                className="flex gap-5"
              >
                <div className="flex flex-col items-center pt-1">
                  <span className={cn("h-1.5 w-1.5 rounded-full", s.accent)} />
                  <span className="w-px flex-1 bg-neutral-200 mt-2" />
                </div>
                <div className="flex-1 min-w-0">
                  <header className="flex items-baseline gap-3 mb-2">
                    <span className={cn("text-[10px] font-bold tracking-[0.25em] uppercase", s.labelColor)}>
                      {s.label}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-400 tabular-nums">
                      {formatTs(t.startMs)}
                    </span>
                  </header>
                  <p
                    className={cn(
                      "font-['Space_Grotesk'] text-[22px] md:text-[24px] leading-[1.4] tracking-tight",
                      s.quoteColor
                    )}
                  >
                    {t.text}
                  </p>
                </div>
              </motion.article>
            );
          })}

          {Object.entries(latestPartialByRole).map(([role, text]) => {
            if (!text) return null;
            const s = roleStyle(role as Role);
            return (
              <motion.article
                key={`partial-${role}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-5 opacity-70"
              >
                <div className="flex flex-col items-center pt-1">
                  <span className={cn("h-1.5 w-1.5 rounded-full animate-pulse", s.accent)} />
                  <span className="w-px flex-1 bg-neutral-200 mt-2" />
                </div>
                <div className="flex-1 min-w-0">
                  <header className="flex items-baseline gap-3 mb-2">
                    <span className={cn("text-[10px] font-bold tracking-[0.25em] uppercase", s.labelColor)}>
                      {s.label}
                    </span>
                    <span className="text-[10px] font-mono text-neutral-400">
                      typing
                      <span className="inline-block w-[3px] h-[11px] bg-current ml-[3px] align-middle animate-[blink-cursor_1s_step-end_infinite]" />
                    </span>
                  </header>
                  <p className="font-['Space_Grotesk'] text-[20px] md:text-[22px] italic leading-[1.4] tracking-tight text-neutral-500">
                    {text}
                  </p>
                </div>
              </motion.article>
            );
          })}
        </div>
      </AnimatePresence>
    </div>
  );
}
