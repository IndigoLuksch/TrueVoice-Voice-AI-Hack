"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { startAudioCapture } from "@/lib/audioCapture";
import { useDashboardEvents } from "@/lib/dashboardSocket";
import Dashboard from "@/components/Dashboard";

export default function InPersonConsultation() {
  const { room } = useParams();
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "live" | "ended">("idle");
  const events = useDashboardEvents(room as string);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const startConsultation = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, 
        video: false 
      });
      setLocalStream(stream);
      
      await startAudioCapture({
        stream,
        role: "patient",
        wsUrl: `ws://localhost:8000/ws/audio/patient/${room}`,
      });
      
      setStatus("live");
    } catch (e) {
      console.error("Failed to start capture", e);
    }
  };

  const endConsultation = () => {
    localStream?.getTracks().forEach(t => t.stop());
    setStatus("ended");
    router.push(`/report/${room}`);
  };

  if (status === "idle") {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-black text-white">
        <h1 className="text-4xl font-mono text-orange-500 mb-8">TRUEVOICE_INPERSON</h1>
        <button 
          onClick={startConsultation}
          className="px-8 py-4 bg-orange-500 text-black font-bold uppercase tracking-widest hover:bg-orange-600"
        >
          Start Consultation
        </button>
      </div>
    );
  }

  return (
    <Dashboard 
      mode="inperson" 
      events={events} 
      onEndConsultation={endConsultation} 
    />
  );
}