"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { DotPattern } from "@/components/ui/dot-pattern";
import TranscriptLane from "./TranscriptLane";
import BiomarkerLane from "./BiomarkerLane";
import ConcordanceMeter from "./ConcordanceMeter";
import FlagCard from "./FlagCard";
import MicMeter from "./MicMeter";
import RoomTimer from "./RoomTimer";
import { ConcordanceFlag, DashboardEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  mode: "inperson" | "telehealth";
  events: DashboardEvent[];
  roomId?: string | null;
  startedAtMs?: number | null;
  localStream?: MediaStream | null;
  onEndConsultation: () => void;
  /**
   * Optional slot rendered at the top of the right rail (above the flag stack).
   * Used by telehealth to show the peer video tile + controls.
   */
  topRightSlot?: React.ReactNode;
  /** Extra status pips rendered in the header next to Mic/STT/Biomarkers. */
  headerStatusSlot?: React.ReactNode;
};

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function StatusPip({
  label,
  active,
  tone = "emerald",
}: {
  label: string;
  active: boolean;
  tone?: "emerald" | "amber" | "red" | "neutral";
}) {
  const dot =
    !active
      ? "bg-neutral-300"
      : tone === "emerald"
      ? "bg-emerald-500"
      : tone === "amber"
      ? "bg-amber-500"
      : tone === "red"
      ? "bg-red-500"
      : "bg-neutral-500";
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot, active && "tv-pulse-dot")} />
      <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-neutral-500">
        {label}
      </span>
    </div>
  );
}

