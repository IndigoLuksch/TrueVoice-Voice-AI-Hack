"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { useRef, useState } from "react";
import { startAudioCapture, AudioCaptureHandle } from "@/lib/audioCapture";
import { useDashboardEvents } from "@/lib/dashboardSocket";
import Dashboard from "@/components/Dashboard";
import { BACKEND_HTTP, BACKEND_WS } from "@/lib/types";

export default function OnlineClinicianPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.room as string;

  const [status, setStatus] = useState<"idle" | "starting" | "live" | "ended">("idle");
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureRef = useRef<AudioCaptureHandle | null>(null);

  const events = useDashboardEvents(status === "live" ? roomId : null);

  const start = async () => {
    setError(null);
    setStatus("starting");
    try {
      const check = await fetch(`${BACKEND_HTTP}/api/rooms/${roomId}`);
      if (!check.ok) throw new Error(`Room check failed (${check.status})`);
      const meta = (await check.json()) as { exists: boolean };
      if (!meta.exists) {
        throw new Error("This room does not exist or has expired. Create a new session from /online.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      streamRef.current = stream;

      captureRef.current = await startAudioCapture({
        stream,
        role: "clinician",
        wsUrl: `${BACKEND_WS}/ws/audio/clinician/${roomId}`,
      });

      setStatus("live");
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    }
  };

  const endConsultation = () => {
    try {
      captureRef.current?.stop();
    } catch {}
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    captureRef.current = null;
    streamRef.current = null;
    setStatus("ended");
    router.push(`/report/${roomId}`);
  };

  if (status === "idle" || status === "starting") {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4 px-6">
        <Link href="/online" className="absolute top-6 left-6 text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-500 hover:text-orange-400">
          ← Telehealth
        </Link>
        <h1 className="text-2xl font-mono text-orange-500">TRUEVOICE · Clinician</h1>
        <p className="font-mono text-sm text-neutral-400">
          room <span className="text-white">{roomId}</span>
        </p>
        <button
          type="button"
          onClick={start}
          disabled={status === "starting"}
          className="px-8 py-4 bg-orange-500 text-black font-bold uppercase tracking-widest hover:bg-orange-600 disabled:opacity-50"
        >
          {status === "starting" ? "Starting…" : "Allow microphone & open dashboard"}
        </button>
        {error && <p className="text-red-400 text-sm font-mono max-w-lg text-center">{error}</p>}
      </div>
    );
  }

  if (status === "ended") {
    return null;
  }

  return (
    <Dashboard
      mode="telehealth"
      events={events}
      roomId={roomId}
      onEndConsultation={endConsultation}
    />
  );
}
