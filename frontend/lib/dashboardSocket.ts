"use client";

import { useEffect, useRef, useState } from "react";
import { BACKEND_WS, DashboardEvent } from "./types";

const MAX_EVENTS = 1000;

export function useDashboardEvents(roomId: string | null | undefined): DashboardEvent[] {
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const retryRef = useRef(500);

  useEffect(() => {
    if (!roomId) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      ws = new WebSocket(`${BACKEND_WS}/ws/dashboard/${roomId}`);
      ws.onopen = () => { retryRef.current = 500; };
      ws.onmessage = (m) => {
        try {
          const evt = JSON.parse(m.data) as DashboardEvent;
          setEvents((prev) => {
            const next = [...prev, evt];
            return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
          });
        } catch {}
      };
      ws.onclose = () => {
        if (closed) return;
        const delay = retryRef.current;
        retryRef.current = Math.min(retryRef.current * 2, 8000);
        timeout = setTimeout(connect, delay);
      };
      ws.onerror = () => { try { ws?.close(); } catch {} };
    };

    connect();

    return () => {
      closed = true;
      if (timeout) clearTimeout(timeout);
      try { ws?.close(); } catch {}
    };
  }, [roomId]);

  return events;
}
