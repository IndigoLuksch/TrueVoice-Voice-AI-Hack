"use client";

import React from "react";
import Link from "next/link";

const AGENTS = [
  { name: "Thymia", desc: "Emotional AI", icon: "♥" },
  { name: "Schematics", desc: "Logic Structuring", icon: "⌗" },
  { name: "OpenAI", desc: "LLM Core", icon: "⟡" },
];

export default function TrueVoiceLanding() {
  return (
    <div className="h-screen bg-white text-black font-['Inter'] flex flex-col overflow-hidden">
      {/* Updated Navbar */}
      <nav className="flex items-center justify-between px-8 py-6 w-full z-50">
        <div className="text-2xl font-bold tracking-tighter font-['Space_Grotesk'] text-orange-500">
          TRUEVOICE
        </div>
        <div className="flex gap-8 text-xs uppercase tracking-widest font-bold text-gray-500">
          <Link href="/about" className="hover:text-black transition-colors">About</Link>
          <Link href="/online" className="hover:text-black transition-colors">Online Meeting</Link>
          <Link href="/in-person" className="hover:text-black transition-colors">In-Person Meeting</Link>
        </div>
      </nav>

      {/* Hero / Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center relative">
        <div className="z-10 text-center px-4">
          <h1 className="text-7xl md:text-9xl font-black tracking-tighter mb-3 font-['Space_Grotesk'] text-black">
            TRUEVOICE
          </h1>
          <p className="text-gray-400 mb-12 tracking-[0.2em] uppercase text-xs font-['Inter']">
            Autonomous Communication Intelligence
          </p>

          {/* Central Action Buttons */}
          <div className="flex gap-4 justify-center">
            <Link
              href="/online"
              className="px-8 py-4 bg-orange-500 text-white font-bold rounded hover:bg-orange-600 transition-all uppercase tracking-widest text-sm font-['Inter']"
            >
              Online Meeting
            </Link>
            <Link
              href="/in-person"
              className="px-8 py-4 border border-black text-black font-bold rounded hover:bg-black hover:text-white transition-all uppercase tracking-widest text-sm font-['Inter']"
            >
              In-Person Meeting
            </Link>
          </div>
        </div>
      </main>

      {/* Agent Pipeline */}
      <section className="w-full px-6 pb-12">
        <div className="max-w-2xl mx-auto flex justify-center gap-4">
          {AGENTS.map((agent) => (
            <div key={agent.name} className="flex flex-col items-center p-4 border border-gray-200 bg-white rounded min-w-[120px]">
              <span className="text-orange-500 text-2xl mb-2">{agent.icon}</span>
              <span className="text-[10px] font-['Space_Grotesk'] font-bold text-black uppercase tracking-wider">
                {agent.name}
              </span>
              <span className="text-[8px] font-['Inter'] text-gray-400 uppercase tracking-widest">
                {agent.desc}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}