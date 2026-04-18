"use client";

import React from "react";
import TranscriptLane from "./TranscriptLane";
import BiomarkerLane from "./BiomarkerLane";
import ConcordanceMeter from "./ConcordanceMeter";
import FlagCard from "./FlagCard";
import NavBar from "./NavBar";

export default function Dashboard({ mode, events, onEndConsultation }: any) {
  const flags = events.filter((e: any) => e.type === "concordance_flag");

  return (
    <div className="h-screen bg-white text-black font-sans flex flex-col">
      <NavBar /> {/* Navigation added here */}
      
      <div className="flex-1 grid grid-cols-[300px_1fr_300px] gap-0 overflow-hidden">
        {/* Left Column: Controls & Biomarkers */}
        <section className="border-r border-gray-200 p-6 flex flex-col gap-8 bg-gray-50/50">
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
             <span className="text-[10px] font-bold uppercase tracking-widest">Live Recording</span>
           </div>
           
           {/* Biomarkers in Columns */}
           <BiomarkerLane events={events} />
           
           <button onClick={onEndConsultation} className="mt-auto w-full py-3 border border-black text-black hover:bg-black hover:text-white transition-all uppercase text-[10px] font-bold tracking-widest">
             End Consultation
           </button>
        </section>

        {/* Center: Transcript with Active Bars */}
        <section className="overflow-y-auto border-r border-gray-200">
          <TranscriptLane events={events} />
        </section>

        {/* Right: Analytics */}
        <section className="p-6 flex flex-col gap-4">
          <ConcordanceMeter events={events} />
          <div className="space-y-2">
            {flags.map((flag: any) => <FlagCard key={flag.flag_id} flag={flag} />)}
          </div>
        </section>
      </div>
    </div>
  );
}