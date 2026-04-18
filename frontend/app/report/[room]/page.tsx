"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import NavBar from "@/components/NavBar";
import { BACKEND_HTTP } from "@/lib/types";

type ReportBody = {
  markdown: string;
  generated_at_ms: number;
  duration_sec: number;
  flags: Array<{
    flag_id: string;
    utterance_text: string;
    matched_phrase: string;
    claude_gloss: string;
    ts_ms: number;
    biomarker_evidence: { name: string; value: number; ts_ms: number }[];
  }>;
  transcripts: Array<{ role: string; text: string; start_ms: number; end_ms: number }>;
  biomarker_history: Array<{ model: string; name: string; value: number; ts_ms: number }>;
};

function renderMarkdown(md: string): string {
  const escaped = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold uppercase tracking-widest text-orange-500 mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-black mt-8 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-black mt-8 mb-3">$1</h1>')
    .replace(/^\- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p class="text-sm leading-relaxed text-gray-800 my-3">')
    .replace(/^(?!<)/gm, (m) => m);
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
        <main className="max-w-3xl mx-auto px-8 py-16">
          <p className="text-sm text-gray-500 font-mono">
            Generating report… (Claude Sonnet, usually 3–8s)
          </p>
        </main>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="min-h-screen bg-white">
        <NavBar />
        <main className="max-w-3xl mx-auto px-8 py-16">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Report failed</h1>
          <p className="text-sm text-gray-700 font-mono whitespace-pre-wrap">{error}</p>
        </main>
      </div>
    );
  }

  if (!report) return null;

  const generatedAt = new Date(report.generated_at_ms).toLocaleString();
  const mins = Math.floor(report.duration_sec / 60);
  const secs = report.duration_sec % 60;
  const html =
    '<p class="text-sm leading-relaxed text-gray-800 my-3">' +
    renderMarkdown(report.markdown) +
    "</p>";

  return (
    <div className="min-h-screen bg-white">
      <div className="print:hidden">
        <NavBar />
      </div>
      <main className="max-w-3xl mx-auto px-8 py-12 print:py-0 print:px-6">
        <header className="border-b border-gray-200 pb-4 mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-black">Consultation report</h1>
            <div className="text-xs font-mono text-gray-500 mt-1">
              room <span className="text-black">{room}</span> · {generatedAt} ·{" "}
              {mins}m {secs}s · {report.flags.length} flag
              {report.flags.length === 1 ? "" : "s"}
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="print:hidden px-4 py-2 border border-black text-black hover:bg-black hover:text-white transition-all uppercase text-[10px] font-bold tracking-widest"
          >
            Print / PDF
          </button>
        </header>

        <article
          className="prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {report.flags.length > 0 && (
          <section className="mt-10 border-t border-gray-200 pt-6 print:break-inside-avoid">
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-3">
              Flag timeline
            </h2>
            <ul className="space-y-3">
              {report.flags.map((f) => (
                <li
                  key={f.flag_id}
                  className="border-l-2 border-red-500 bg-red-50 p-3"
                >
                  <div className="flex justify-between text-[10px] font-mono text-gray-500 mb-1">
                    <span>{(f.ts_ms / 1000).toFixed(1)}s</span>
                    <span>matched: {f.matched_phrase}</span>
                  </div>
                  <p className="text-sm italic text-gray-700 mb-1">
                    &ldquo;{f.utterance_text}&rdquo;
                  </p>
                  <p className="text-xs text-gray-800">{f.claude_gloss}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
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
