"""Claude integration for clinical glossing and reports.

Haiku for the hot path (sub-second gloss on each flag).
Sonnet reserved for the end-of-consult report (Phase 7).
"""
from __future__ import annotations

import asyncio
import logging

from anthropic import AsyncAnthropic

from app.config import settings

logger = logging.getLogger("truevoice.claude")


GLOSS_SYSTEM = (
    "You are a clinical documentation assistant helping a GP note concordance "
    "gaps between a patient's self-report and their voice biomarkers. You do "
    "NOT diagnose. You state the gap objectively in one sentence suitable for "
    "a UK GP clinical note. Use neutral, non-accusatory language. Never "
    "suggest the patient is lying. Use British English."
)

GLOSS_USER_TEMPLATE = (
    'Patient just said: "{utterance}"\n'
    'Matched minimization phrase: "{phrase}"\n'
    "Voice biomarkers breaching threshold in the preceding 60 seconds:\n"
    "{biomarker_lines}\n\n"
    "Write one sentence (max 30 words) for the GP's note."
)


REPORT_SYSTEM = (
    "You are a clinical concordance analyst. Your ONE job is to surface "
    "moments where the patient's WORDS and their VOICE BIOMARKERS disagreed — "
    "the GP already has the transcript, they don't need a summary. "
    "This is about minimisation and unconscious downplaying (a well-documented "
    "clinical pattern), never about lying. Be concrete: quote the patient, "
    "name the biomarker, state the divergence. If there were no gaps, say so "
    "in one sentence and stop. Use British English, clinical register, no "
    "hedging filler."
)

REPORT_USER_TEMPLATE = (
    "Session duration: {duration_sec} seconds.\n"
    "Concordance gaps detected: {n_flags}.\n\n"
    "Patient utterances:\n"
    "{patient_transcript}\n\n"
    "Biomarker readings:\n"
    "{biomarker_summary}\n\n"
    "Detected concordance gaps:\n"
    "{flags_detail}\n\n"
    "Produce a 2-4 sentence clinical summary paragraph. Plain prose, no "
    "headings, no bullets, no markdown. Describe the DOMINANT pattern of "
    "divergence (or say the patient was aligned if no gaps). Concrete and "
    "specific — reference biomarkers and quote fragments. No generic advice, "
    "no 'consider further assessment' filler. Max 80 words total."
)


def _summarize_biomarkers(history: list[dict]) -> str:
    if not history:
        return "(no biomarker data collected)"
    # Take every 15s window and report one peak-per-key within it.
    # Cap total rows at 30.
    WINDOW_MS = 15_000
    rows: list[str] = []
    if history:
        start = history[0]["ts_ms"]
        end = history[-1]["ts_ms"]
        cursor = start
        while cursor <= end and len(rows) < 30:
            window_end = cursor + WINDOW_MS
            bucket = [e for e in history if cursor <= e["ts_ms"] < window_end]
            if bucket:
                # Pick top 3 by value to keep summary readable.
                bucket.sort(key=lambda e: e["value"], reverse=True)
                for e in bucket[:3]:
                    rows.append(
                        f"[{e['ts_ms'] // 1000}s] {e['model']}.{e['name']}={e['value']:.2f}"
                    )
            cursor = window_end
    return "\n".join(rows[:30]) or "(no biomarker data collected)"


def _report_fallback(
    duration_sec: int,
    patient_transcripts: list[dict],
    biomarker_history: list[dict],
    flags: list[dict],
) -> str:
    if not flags:
        return (
            "Patient self-report and voice biomarkers were broadly aligned "
            f"across the {duration_sec}-second session. No minimisation "
            "patterns flagged."
        )
    top_marker = None
    for f in flags:
        for e in f.get("biomarker_evidence", []):
            if top_marker is None or e["value"] > top_marker["value"]:
                top_marker = e
    marker_phrase = (
        f"Dominant signal: {top_marker['name']} at {top_marker['value']:.2f}."
        if top_marker
        else ""
    )
    return (
        f"{len(flags)} concordance gap(s) detected: patient reported "
        f"wellbeing while voice biomarkers indicated elevated distress. "
        f"{marker_phrase}"
    )


class ClaudeService:
    def __init__(self, api_key: str = ""):
        self._client = AsyncAnthropic(
            api_key=api_key or settings.anthropic_api_key.get_secret_value()
        )

    async def gloss_flag(
        self,
        utterance: str,
        matched_phrase: str,
        biomarker_evidence: list[dict],
        timeout_s: float = 2.0,
    ) -> str:
        """Return a one-sentence clinical note. Falls back deterministically on timeout/error."""
        biomarker_lines = "\n".join(
            f"- {e['name']} ({e['model']}): {e['value']:.2f}"
            for e in biomarker_evidence
        )
        user_prompt = GLOSS_USER_TEMPLATE.format(
            utterance=utterance,
            phrase=matched_phrase,
            biomarker_lines=biomarker_lines,
        )
        try:
            resp = await asyncio.wait_for(
                self._client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=120,
                    temperature=0.3,
                    system=GLOSS_SYSTEM,
                    messages=[{"role": "user", "content": user_prompt}],
                ),
                timeout=timeout_s,
            )
            # resp.content is a list of content blocks (TextBlock for text output)
            pieces = [
                getattr(b, "text", "")
                for b in resp.content
                if getattr(b, "type", "") == "text"
            ]
            text = " ".join(p.strip() for p in pieces if p).strip()
            if text:
                return text
        except Exception as e:
            logger.warning("[claude] gloss failed (%s), using fallback", e)
        return self._fallback(biomarker_evidence)

    @staticmethod
    def _fallback(evidence: list[dict]) -> str:
        if not evidence:
            return "Patient self-reports positively; biomarker data not yet available."
        top = max(evidence, key=lambda e: e["value"])
        return (
            f"Patient self-reports positively but biomarkers indicate elevated "
            f"{top['name']} ({top['value']:.2f})."
        )

    async def generate_report(
        self,
        *,
        duration_sec: int,
        patient_transcripts: list[dict],
        biomarker_history: list[dict],
        flags: list[dict],
        timeout_s: float = 30.0,
    ) -> str:
        patient_transcript = "\n".join(
            f"[{t['start_ms'] // 1000}s] {t['text']}"
            for t in patient_transcripts
        ) or "(no patient transcripts captured)"

        # Downsample biomarker_history to ~every 15s, cap at 30 rows.
        biomarker_summary = _summarize_biomarkers(biomarker_history)

        flags_detail = "\n".join(
            f"- [{f['ts_ms'] // 1000}s] \"{f['utterance_text']}\" "
            f"(matched '{f['matched_phrase']}'): {f['claude_gloss']}"
            for f in flags
        ) or "(none)"

        user_prompt = REPORT_USER_TEMPLATE.format(
            duration_sec=duration_sec,
            patient_transcript=patient_transcript,
            biomarker_summary=biomarker_summary,
            n_flags=len(flags),
            flags_detail=flags_detail,
        )

        try:
            resp = await asyncio.wait_for(
                self._client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=1200,
                    temperature=0.2,
                    system=REPORT_SYSTEM,
                    messages=[{"role": "user", "content": user_prompt}],
                ),
                timeout=timeout_s,
            )
            pieces = [
                getattr(b, "text", "") for b in resp.content if getattr(b, "type", "") == "text"
            ]
            text = " ".join(p.strip() for p in pieces if p).strip()
            if text:
                return text
        except Exception as e:
            logger.warning("[claude] report failed (%s), using fallback", e)
        return _report_fallback(duration_sec, patient_transcripts, biomarker_history, flags)
