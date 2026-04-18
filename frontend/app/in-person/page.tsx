"use client";

import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startAudioCapture, AudioCaptureHandle } from "@/lib/audioCapture";
import { useDashboardEvents } from "@/lib/dashboardSocket";
import Dashboard from "@/components/Dashboard";
import { BACKEND_HTTP, BACKEND_WS, RoomCreateResponse } from "@/lib/types";

export default function InPersonConsultation() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "starting" | "live" | "ended">("idle");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureRef = useRef<AudioCaptureHandle | null>(null);

  const events = useDashboardEvents(roomId);

  const startConsultation = async () => {
    setError(null);
    setStatus("starting");
    try {
      const res = await fetch(`${BACKEND_HTTP}/api/rooms`, { method: "POST" });
      if (!res.ok) throw new Error(`POST /api/rooms failed: ${res.status}`);
      const room = (await res.json()) as RoomCreateResponse;
      setRoomId(room.room_id);

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
        role: "patient",
        wsUrl: `${BACKEND_WS}/ws/audio/patient/${room.room_id}`,
      });

      setStatus("live");
    } catch (e: unknown) {
      console.error("Failed to start capture", e);
      setError(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    }
  };

  const endConsultation = () => {
    try { captureRef.current?.stop(); } catch {}
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    captureRef.current = null;
    streamRef.current = null;
    setStatus("ended");
    if (roomId) router.push(`/report/${roomId}`);
  };

  if (status === "idle" || status === "starting") {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-black text-white gap-4">
        <h1 className="text-4xl font-mono text-orange-500">TRUEVOICE_INPERSON</h1>
        <button
          onClick={startConsultation}
          disabled={status === "starting"}
          className="px-8 py-4 bg-orange-500 text-black font-bold uppercase tracking-widest hover:bg-orange-600 disabled:opacity-50"
        >
          {status === "starting" ? "Starting…" : "Start Consultation"}
        </button>
        {error && <p className="text-red-400 text-sm font-mono max-w-lg text-center">{error}</p>}
      </div>
    );
  }

  return (
    <Dashboard
      mode="inperson"
      events={events}
      roomId={roomId}
      onEndConsultation={endConsultation}
    />
  );
}
