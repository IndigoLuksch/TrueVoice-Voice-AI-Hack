"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Props = {
  stream: MediaStream | null;
  label?: string;
  muted?: boolean;
  mirror?: boolean;
  camOff?: boolean;
  micOff?: boolean;
  placeholder?: string;
  className?: string;
  accent?: "orange" | "neutral";
  compact?: boolean;
};

export default function VideoTile({
  stream,
  label,
  muted = false,
  mirror = false,
  camOff = false,
  micOff = false,
  placeholder = "Waiting for video…",
  className,
  accent = "neutral",
  compact = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    if (stream) {
      el.play().catch(() => {});
    }
  }, [stream]);

  const hasVideoTrack = !!stream && stream.getVideoTracks().some((t) => t.enabled && t.readyState === "live");
  const showVideo = hasVideoTrack && !camOff;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-neutral-950 text-white",
        "ring-1 ring-white/10 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]",
        className
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={cn(
          "h-full w-full object-cover transition-opacity duration-200",
          mirror && "-scale-x-100",
          showVideo ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Camera-off / waiting placeholder */}
      {!showVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-neutral-900 via-neutral-950 to-black">
          <div
            className={cn(
              "flex items-center justify-center rounded-full border-2 font-['Space_Grotesk'] font-bold",
              compact ? "h-12 w-12 text-lg" : "h-20 w-20 text-2xl",
              accent === "orange"
                ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
                : "border-white/15 bg-white/5 text-white/80"
            )}
          >
            {label ? label.slice(0, 1).toUpperCase() : "·"}
          </div>
          {!stream ? (
            <p className={cn(
              "font-mono uppercase tracking-[0.22em] text-neutral-500",
              compact ? "text-[9px]" : "text-[10px]"
            )}>
              {placeholder}
            </p>
          ) : (
            <p className={cn(
              "font-mono uppercase tracking-[0.22em] text-neutral-400",
              compact ? "text-[9px]" : "text-[10px]"
            )}>
              Camera off
            </p>
          )}
        </div>
      )}

      {/* Bottom-left label */}
      {label && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/55 backdrop-blur-sm px-2 py-1">
          {micOff ? (
            <MicOffIcon className="h-3 w-3 text-red-400" />
          ) : (
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              accent === "orange" ? "bg-orange-400" : "bg-emerald-400"
            )} />
          )}
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white">
            {label}
          </span>
        </div>
      )}
    </div>
  );
}

function MicOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2 2l12 12M10 4.5v-.5a2 2 0 10-4 0v3m0 2.5a2 2 0 003.9.6M11.5 7v1a3.5 3.5 0 01-.2 1.2M4.5 7v1a3.5 3.5 0 005.8 2.6M8 12v2M6 14h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
