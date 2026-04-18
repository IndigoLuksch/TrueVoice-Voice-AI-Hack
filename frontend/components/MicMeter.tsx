"use client";

import React, { useEffect, useRef, useState } from "react";

export default function MicMeter({ stream }: { stream: MediaStream | null }) {
  const [level, setLevel] = useState(0);
  const barsRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream) return;
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
      setLevel(Math.min(1, (peak / 128) * 2.2));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      try { src.disconnect(); } catch {}
      try { ctx.close(); } catch {}
    };
  }, [stream]);

  // 32 bars, bell-curve height scaled by live level
  const bars = 32;
  return (
    <div className="relative h-16 w-full flex items-center">
      <div ref={barsRef} className="flex-1 flex items-center justify-center gap-[3px] h-full">
        {Array.from({ length: bars }).map((_, i) => {
          const mid = Math.abs(i - bars / 2) / (bars / 2);
          const base = 0.15 + (1 - mid) * 0.45;
          const phase = Math.sin(i * 0.9 + level * 12) * 0.22;
          const h = Math.max(0.12, Math.min(1, base + level * 0.6 + phase));
          return (
            <span
              key={i}
              className="w-[3px] rounded-full bg-orange-500/80 transition-[transform,opacity] duration-100"
              style={{
                height: `${Math.round(h * 100)}%`,
                opacity: 0.55 + level * 0.45,
              }}
            />
          );
        })}
      </div>
      <span className="pointer-events-none absolute inset-0 overflow-hidden rounded">
        <span className="tv-scan absolute top-0 h-full w-[24%] bg-gradient-to-r from-transparent via-orange-400/25 to-transparent" />
      </span>
    </div>
  );
}
