"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { BlurFade } from "@/components/ui/blur-fade";
import { DotPattern } from "@/components/ui/dot-pattern";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { startAudioCapture, AudioCaptureHandle } from "@/lib/audioCapture";
import { useDashboardEvents } from "@/lib/dashboardSocket";
import Dashboard from "@/components/Dashboard";
import { BACKEND_WS, RoomCreateResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

type Status = "idle" | "requesting" | "live" | "ended";

export default function InPersonConsultation() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const captureRef = useRef<AudioCaptureHandle | null>(null);

  const events = useDashboardEvents(roomId);

  const start = async () => {
    setError(null);
    setStatus("requesting");
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      if (!res.ok) throw new Error(`POST /api/rooms failed: ${res.status}`);
      const room = (await res.json()) as RoomCreateResponse;

      const s = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      captureRef.current = await startAudioCapture({
        stream: s,
        role: "patient",
        wsUrl: `${BACKEND_WS}/ws/audio/patient/${room.room_id}?mode=inperson`,
      });

      setRoomId(room.room_id);
      setStream(s);
      setStartedAtMs(Date.now());
      setStatus("live");
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    }
  };

  const end = () => {
    try {
      captureRef.current?.stop();
    } catch {}
    try {
      stream?.getTracks().forEach((t) => t.stop());
    } catch {}
    captureRef.current = null;
    setStream(null);
    setStatus("ended");
    if (roomId) router.push(`/report/${roomId}`);
  };

  if (status === "live" || status === "ended") {
    return (
      <Dashboard
        mode="inperson"
        events={events}
        roomId={roomId}
        startedAtMs={startedAtMs}
        localStream={stream}
        onEndConsultation={end}
      />
    );
  }

  // Intro screen
  return (
    <div className="min-h-screen bg-white text-neutral-900 flex flex-col relative overflow-hidden">
      <DotPattern
        className={cn(
          "[mask-image:radial-gradient(ellipse_at_center,white_30%,transparent_70%)]",
          "text-neutral-200/60"
        )}
        width={22}
        height={22}
        cr={0.9}
      />

      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
        <Link
          href="/"
          className="flex items-center gap-2 font-['Space_Grotesk'] text-[15px] font-bold tracking-tight"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="mr-1">
            <path
              d="M9 11L5 7l4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="relative inline-block h-2 w-2 rounded-full bg-orange-500">
            <span className="absolute inset-0 rounded-full bg-orange-500 tv-pulse-dot" />
          </span>
          <span className="text-orange-500">TRUE</span>
          <span className="text-neutral-900 -ml-2">VOICE</span>
        </Link>
        <div className="hidden md:flex items-center gap-2 rounded-full border border-neutral-200 bg-white/70 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 tv-pulse-dot" />
          <span className="text-[10px] font-mono text-neutral-500">pipeline online</span>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-16">
        <BlurFade delay={0.05} className="flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/70 px-3.5 py-1.5 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500 tv-pulse-dot" />
            <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-neutral-600">
              In-person · single laptop
            </span>
          </div>
        </BlurFade>

        <BlurFade delay={0.2}>
          <h1 className="mt-8 text-center font-['Space_Grotesk'] font-black tracking-[-0.04em] leading-[0.92] text-[clamp(2.8rem,9vw,6.5rem)]">
            <span className="text-neutral-900">Ready to</span>
            <br />
            <span className="text-orange-500 italic">listen underneath.</span>
          </h1>
        </BlurFade>

        <BlurFade delay={0.4}>
          <p className="mt-6 max-w-xl text-center text-[15px] leading-relaxed text-neutral-500">
            Start the consultation on this laptop. The mic captures the room. We
            diarize the patient from the doctor, run voice biomarkers on the
            patient voice only, and flag any gap between words and signal in real
            time.
          </p>
        </BlurFade>

        <BlurFade delay={0.55}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <ShimmerButton
              onClick={start}
              disabled={status === "requesting"}
              background="linear-gradient(135deg,#f97316 0%,#ea580c 100%)"
              shimmerColor="#fff"
              shimmerDuration="2.6s"
              borderRadius="10px"
              className={cn(
                "px-7 py-4 text-[12px] font-bold uppercase tracking-[0.22em] shadow-[0_10px_30px_-10px_rgba(249,115,22,0.7)]",
                status === "requesting" && "opacity-60 cursor-not-allowed"
              )}
            >
              {status === "requesting" ? "Preparing…" : "Start consultation"}
            </ShimmerButton>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-[10px] border border-neutral-200 bg-white px-6 py-4 text-[12px] font-bold uppercase tracking-[0.22em] text-neutral-700 hover:border-neutral-900 hover:text-neutral-900 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </BlurFade>

        {error && (
          <BlurFade delay={0.1}>
            <div className="mt-8 max-w-md rounded-md border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-red-600 mb-1">
                · Setup failed
              </p>
              <p className="text-xs font-mono text-red-700 whitespace-pre-wrap break-words">
                {error}
              </p>
            </div>
          </BlurFade>
        )}

        {/* Tech strip */}
        <BlurFade delay={0.8}>
          <div className="mt-20 w-full max-w-2xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { label: "Sample rate", value: "16 kHz", sub: "pcm16 mono" },
                { label: "Frame size", value: "40 ms", sub: "1280 bytes" },
                { label: "Diarization", value: "2-speaker", sub: "doctor · patient" },
                { label: "Biomarkers", value: "Thymia", sub: "helios · apollo · psyche" },
              ].map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9 + i * 0.08, duration: 0.5 }}
                  className="border-t border-neutral-900 pt-3"
                >
                  <div className="font-['Space_Grotesk'] text-xl font-bold tracking-tight">
                    {s.value}
                  </div>
                  <div className="mt-1 text-[10px] font-bold tracking-[0.22em] uppercase text-neutral-900">
                    {s.label}
                  </div>
                  <div className="mt-0.5 text-[9px] font-mono text-neutral-400 uppercase tracking-[0.18em]">
                    {s.sub}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </BlurFade>
      </main>

      <footer className="relative z-10 border-t border-neutral-100 px-6 md:px-10 py-4 text-[10px] font-mono uppercase tracking-[0.22em] text-neutral-400 flex justify-between">
        <span>ephemeral room · in-memory · no recordings stored</span>
        <span>not a diagnostic device</span>
      </footer>
    </div>
  );
}
