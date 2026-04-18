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
