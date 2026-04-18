"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useRef, useState } from "react";
import { startAudioCapture, AudioCaptureHandle } from "@/lib/audioCapture";
import { BACKEND_WS } from "@/lib/types";
import { normalizeRoomId, ROOM_CODE_LEN } from "@/lib/utils";

export default function OnlinePatientPage() {
  const params = useParams();
  const roomId = normalizeRoomId(params.room);

  const [status, setStatus] = useState<"idle" | "starting" | "live" | "ended">("idle");
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureRef = useRef<AudioCaptureHandle | null>(null);

  if (!roomId || roomId.length !== ROOM_CODE_LEN) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-red-400 font-mono text-base md:text-lg">
          Invalid room code. Use a {ROOM_CODE_LEN}-digit code from the telehealth lobby.
        </p>
        <Link href="/online" className="text-sm underline text-neutral-400 hover:text-white">
          Back to telehealth
        </Link>
      </div>
    );
  }

  const start = async () => {
    setError(null);
    setStatus("starting");
    try {
      const check = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`);
      if (!check.ok) {
        throw new Error(
          `Could not verify room (${check.status}). If this is production, set BACKEND_HTTP_ORIGIN or NEXT_PUBLIC_BACKEND_HTTP_URL on the frontend service so /api proxies to your FastAPI host.`,
        );
      }
      const meta = (await check.json()) as { exists: boolean };
      if (!meta.exists) {
        throw new Error(
          "This room was not found on the server. Use the exact 4-digit code from whoever created the room, or start a new session — rooms are cleared if the backend restarted.",
        );
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
        role: "patient",
        wsUrl: `${BACKEND_WS}/ws/audio/patient/${roomId}`,
      });

      setStatus("live");
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    }
  };

  const leave = () => {
    try {
      captureRef.current?.stop();
    } catch {}
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    captureRef.current = null;
    streamRef.current = null;
    setStatus("ended");
  };

  if (status === "ended") {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4 px-6">
        <p className="font-mono text-orange-500">Session ended</p>
        <Link href="/online" className="text-sm underline text-neutral-400 hover:text-white">
          Back to telehealth
        </Link>
      </div>
    );
  }

  if (status === "live") {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center gap-6 px-6">
        <div className="text-center max-w-md">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
              Patient · live
            </span>
          </div>
          <p className="font-mono text-lg md:text-xl text-neutral-300">
            room <span className="text-orange-400 tracking-widest">{roomId}</span>
          </p>
          <p className="mt-4 text-sm text-neutral-500 leading-relaxed">
            Your microphone is sending audio for transcription and biomarkers. Keep this tab
            open during the consultation.
          </p>
        </div>
        <button
          type="button"
          onClick={leave}
          className="rounded-[10px] border border-white/20 px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-white hover:text-black transition-colors"
        >
          Leave session
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-6 px-6">
      <Link href="/online" className="absolute top-6 left-6 text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-500 hover:text-orange-400">
        ← Telehealth
      </Link>
      <h1 className="text-2xl font-mono text-orange-500">TRUEVOICE · Patient</h1>
      <p className="font-mono text-lg md:text-xl text-neutral-400">
        room <span className="text-white tracking-widest">{roomId}</span>
      </p>
      <button
        type="button"
        onClick={start}
        disabled={status === "starting"}
        className="px-8 py-4 bg-orange-500 text-black font-bold uppercase tracking-widest hover:bg-orange-600 disabled:opacity-50"
      >
        {status === "starting" ? "Starting…" : "Allow microphone & connect"}
      </button>
      {error && <p className="text-red-400 text-sm font-mono max-w-lg text-center">{error}</p>}
    </div>
  );
}
