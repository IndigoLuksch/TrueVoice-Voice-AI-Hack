"use client";

import React from "react";
import { ConcordanceFlag } from "@/lib/types";

export default function FlagCard({ flag }: { flag: ConcordanceFlag }) {
  return (
    <div className="border-l-2 border-red-500 bg-red-50 p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest">
          Concordance gap
        </span>
        <span className="text-[10px] text-gray-400 font-mono">
          {(flag.ts_ms / 1000).toFixed(1)}s
        </span>
      </div>
      <p className="text-xs text-gray-700 italic mb-1">
        &ldquo;{flag.utterance_text}&rdquo;
      </p>
      <p className="text-[10px] text-gray-500 mb-2 font-mono">
        matched: <span className="text-red-600">{flag.matched_phrase}</span>
      </p>
      {flag.biomarker_evidence.length > 0 && (
        <ul className="text-[10px] text-gray-600 mb-2 font-mono">
          {flag.biomarker_evidence.slice(0, 3).map((b, i) => (
            <li key={i}>
              {b.name} = <span className="text-red-600">{b.value.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-800 font-medium">{flag.claude_gloss}</p>
    </div>
  );
}
