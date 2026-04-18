"use client";

import React from "react";
import VideoTile from "./VideoTile";
import MeetingControls from "./MeetingControls";
import { cn } from "@/lib/utils";

type Props = {
  selfStream: MediaStream | null;
  peerStream: MediaStream | null;
  peerPresent: boolean;
  signalingConnected: boolean;
  peerConnected: boolean;
  micOn: boolean;
  camOn: boolean;
  camAvailable: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
};

export default function ClinicianVideoPanel({
  selfStream,
  peerStream,
  peerPresent,
  signalingConnected,
  peerConnected,
  micOn,
  camOn,
  camAvailable,
  onToggleMic,
  onToggleCam,
}: Props) {
  const statusLabel = !signalingConnected
    ? "Connecting…"
    : !peerPresent
    ? "Waiting for patient"
    : peerConnected
    ? "Connected"
    : "Handshake…";

  const statusTone = !signalingConnected
    ? "amber"
    : peerConnected
    ? "emerald"
    : "amber";

  return (
    <div className="px-4 pt-4 pb-3 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold tracking-[0.25em] uppercase text-neutral-500">
          Patient · live video
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              statusTone === "emerald" && "bg-emerald-500 tv-pulse-dot",
              statusTone === "amber" && "bg-amber-500 tv-pulse-dot"
            )}
          />
          <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-neutral-500">
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="relative aspect-video w-full">
        <VideoTile
          stream={peerPresent ? peerStream : null}
          label="Patient"
          accent="orange"
          placeholder={peerPresent ? "Connecting video…" : "Share room code with patient"}
          className="h-full w-full"
        />

        {/* Self-view PIP */}
        <div className="pointer-events-none absolute bottom-2 right-2 w-[34%] min-w-[72px] max-w-[120px] aspect-video">
          <VideoTile
            stream={selfStream}
            label="You"
            muted
            mirror
            camOff={!camOn}
            micOff={!micOn}
            accent="neutral"
            compact
            className="h-full w-full ring-1 ring-black/20"
          />
        </div>
      </div>

      <div className="flex justify-center pt-1">
        <MeetingControls
          micOn={micOn}
          camOn={camOn}
          camAvailable={camAvailable}
          onToggleMic={onToggleMic}
          onToggleCam={onToggleCam}
          showLeave={false}
          compact
          className="bg-neutral-900/90 border-neutral-800"
        />
      </div>
    </div>
  );
}
