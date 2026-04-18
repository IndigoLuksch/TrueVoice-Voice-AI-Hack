"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { startAudioCapture, AudioCaptureHandle } from "@/lib/audioCapture";
import { useDashboardEvents } from "@/lib/dashboardSocket";
import Dashboard from "@/components/Dashboard";
import ClinicianVideoPanel from "@/components/ClinicianVideoPanel";
import { BACKEND_WS } from "@/lib/types";
import { normalizeRoomId, ROOM_CODE_LEN, cn } from "@/lib/utils";
import { requestCallMedia, describeMediaError } from "@/lib/userMedia";
import { useVideoCall } from "@/lib/useVideoCall";

type Status = "idle" | "starting" | "live" | "ended";

export default function OnlineClinicianPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = normalizeRoomId(params.room);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [hasCamera, setHasCamera] = useState(false);

  const captureRef = useRef<AudioCaptureHandle | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const events = useDashboardEvents(status === "live" ? roomId : null);

  const call = useVideoCall({
    roomId: status === "live" ? roomId : null,
    role: "clinician",
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
          "Room not found. Use the exact 4-digit code from the lobby, or start a new session."
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
        role: "clinician",
        wsUrl: `${BACKEND_WS}/ws/audio/clinician/${encodeURIComponent(roomId)}`,
      });

      setStartedAtMs(Date.now());
      setStatus("live");
    } catch (e) {
      console.error(e);
      setError(describeMediaError(e));
      setStatus("idle");
    }
  };

  const endConsultation = () => {
    stopEverything();
    setStatus("ended");
    if (roomId) router.push(`/report/${roomId}`);
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
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-red-400 font-mono text-base md:text-lg">
          Invalid room code.
        </p>
        <p className="text-sm text-neutral-500">
          Use a {ROOM_CODE_LEN}-digit code from the telehealth lobby.
        </p>
        <Link href="/online" className="mt-2 text-sm underline text-neutral-400 hover:text-white">
          Back to telehealth
        </Link>
      </div>
    );
  }

  if (status === "ended") {
    return null;
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

  return (
    <Dashboard
      mode="telehealth"
      events={events}
      roomId={roomId}
      startedAtMs={startedAtMs}
      localStream={stream}
      onEndConsultation={endConsultation}
      headerStatusSlot={
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              call.peerConnected
                ? "bg-emerald-500 tv-pulse-dot"
                : call.peerPresent
                ? "bg-amber-500 tv-pulse-dot"
                : "bg-neutral-300"
            )}
          />
          <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-neutral-500">
            Video · {call.peerConnected ? "on" : call.peerPresent ? "handshake" : "waiting"}
          </span>
        </div>
      }
      topRightSlot={
        <ClinicianVideoPanel
          selfStream={stream}
          peerStream={call.remoteStream}
          peerPresent={call.peerPresent}
          signalingConnected={call.signalingConnected}
          peerConnected={call.peerConnected}
          micOn={micOn}
          camOn={camOn}
          camAvailable={hasCamera}
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
        />
      }
    />
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
            Clinician · ready to open
          </span>
        </div>

        <h1 className="mt-8 font-['Space_Grotesk'] text-4xl md:text-5xl font-bold tracking-tight">
          Open the consultation
        </h1>

        <p className="mt-4 font-mono text-base text-neutral-400">
          room <span className="text-orange-400 tracking-[0.3em] ml-1">{roomId}</span>
        </p>

        <p className="mt-6 text-sm text-neutral-500 leading-relaxed">
          We’ll ask for microphone and camera access, connect your video to the
          patient, and open the live dashboard with transcript, biomarkers, and
          concordance gaps.
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
          {starting ? "Connecting…" : "Open dashboard"}
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
