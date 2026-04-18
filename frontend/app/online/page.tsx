"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { RoomCreateResponse } from "@/lib/types";
import { normalizeRoomId, ROOM_CODE_LEN } from "@/lib/utils";

export default function OnlineLobbyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<"patient" | "clinician" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existingRoomId, setExistingRoomId] = useState("");

  async function startAs(role: "patient" | "clinician") {
    setError(null);
    setLoading(role);
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      if (!res.ok) throw new Error(`Could not create room (${res.status})`);
      const room = (await res.json()) as RoomCreateResponse;
      router.push(`/online/${role}/${room.room_id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(null);
    }
  }

  function joinExisting(role: "patient" | "clinician") {
    const id = normalizeRoomId(existingRoomId);
    if (!id) {
      setError(`Enter the ${ROOM_CODE_LEN}-digit room code.`);
      return;
    }
    if (id.length !== ROOM_CODE_LEN) {
      setError(`Room code must be exactly ${ROOM_CODE_LEN} digits.`);
      return;
    }
    router.push(`/online/${role}/${id}`);
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center px-6 py-16">
      <Link
        href="/"
        className="absolute top-6 left-6 text-sm md:text-base font-bold uppercase tracking-[0.2em] text-neutral-500 hover:text-orange-400 transition-colors"
      >
        ← Home
      </Link>

      <div className="w-full max-w-xl text-center">
        <p className="text-xs md:text-sm font-bold tracking-[0.25em] uppercase text-orange-400 mb-3">
          Telehealth
        </p>
        <h1 className="font-['Space_Grotesk'] text-4xl md:text-5xl font-bold tracking-tight">
          Start or join a session
        </h1>
        <p className="mt-5 text-base md:text-lg text-neutral-400 leading-relaxed">
          Create a new room and open the patient link on one device and the clinician
          dashboard on another. Both sides need microphone access for live transcription.
        </p>

        <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center">
          <button
            type="button"
            onClick={() => startAs("patient")}
            disabled={loading !== null}
            className="rounded-[10px] border border-white/15 bg-white/5 px-8 py-5 text-sm md:text-base font-bold uppercase tracking-[0.18em] hover:bg-orange-500 hover:text-black hover:border-orange-500 transition-colors disabled:opacity-50"
          >
            {loading === "patient" ? "Creating…" : "I’m the patient"}
          </button>
          <button
            type="button"
            onClick={() => startAs("clinician")}
            disabled={loading !== null}
            className="rounded-[10px] bg-orange-500 px-8 py-5 text-sm md:text-base font-bold uppercase tracking-[0.18em] text-black hover:bg-orange-400 transition-colors disabled:opacity-50"
          >
            {loading === "clinician" ? "Creating…" : "I’m the clinician"}
          </button>
        </div>

        <div className="mt-14 border-t border-white/10 pt-12">
          <p className="text-xs md:text-sm font-mono uppercase tracking-[0.2em] text-neutral-500 mb-3">
            Join with a room code
          </p>
          <p className="text-base md:text-lg text-neutral-400 mb-6 leading-relaxed">
            Enter the <span className="font-mono text-neutral-200">{ROOM_CODE_LEN} digits</span> from whoever created the room first. If each person clicked &ldquo;I&rsquo;m the patient&rdquo; / &ldquo;I&rsquo;m the clinician&rdquo; separately, you have{" "}
            <span className="text-neutral-200">two different rooms</span> — use one code and both join that.
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={ROOM_CODE_LEN}
            value={existingRoomId}
            onChange={(e) => setExistingRoomId(e.target.value.replace(/\D/g, "").slice(0, ROOM_CODE_LEN))}
            placeholder="e.g. 4829"
            className="w-full rounded-lg border border-white/15 bg-black/40 px-5 py-4 text-xl md:text-2xl font-mono tracking-[0.2em] text-white text-center placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500/60"
          />
          <div className="mt-5 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => joinExisting("patient")}
              className="rounded-lg border border-white/10 px-6 py-3.5 text-sm md:text-base font-bold uppercase tracking-[0.15em] text-neutral-200 hover:bg-white/5"
            >
              Join as patient
            </button>
            <button
              type="button"
              onClick={() => joinExisting("clinician")}
              className="rounded-lg border border-white/10 px-6 py-3.5 text-sm md:text-base font-bold uppercase tracking-[0.15em] text-neutral-200 hover:bg-white/5"
            >
              Join as clinician
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-10 text-base md:text-lg text-red-400 font-mono max-w-md mx-auto">{error}</p>
        )}
      </div>
    </div>
  );
}
