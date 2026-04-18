"""Concordance engine — detect minimization phrases against biomarker breaches."""
from __future__ import annotations

import asyncio
import logging
import re

from nanoid import generate as nanoid_generate

from app.services.claude import ClaudeService

logger = logging.getLogger("truevoice.concordance")

_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

MINIMIZATION_PATTERNS = [
    r"\bi['\u2019]?m fine\b",
    r"\bi am fine\b",
    r"\bi['\u2019]?m okay\b",
    r"\bi am okay\b",
    r"\bdoing okay\b",
    r"\bi['\u2019]?m good\b",
    r"\bi am good\b",
    r"\bdoing (good|well)\b",
    r"\ball good\b",
    r"\ball right\b",
    r"\balright\b",
    r"\bno problems?\b",
    r"\bnothing much\b",
    r"\bcould be worse\b",
    r"\bcan'?t complain\b",
    r"\bsleep(ing)? (fine|well|okay|ok)\b",
    r"\bmood is (fine|good|okay|ok)\b",
    r"\bfeel(ing)? (fine|good|okay|ok)\b",
]
_COMPILED = [re.compile(p, re.IGNORECASE) for p in MINIMIZATION_PATTERNS]

DISTRESS_THRESHOLDS: dict[str, float] = {
    # keyed as "model.name"
    "helios.distress": 0.65,
    "helios.stress": 0.70,
    "helios.fatigue": 0.70,
    "apollo.low_mood": 0.65,
    "apollo.low_energy": 0.65,
    "apollo.anhedonia": 0.65,
    "apollo.sleep_issues": 0.65,
    "apollo.nervousness": 0.70,
}

LOOKBACK_MS = 60_000
DEDUP_MS = 10_000


def _find_match(text: str) -> str | None:
    for rgx in _COMPILED:
        m = rgx.search(text)
        if m:
            return m.group(0).lower()
    return None


def _breaches_in_window(biomarker_history: list[dict], end_ms: int) -> list[dict]:
    start_ms = end_ms - LOOKBACK_MS
    breaches: dict[str, dict] = {}
    for entry in biomarker_history:
        if not (start_ms <= entry["ts_ms"] <= end_ms + 5_000):
            continue
        key = f"{entry['model']}.{entry['name']}"
        thresh = DISTRESS_THRESHOLDS.get(key)
        if thresh is None or entry["value"] < thresh:
            continue
        # Keep the peak per (model, name)
        prev = breaches.get(key)
        if prev is None or entry["value"] > prev["value"]:
            breaches[key] = entry
    return list(breaches.values())


class ConcordanceEngine:
    def __init__(self, room, claude: ClaudeService | None = None):
        self._room = room
        self._claude = claude or ClaudeService()
        self._last_flag_ms_by_phrase: dict[str, int] = {}
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()

    async def _run(self) -> None:
        queue = self._room.eventbus.subscribe()
        try:
            while True:
                evt = await queue.get()
                if evt.get("type") != "transcript_final":
                    continue
                if evt.get("role") != "patient":
                    continue
                await self._maybe_flag(evt)
        except asyncio.CancelledError:
            raise
        finally:
            self._room.eventbus.unsubscribe(queue)

    async def _maybe_flag(self, evt: dict) -> None:
        text = evt.get("text", "")
        phrase = _find_match(text)
        if not phrase:
            return
        now = self._room.now_ms()
        last = self._last_flag_ms_by_phrase.get(phrase, -10 * DEDUP_MS)
        if now - last < DEDUP_MS:
            return
        self._last_flag_ms_by_phrase[phrase] = now

        breaches = _breaches_in_window(
            self._room.biomarker_history, evt.get("end_ms", now)
        )
        if not breaches:
            return

        gloss = await self._claude.gloss_flag(
            utterance=text,
            matched_phrase=phrase,
            biomarker_evidence=breaches,
        )

        flag = {
            "type": "concordance_flag",
            "flag_id": nanoid_generate(_ID_ALPHABET, 10),
            "utterance_id": evt.get("utterance_id", ""),
            "utterance_text": text,
            "matched_phrase": phrase,
            "biomarker_evidence": [
                {"name": b["name"], "value": float(b["value"]), "ts_ms": b["ts_ms"]}
                for b in breaches
            ],
            "claude_gloss": gloss,
            "ts_ms": now,
        }
        self._room.eventbus.publish(flag)
        self._room.flags.append(flag)
        logger.info(
            "[concordance] %s flagged on '%s': %s",
            self._room.room_id, phrase, gloss,
        )
