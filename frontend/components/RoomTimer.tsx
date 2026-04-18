"use client";

import React, { useEffect, useState } from "react";

export default function RoomTimer({ startedAtMs }: { startedAtMs: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAtMs) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAtMs]);

  if (!startedAtMs) return <span className="tabular-nums">00:00</span>;
  const s = Math.max(0, Math.floor((now - startedAtMs) / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return <span className="tabular-nums">{mm}:{ss}</span>;
}
