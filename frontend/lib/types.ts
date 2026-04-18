export type Role = "patient" | "clinician";
export type BioModel = "helios" | "apollo" | "psyche";

export type TranscriptPartial = {
  type: "transcript_partial";
  role: Role;
  text: string;
  ts_ms: number;
};

export type TranscriptFinal = {
  type: "transcript_final";
  role: Role;
  text: string;
  start_ms: number;
  end_ms: number;
  utterance_id: string;
};

export type BiomarkerProgress = {
  type: "biomarker_progress";
  model: BioModel;
  name: string;
  speech_seconds: number;
  trigger_seconds: number;
};

export type BiomarkerResult = {
  type: "biomarker_result";
  model: "helios" | "apollo";
  name: string;
  value: number;
  ts_ms: number;
};

export type PsycheUpdate = {
  type: "psyche_update";
  affect: Record<string, number>;
  ts_ms: number;
};

export type BiomarkerEvidence = {
  name: string;
  value: number;
  ts_ms: number;
};

export type ConcordanceFlag = {
  type: "concordance_flag";
  flag_id: string;
  utterance_id: string;
  utterance_text: string;
  matched_phrase: string;
  biomarker_evidence: BiomarkerEvidence[];
  claude_gloss: string;
  ts_ms: number;
};

export type CallStatus = {
  type: "call_status";
  status: "connecting" | "connected" | "ended";
  peers: number;
};

export type DashboardEvent =
  | TranscriptPartial
  | TranscriptFinal
  | BiomarkerProgress
  | BiomarkerResult
  | PsycheUpdate
  | ConcordanceFlag
  | CallStatus;

export type RoomCreateResponse = {
  room_id: string;
  created_at_ms: number;
};

/**
 * Prefer same-origin HTTP API routes (`/api/...`) — see `next.config.ts` rewrites.
 * Kept for scripts or rare direct backend calls.
 */
export const BACKEND_HTTP =
  process.env.NEXT_PUBLIC_BACKEND_HTTP_URL ?? "http://localhost:8000";

/** WebSocket URL must point at the real backend (use `wss://` when the site is served over HTTPS). */
export const BACKEND_WS =
  process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? "ws://localhost:8000";
