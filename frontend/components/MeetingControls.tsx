"use client";

import React from "react";
import { cn } from "@/lib/utils";

type Props = {
  micOn: boolean;
  camOn: boolean;
  camAvailable: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onLeave?: () => void;
  leaveLabel?: string;
  showLeave?: boolean;
  compact?: boolean;
  className?: string;
};

export default function MeetingControls({
  micOn,
  camOn,
  camAvailable,
  onToggleMic,
  onToggleCam,
  onLeave,
  leaveLabel = "Leave",
  showLeave = true,
  compact = false,
  className,
}: Props) {
  const size = compact ? "h-10 w-10" : "h-12 w-12";
  const iconSize = compact ? 18 : 20;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/60 backdrop-blur-md px-2 py-2",
        className
      )}
    >
      <PillButton
        active={micOn}
        onClick={onToggleMic}
        sizeClass={size}
        title={micOn ? "Mute microphone" : "Unmute microphone"}
      >
        {micOn ? <MicIcon size={iconSize} /> : <MicOffIcon size={iconSize} />}
      </PillButton>

      <PillButton
        active={camOn}
        disabled={!camAvailable}
        onClick={onToggleCam}
        sizeClass={size}
        title={
          !camAvailable
            ? "No camera available"
            : camOn
            ? "Turn off camera"
            : "Turn on camera"
        }
      >
        {camOn ? <CamIcon size={iconSize} /> : <CamOffIcon size={iconSize} />}
      </PillButton>

      {showLeave && onLeave && (
        <button
          type="button"
          onClick={onLeave}
          className={cn(
            "inline-flex items-center gap-2 rounded-full bg-red-600 px-4 text-[11px] font-bold uppercase tracking-[0.22em] text-white hover:bg-red-500 transition-colors",
            compact ? "h-10" : "h-12"
          )}
        >
          <HangupIcon size={iconSize} />
          <span className="hidden sm:inline">{leaveLabel}</span>
        </button>
      )}
    </div>
  );
}

function PillButton({
  active,
  disabled,
  onClick,
  sizeClass,
  title,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  sizeClass: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center justify-center rounded-full transition-colors",
        sizeClass,
        disabled
          ? "bg-neutral-800 text-neutral-600 cursor-not-allowed"
          : active
          ? "bg-white/10 text-white hover:bg-white/15"
          : "bg-red-600 text-white hover:bg-red-500"
      )}
    >
      {children}
    </button>
  );
}

function MicIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2a3 3 0 00-3 3v6a3 3 0 006 0V5a3 3 0 00-3-3z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19 11v1a7 7 0 01-14 0v-1M12 19v3M8 22h8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MicOffIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M15 9.35V5a3 3 0 00-5.94-.6M9 9v2a3 3 0 004.5 2.6M19 11v1a7 7 0 01-11.2 5.6M12 19v3M8 22h8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CamIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 10l5-3v10l-5-3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function CamOffIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M16 10l5-3v10l-5-3M5 6h9a2 2 0 012 2v8M5 6a2 2 0 00-2 2v8a2 2 0 002 2h9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HangupIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 11c6-6 12-6 18 0l-2.5 2.5a1 1 0 01-1.3.1L15 12a1 1 0 01-.3-.9L15 9a14 14 0 00-6 0l.3 2.1a1 1 0 01-.3.9L6.8 13.6a1 1 0 01-1.3-.1L3 11z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
