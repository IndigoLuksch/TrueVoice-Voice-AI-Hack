"use client";

import React from "react";
import TranscriptLane from "./TranscriptLane";
import BiomarkerLane from "./BiomarkerLane";
import ConcordanceMeter from "./ConcordanceMeter";
import FlagCard from "./FlagCard";
import NavBar from "./NavBar";
import { ConcordanceFlag, DashboardEvent } from "@/lib/types";

type Props = {
  mode: "inperson" | "telehealth";
  events: DashboardEvent[];
  roomId?: string | null;
  onEndConsultation: () => void;
};

export default function Dashboard({ mode, events, roomId, onEndConsultation }: Props) {
  const flags = events
    .filter((e): e is ConcordanceFlag => e.type === "concordance_flag")
    .slice()
    .reverse();

  return (
    <div className="h-screen bg-white text-black font-sans flex flex-col">
      <NavBar />

      <div className="flex-1 grid grid-cols-[320px_1fr_320px] gap-0 overflow-hidden">
        {/* Left: Controls + biomarkers */}
        <section className="border-r border-gray-200 p-6 flex flex-col gap-6 bg-gray-50/50 overflow-y-auto">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              {mode === "inperson" ? "Live recording" : "Live call"}
            </span>
          </div>
          {roomId && (
            <div className="text-[10px] font-mono text-gray-500">
              room: <span className="text-black">{roomId}</span>
            </div>
          )}

          <BiomarkerLane events={events} />

          <button
            onClick={onEndConsultation}
            className="mt-auto w-full py-3 border border-black text-black hover:bg-black hover:text-white transition-all uppercase text-[10px] font-bold tracking-widest"
          >
            End Consultation
          </button>
        </section>

        {/* Center: Transcript */}
        <section className="overflow-y-auto border-r border-gray-200">
          <TranscriptLane events={events} />
        </section>

        {/* Right: Concordance meter + flag stack */}
        <section className="p-6 flex flex-col gap-4 overflow-y-auto">
          <ConcordanceMeter events={events} />
          <div className="space-y-2">
            {flags.length === 0 ? (
              <p className="text-[10px] text-gray-400 italic">No concordance flags yet.</p>
            ) : (
              flags.map((flag) => <FlagCard key={flag.flag_id} flag={flag} />)
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
