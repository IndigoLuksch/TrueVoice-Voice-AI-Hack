"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import NavBar from "@/components/NavBar";
import { BACKEND_HTTP } from "@/lib/types";

type Flag = {
  flag_id: string;
  utterance_text: string;
  matched_phrase: string;
  claude_gloss: string;
  ts_ms: number;
  biomarker_evidence: { name: string; value: number; ts_ms: number }[];
};

type ReportBody = {
  markdown: string;
  generated_at_ms: number;
  duration_sec: number;
  flags: Flag[];
  transcripts: Array<{ role: string; text: string; start_ms: number; end_ms: number }>;
  biomarker_history: Array<{ model: string; name: string; value: number; ts_ms: number }>;
};

const THRESHOLDS: Record<string, number> = {
  distress: 0.65,
  stress: 0.7,
  fatigue: 0.7,
  low_mood: 0.65,
  low_energy: 0.65,
  anhedonia: 0.65,
  sleep_issues: 0.65,
  nervousness: 0.7,
  worry: 0.65,
};

function riskScore(flags: Flag[]): number {
  let max = 0;
  for (const f of flags) {
    for (const b of f.biomarker_evidence) {
      const thr = THRESHOLDS[b.name] ?? 0.65;
      max = Math.max(max, b.value / thr);
    }
  }
  return Math.min(100, Math.round(max * 70));
}

