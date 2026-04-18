"use client";

import React from "react";

export default function FlagCard({ flag }: { flag: any }) {
  return (
    <div className="border-l-2 border-red-500 bg-red-950/10 p-3 animate-in fade-in slide-in-from-right-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">
          {flag.title || "Alert"}
        </span>
      </div>
      <p className="text-xs text-gray-400 font-mono">
        {flag.message}
      </p>
    </div>
  );
}