export default function Dashboard({
  mode,
  events,
  roomId,
  startedAtMs,
  localStream,
  onEndConsultation,
  topRightSlot,
  headerStatusSlot,
}: Props) {
  const now = useNow(1000);

  const flags = useMemo(
    () =>
      events
        .filter((e): e is ConcordanceFlag => e.type === "concordance_flag")
        .slice()
        .reverse(),
    [events]
  );

  // Detect a newly-arrived flag to trigger the viewport-wide scan.
  const [flagFireKey, setFlagFireKey] = useState(0);
  const lastSeenFlagId = useRef<string | null>(null);
  useEffect(() => {
    const latest = flags[0];
    if (latest && latest.flag_id !== lastSeenFlagId.current) {
      lastSeenFlagId.current = latest.flag_id;
      setFlagFireKey((k) => k + 1);
    }
  }, [flags]);

  // Connection health — derived from event recency.
  const lastTranscriptTs = useMemo(() => {
    let last = 0;
    for (const e of events) {
      if (e.type === "transcript_partial" || e.type === "transcript_final") {
        const t = (e as { ts_ms?: number; end_ms?: number }).ts_ms ?? (e as { end_ms?: number }).end_ms ?? 0;
        if (t > last) last = t;
      }
    }
    return last;
  }, [events]);

  const lastBiomarkerTs = useMemo(() => {
    let last = 0;
    for (const e of events) {
      if (
        e.type === "biomarker_progress" ||
        e.type === "biomarker_result" ||
        e.type === "psyche_update"
      ) {
        const t = (e as { ts_ms?: number }).ts_ms ?? 0;
        if (t > last) last = t;
      }
    }
    return last;
  }, [events]);

  const sessionMs = startedAtMs ? now - startedAtMs : 0;
  const sttActive = sessionMs - lastTranscriptTs < 10_000 && lastTranscriptTs > 0;
  const bmActive = sessionMs - lastBiomarkerTs < 20_000 && lastBiomarkerTs > 0;

  return (
    <div className="min-h-screen flex flex-col bg-white text-neutral-900 relative overflow-hidden">
      {/* Background texture */}
      <DotPattern
        className={cn(
          "[mask-image:radial-gradient(ellipse_at_top,white_30%,transparent_70%)]",
          "text-neutral-200/60"
        )}
        width={26}
        height={26}
        cr={0.8}
      />

      {/* Viewport-wide red scan when a new flag fires */}
      <AnimatePresence>
        {flagFireKey > 0 && (
          <motion.div
            key={flagFireKey}
            className="pointer-events-none fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4, times: [0, 0.3, 1] }}
          >
            <motion.div
              className="absolute top-0 bottom-0 w-[40%] bg-gradient-to-r from-transparent via-red-500/18 to-transparent"
              initial={{ x: "-60%" }}
              animate={{ x: "160%" }}
              transition={{ duration: 1.2, ease: [0.4, 0, 0.6, 1] }}
            />
            <span className="absolute left-0 right-0 top-0 h-[2px] bg-red-500/80" />
            <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-red-500/80" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar */}
      <header className="relative z-40 border-b border-neutral-100 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 md:px-8 py-3.5">
          <div className="flex items-center gap-5">
            <Link
              href="/"
              className="flex items-center gap-2 font-['Space_Grotesk'] text-[15px] font-bold tracking-tight"
            >
              <span className="relative inline-block h-2 w-2 rounded-full bg-orange-500">
                <span className="absolute inset-0 rounded-full bg-orange-500 tv-pulse-dot" />
              </span>
              <span className="text-orange-500">TRUE</span>
              <span className="text-neutral-900 -ml-2">VOICE</span>
            </Link>
            <span className="hidden md:inline-block h-4 w-px bg-neutral-200" />
            <div className="hidden md:flex items-center gap-3">
              <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-neutral-500">
                {mode === "inperson" ? "In-person" : "Telehealth"} · live
              </span>
              {roomId && (
                <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-mono text-neutral-600">
                  room {roomId}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="hidden md:flex items-center gap-4">
              <StatusPip label="Mic" active={!!localStream} />
              <StatusPip label="STT" active={sttActive} tone={sttActive ? "emerald" : "amber"} />
              <StatusPip label="Biomarkers" active={bmActive} tone={bmActive ? "emerald" : "amber"} />
              {headerStatusSlot}
            </div>
            <div className="hidden md:flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60 tv-pulse-dot" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
              <span className="text-[10px] font-mono text-neutral-600 tabular-nums">
                <RoomTimer startedAtMs={startedAtMs ?? null} />
              </span>
            </div>
            <button
              onClick={onEndConsultation}
              className="inline-flex items-center gap-2 rounded-[8px] bg-neutral-950 text-white px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] hover:bg-neutral-800 transition-colors"
            >
              End consultation
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M3 6h6m0 0L6 3m3 3L6 9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main grid */}
      <main className="relative flex-1 grid grid-cols-[300px_1fr_380px] min-h-0">
        {/* LEFT RAIL — mic + concordance + biomarkers */}
        <aside className="border-r border-neutral-100 bg-neutral-50/50 px-5 py-6 flex flex-col gap-6 overflow-y-auto">
          <section>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-neutral-500">
                Mic · ambient capture
              </span>
              <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-[0.18em]">
                16 kHz
              </span>
            </div>
            <MicMeter stream={localStream ?? null} />
            <div className="mt-2 flex items-center justify-between text-[9px] font-mono text-neutral-400 uppercase tracking-[0.2em]">
              <span>40 ms frames</span>
              <span>pcm16 · mono</span>
            </div>
          </section>

          <div className="h-px w-full bg-neutral-200/70" />

          <section className="flex flex-col items-stretch">
            <ConcordanceMeter events={events} />
          </section>

          <div className="h-px w-full bg-neutral-200/70" />

          <section>
            <BiomarkerLane events={events} />
          </section>
        </aside>

        {/* CENTER — conversation */}
        <section className="min-w-0 bg-white border-r border-neutral-100">
          <TranscriptLane events={events} />
        </section>

        {/* RIGHT RAIL — optional video panel + flag stack */}
        <aside className="bg-neutral-50/50 flex flex-col min-h-0">
          {topRightSlot && (
            <div className="flex-none border-b border-neutral-100 bg-white">
              {topRightSlot}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <header className="sticky top-0 z-10 bg-neutral-50/90 backdrop-blur-sm border-b border-neutral-100 px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold tracking-[0.25em] uppercase text-orange-500">
                    · Concordance gaps
                  </div>
                  <div className="mt-1 font-['Space_Grotesk'] text-xl font-bold tracking-tight">
                    {flags.length === 0 ? (
                      <span className="text-neutral-400">Aligned</span>
                    ) : (
                      <span className="tabular-nums">
                        {flags.length}{" "}
                        <span className="text-neutral-400 text-base font-medium">
                          gap{flags.length === 1 ? "" : "s"}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-[9px] font-mono text-neutral-400 uppercase tracking-[0.2em] text-right leading-tight">
                  claude
                  <br />
                  haiku 4.5
                </div>
              </div>
            </header>

            <div className="p-4 flex flex-col gap-4">
              {flags.length === 0 ? (
                <EmptyFlagState />
              ) : (
                flags.map((f, i) => (
                  <FlagCard
                    key={f.flag_id}
                    flag={f}
                    fresh={i === 0}
                    index={flags.length - 1 - i}
                  />
                ))
              )}
            </div>
          </div>
        </aside>
      </main>

      {/* Bottom telemetry strip */}
      <footer className="relative z-30 border-t border-neutral-100 bg-white/80 backdrop-blur-sm px-6 md:px-8 py-2 flex items-center justify-between text-[9px] font-mono uppercase tracking-[0.22em] text-neutral-400">
        <div className="flex items-center gap-4">
          <span>mic → 16 khz pcm</span>
          <span className="text-neutral-200">/</span>
          <span>stt · speechmatics medical</span>
          <span className="text-neutral-200">/</span>
          <span>biomarkers · thymia sentinel</span>
        </div>
        <div className="flex items-center gap-3">
          <span>{events.length} events</span>
          <span className="text-neutral-200">·</span>
          <span className="tabular-nums">
            t+<RoomTimer startedAtMs={startedAtMs ?? null} />
          </span>
        </div>
      </footer>
    </div>
  );
}

function EmptyFlagState() {
  return (
    <div className="relative rounded-xl border border-dashed border-neutral-200 bg-white px-4 py-8 text-center overflow-hidden">
      <div className="relative z-10">
        <div className="text-[10px] font-bold tracking-[0.25em] uppercase text-neutral-400">
          · Awaiting signal
        </div>
        <p className="mt-3 text-xs text-neutral-500 leading-relaxed max-w-[240px] mx-auto">
          We fire a flag when a minimization phrase meets breaching biomarkers in the preceding 60&nbsp;s.
        </p>
        <div className="mt-5 flex items-center justify-center gap-[3px] h-8">
          {Array.from({ length: 18 }).map((_, i) => (
            <span
              key={i}
              className="tv-bar w-[2px] rounded-full bg-orange-500/40"
              style={{
                height: `${30 + Math.sin(i * 0.7) * 25}%`,
                animationDelay: `${(i % 10) * 90}ms`,
                animationDuration: `${1100 + (i % 5) * 120}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