function RiskGauge({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  const color =
    score >= 70 ? "#dc2626" : score >= 40 ? "#f59e0b" : "#10b981";
  const label = score >= 70 ? "HIGH" : score >= 40 ? "MODERATE" : "LOW";

  return (
    <div className="flex items-center gap-5">
      <div className="relative w-32 h-32">
        <svg width="128" height="128" className="-rotate-90">
          <circle cx="64" cy="64" r={r} stroke="#f3f4f6" strokeWidth="10" fill="none" />
          <circle
            cx="64"
            cy="64"
            r={r}
            stroke={color}
            strokeWidth="10"
            fill="none"
            strokeDasharray={`${dash} ${c}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 700ms ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color }}>
            {score}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">
            / 100
          </span>
        </div>
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Risk score
        </div>
        <div
          className="text-xl font-bold uppercase tracking-wider mt-1"
          style={{ color }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

function BiomarkerBar({ name, value }: { name: string; value: number }) {
  const thr = THRESHOLDS[name] ?? 0.65;
  const breaching = value > thr;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-gray-800 capitalize">
          {name.replace(/_/g, " ")}
        </span>
        <span
          className={`text-sm font-mono font-bold ${
            breaching ? "text-red-600" : "text-gray-500"
          }`}
        >
          {value.toFixed(2)}
        </span>
      </div>
      <div className="relative w-full h-3 bg-gray-100 rounded-sm overflow-hidden">
        <div
          className={`h-full transition-all ${
            breaching ? "bg-red-500" : "bg-amber-400"
          }`}
          style={{ width: `${Math.min(100, value * 100)}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-px bg-gray-400"
          style={{ left: `${thr * 100}%` }}
          title={`threshold ${thr}`}
        />
      </div>
    </div>
  );
}

export default function ReportPage() {
  const params = useParams<{ room: string }>();
  const room = params?.room;
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportBody | null>(null);

  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    (async () => {
      try {
        const post = await fetch(`${BACKEND_HTTP}/api/report/${room}`, { method: "POST" });
        if (!post.ok) {
          const body = await post.text();
          throw new Error(`POST ${post.status}: ${body}`);
        }
        const get = await fetch(`${BACKEND_HTTP}/api/report/${room}`);
        if (!get.ok) throw new Error(`GET ${get.status}`);
        const data = (await get.json()) as ReportBody;
        if (!cancelled) {
          setReport(data);
          setState("ready");
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setState("error");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [room]);

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-white">
        <NavBar />
        <main className="max-w-4xl mx-auto px-8 py-24 text-center">
          <div className="inline-block h-6 w-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-gray-600 font-mono">Analysing concordance…</p>
        </main>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="min-h-screen bg-white">
        <NavBar />
        <main className="max-w-4xl mx-auto px-8 py-16">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Report failed</h1>
          <p className="text-sm text-gray-700 font-mono whitespace-pre-wrap">{error}</p>
        </main>
      </div>
    );
  }

  if (!report) return null;

  const nGaps = report.flags.length;
  const score = riskScore(report.flags);
  const mins = Math.floor(report.duration_sec / 60);
  const secs = report.duration_sec % 60;
  const generatedAt = new Date(report.generated_at_ms).toLocaleString();

  return (
    <div className="min-h-screen bg-white">
      <div className="print:hidden">
        <NavBar />
      </div>
      <main className="max-w-4xl mx-auto px-8 py-10 print:py-0 print:px-6">
        {/* Top: headline + Risk gauge */}
        <header className="flex items-start justify-between gap-8 mb-12 pb-6 border-b border-gray-200">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
              Concordance report
            </div>
            <h1
              className={`text-4xl font-bold leading-tight ${
                nGaps === 0 ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {nGaps === 0
                ? "Patient aligned"
                : `${nGaps} concordance gap${nGaps === 1 ? "" : "s"}`}
            </h1>
            <div className="text-[11px] font-mono text-gray-400 mt-3 flex gap-3 flex-wrap">
              <span>room {room}</span>
              <span>·</span>
              <span>{mins}m {secs}s</span>
              <span>·</span>
              <span>{generatedAt}</span>
            </div>
          </div>
          <RiskGauge score={score} />
        </header>

        {/* Gap stack: quote (big) + biomarkers (visual) */}
        {nGaps > 0 ? (
          <section className="space-y-10 mb-16">
            {report.flags.map((f, i) => (
              <article
                key={f.flag_id}
                className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-8 print:break-inside-avoid"
              >
                {/* Left: the quote */}
                <div className="relative">
                  <span className="absolute -top-4 -left-2 text-8xl font-serif text-orange-200 leading-none select-none">
                    &ldquo;
                  </span>
                  <p className="relative text-2xl font-serif italic text-gray-900 leading-relaxed pl-6">
                    {f.utterance_text}
                  </p>
                  <div className="mt-3 flex items-center gap-3 text-[10px] font-mono text-gray-400 uppercase tracking-widest pl-6">
                    <span className="inline-block w-6 h-6 rounded-full bg-red-100 text-red-600 font-bold text-xs flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span>{(f.ts_ms / 1000).toFixed(1)}s</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-red-500">matched &ldquo;{f.matched_phrase}&rdquo;</span>
                  </div>
                </div>

                {/* Right: biomarkers that contradicted */}
                <div className="flex flex-col gap-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    Voice at this moment
                  </div>
                  {f.biomarker_evidence.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">no breaching biomarkers</p>
                  ) : (
                    f.biomarker_evidence
                      .slice(0, 4)
                      .map((b, j) => <BiomarkerBar key={j} name={b.name} value={b.value} />)
                  )}
                </div>
              </article>
            ))}
          </section>
        ) : (
          <div className="mb-10 p-6 bg-emerald-50 border border-emerald-100 rounded">
            <p className="text-sm text-emerald-800">
              Voice biomarkers matched self-report throughout the session. No minimisation
              patterns flagged.
            </p>
          </div>
        )}

        {/* Small summary */}
        <section className="border-t border-gray-200 pt-6">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
            Summary
          </div>
          <p className="text-sm text-gray-700 leading-relaxed max-w-2xl">
            {report.markdown.trim()}
          </p>
          <button
            onClick={() => window.print()}
            className="print:hidden mt-6 px-4 py-2 border border-black text-black hover:bg-black hover:text-white transition-all uppercase text-[10px] font-bold tracking-widest"
          >
            Print / PDF
          </button>
        </section>
      </main>

      <style>{`
        @media print {
          body { background: white; }
          @page { size: A4; margin: 1.5cm; }
        }
      `}</style>
    </div>
  );
}
