"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { startAudioCapture, AudioCaptureHandle } from "@/lib/audioCapture";
import { BACKEND_WS } from "@/lib/types";
import { normalizeRoomId, ROOM_CODE_LEN, cn } from "@/lib/utils";
import { requestCallMedia, describeMediaError } from "@/lib/userMedia";
import { useVideoCall } from "@/lib/useVideoCall";
import VideoTile from "@/components/VideoTile";
import MeetingControls from "@/components/MeetingControls";

type Status = "idle" | "starting" | "live" | "ended";

export default function OnlinePatientPage() {
  const params = useParams();
  const roomId = normalizeRoomId(params.room);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [hasCamera, setHasCamera] = useState(false);

  const captureRef = useRef<AudioCaptureHandle | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const call = useVideoCall({
    roomId: status === "live" ? roomId : null,
    role: "patient",
    localStream: stream,
    enabled: status === "live",
  });

  const validRoom = !!roomId && roomId.length === ROOM_CODE_LEN;

  const stopEverything = useCallback(() => {
    try { captureRef.current?.stop(); } catch {}
    captureRef.current = null;
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
    }
    streamRef.current = null;
    setStream(null);
  }, []);

  useEffect(() => () => stopEverything(), [stopEverything]);

  const start = async () => {
    setError(null);
    setStatus("starting");
    try {
      const check = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`);
      if (!check.ok) {
        throw new Error(
          `Could not verify room (${check.status}). Check that the backend is reachable.`
        );
      }
      const meta = (await check.json()) as { exists: boolean };
      if (!meta.exists) {
        throw new Error(
          "Room not found. Use the exact 4-digit code from the clinician, or start a new session."
        );
      }

      const media = await requestCallMedia();
      streamRef.current = media.stream;
      setStream(media.stream);
      setHasCamera(media.hasVideo);
      setCamOn(media.hasVideo);
      setMicOn(true);

      captureRef.current = await startAudioCapture({
        stream: media.stream,
        role: "patient",
        wsUrl: `${BACKEND_WS}/ws/audio/patient/${encodeURIComponent(roomId)}`,
      });

      setStatus("live");
    } catch (e) {
      console.error(e);
      setError(describeMediaError(e));
      setStatus("idle");
    }
  };

  const leave = () => {
    stopEverything();
    setStatus("ended");
  };

  const toggleMic = () => {
    const s = streamRef.current;
    if (!s) return;
    const next = !micOn;
    s.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  };

  const toggleCam = () => {
    const s = streamRef.current;
    if (!s || !hasCamera) return;
    const next = !camOn;
    s.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
  };

  if (!validRoom) {
    return (
      <ErrorShell
        title="Invalid room code"
        body={`Use a ${ROOM_CODE_LEN}-digit code from the telehealth lobby.`}
      />
    );
  }

  if (status === "ended") {
    return (
      <ErrorShell title="Session ended" body="You’ve left the call.">
        <Link
          href="/online"
          className="mt-6 inline-flex items-center rounded-[10px] bg-orange-500 px-6 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-black hover:bg-orange-400"
        >
          Back to telehealth
        </Link>
      </ErrorShell>
    );
  }

  if (status !== "live") {
    return (
      <PreJoinScreen
        roomId={roomId}
        onJoin={start}
        starting={status === "starting"}
        error={error}
      />
    );
  }

  const waitingForClinician = !call.peerPresent;
  const peerStream = call.remoteStream;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col relative overflow-hidden">
      {/* Top bar */}
      <header className="relative z-30 flex items-center justify-between px-5 md:px-8 py-3 bg-black/70 backdrop-blur-md border-b border-white/5">
        <Link
          href="/"
          className="flex items-center gap-2 font-['Space_Grotesk'] text-[15px] font-bold tracking-tight"
        >
          <span className="relative inline-block h-2 w-2 rounded-full bg-orange-500">
            <span className="absolute inset-0 rounded-full bg-orange-500 tv-pulse-dot" />
          </span>
          <span className="text-orange-500">TRUE</span>
          <span className="text-white -ml-2">VOICE</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                call.signalingConnected ? "bg-emerald-400 tv-pulse-dot" : "bg-amber-400"
              )}
            />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-300">
              {call.signalingConnected ? "connected" : "connecting…"}
            </span>
          </div>
          <div className="rounded-md bg-white/5 border border-white/10 px-2.5 py-1 text-[10px] font-mono text-neutral-300">
            room <span className="text-orange-400 tracking-widest">{roomId}</span>
          </div>
        </div>
      </header>

      {/* Stage */}
      <main className="relative flex-1 flex items-stretch justify-center p-4 md:p-6">
        <div className="relative flex-1 max-w-7xl mx-auto">
          <VideoTile
            stream={peerStream}
            label="Clinician"
            placeholder={
              waitingForClinician ? "Waiting for the clinician to join…" : "Connecting video…"
            }
            accent="neutral"
            className="h-full w-full aspect-video"
          />

          {/* Self-view PIP */}
          <div className="pointer-events-none absolute bottom-4 right-4 w-[22%] max-w-[240px] min-w-[140px] aspect-video">
            <VideoTile
              stream={stream}
              label="You"
              muted
              mirror
              camOff={!camOn}
              micOff={!micOn}
              accent="orange"
              compact
              className="h-full w-full"
            />
          </div>

          {/* Waiting overlay */}
          {waitingForClinician && (
            <div className="pointer-events-none absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-md border border-white/10 px-4 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-400 tv-pulse-dot" />
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-200">
                Waiting for clinician · share room {roomId}
              </span>
            </div>
          )}
        </div>
      </main>

      {/* Control bar */}
      <footer className="relative z-30 pb-5 pt-2 flex justify-center">
        <MeetingControls
          micOn={micOn}
          camOn={camOn}
          camAvailable={hasCamera}
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
          onLeave={leave}
          leaveLabel="Leave call"
        />
      </footer>
    </div>
  );
}

function PreJoinScreen({
  roomId,
  onJoin,
  starting,
  error,
}: {
  roomId: string;
  onJoin: () => void;
  starting: boolean;
  error: string | null;
}) {
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center px-6 py-16 relative overflow-hidden">
      <Link
        href="/online"
        className="absolute top-6 left-6 text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-500 hover:text-orange-400 transition-colors"
      >
        ← Telehealth
      </Link>

      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500 tv-pulse-dot" />
          <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-neutral-300">
            Patient · ready to join
          </span>
        </div>

        <h1 className="mt-8 font-['Space_Grotesk'] text-4xl md:text-5xl font-bold tracking-tight">
          Join the consultation
        </h1>

        <p className="mt-4 font-mono text-base text-neutral-400">
          room <span className="text-orange-400 tracking-[0.3em] ml-1">{roomId}</span>
        </p>

        <p className="mt-6 text-sm text-neutral-500 leading-relaxed">
          We’ll ask for microphone and camera access. You can mute or turn off
          your camera anytime during the call.
        </p>

        <button
          type="button"
          onClick={onJoin}
          disabled={starting}
          className={cn(
            "mt-10 rounded-[10px] bg-orange-500 px-8 py-4 text-[12px] font-bold uppercase tracking-[0.22em] text-black transition-colors",
            starting ? "opacity-60 cursor-not-allowed" : "hover:bg-orange-400"
          )}
        >
          {starting ? "Connecting…" : "Join call"}
        </button>

        {error && (
          <div className="mt-8 max-w-md rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-left">
            <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-red-400 mb-1">
              · Could not start
            </p>
            <p className="text-xs font-mono text-red-300 whitespace-pre-wrap break-words">
              {error}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorShell({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="font-mono text-orange-500">{title}</p>
      <p className="text-sm text-neutral-400 max-w-md">{body}</p>
      {children ?? (
        <Link
          href="/online"
          className="mt-4 text-sm underline text-neutral-400 hover:text-white"
        >
          Back to telehealth
        </Link>
      )}
    </div>
  );
}
