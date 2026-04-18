import type { DashboardEvent } from "./types";

/** Static preview data for the dashboard design preview page — matches backend dashboard event schema. */
export const mockEvents: DashboardEvent[] = [
  {
    type: "transcript_partial",
    role: "clinician",
    text: "How have you been feeling since we last met?",
    ts_ms: 1000,
  },
  {
    type: "transcript_partial",
    role: "patient",
    text: "Honestly, I've just been feeling a bit overwhelmed.",
    ts_ms: 3500,
  },
  {
    type: "transcript_final",
    role: "clinician",
    text: "How have you been feeling since we last met?",
    start_ms: 800,
    end_ms: 2800,
    utterance_id: "ut_mock_doc_1",
  },
  {
    type: "transcript_final",
    role: "patient",
    text: "Honestly, I've just been feeling a bit overwhelmed.",
    start_ms: 3000,
    end_ms: 6200,
    utterance_id: "ut_mock_pat_1",
  },
  {
    type: "biomarker_progress",
    model: "helios",
    name: "distress",
    speech_seconds: 12,
    trigger_seconds: 30,
  },
  {
    type: "biomarker_result",
    model: "helios",
    name: "distress",
    value: 0.62,
    ts_ms: 8000,
  },
  {
    type: "psyche_update",
    affect: {
      neutral: 0.2,
      happy: 0.05,
      sad: 0.35,
      angry: 0.1,
      fearful: 0.2,
      disgusted: 0.05,
      surprised: 0.05,
    },
    ts_ms: 9000,
  },
  {
    type: "concordance_flag",
    flag_id: "flag_mock_1",
    utterance_id: "ut_mock_pat_2",
    utterance_text: "I'm fine, really — sleeping okay.",
    matched_phrase: "I'm fine",
    biomarker_evidence: [
      { name: "apollo.low_mood", value: 0.72, ts_ms: 8800 },
      { name: "apollo.sleep_issues", value: 0.68, ts_ms: 8850 },
    ],
    claude_gloss:
      "Patient self-reports well-being but voice biomarkers suggest elevated low mood and sleep disturbance in the preceding minute.",
    ts_ms: 12000,
  },
  {
    type: "call_status",
    status: "connected",
    peers: 2,
  },
];
