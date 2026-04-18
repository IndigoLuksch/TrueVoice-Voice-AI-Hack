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
    r"\bi['\u2019]?m (well|good|great)\b",
    r"\bi am (well|good|great)\b",
    r"\bdoing (okay|good|well|great|fantastic|fine)\b",
    r"\b(really|pretty|very|quite) (good|well|fine)\b",
    r"\ball good\b",
    r"\ball right\b",
    r"\balright\b",
    r"\bno problems?\b",
    r"\bno worries\b",
    r"\bnothing (much|wrong|to (worry|flag))\b",
    r"\bcould be worse\b",
    r"\bcan'?t complain\b",
    r"\bsleep(ing)? (fine|well|okay|ok)\b",
    r"\bmood is (fine|good|okay|ok|well)\b",
    r"\bfeel(ing)? (?:(?:very|really|quite|pretty|so|absolutely|super) )?(fine|good|okay|ok|well|great|fantastic|energetic|happy)\b",
    r"\bnot (tired|stressed|worried|sad|bad|too bad|a problem)\b",
    r"\b(had|having) a (good|great|fine) (day|week)\b",
    r"\bnever better\b",
    r"\bperfectly (fine|good|okay|ok)\b",
]
_COMPILED = [re.compile(p, re.IGNORECASE) for p in MINIMIZATION_PATTERNS]

DISTRESS_THRESHOLDS: dict[str, float] = {
    # keyed as "model.name"
    # Note: Thymia's live scale runs roughly 0.0–0.3 for calm speech and
    # 0.3–0.7+ when genuine vocal distress is present. PRD's theoretical
    # 0.65 threshold is too high to ever fire on moderate distress in
    # practice, so we use demo-reliable values here. These are NOT
    # clinical thresholds — they're sensitivity settings for the demo.
    "helios.distress": 0.30,
    "helios.stress": 0.35,
    "helios.fatigue": 0.30,
    "helios.burnout": 0.25,
    "helios.low_self_esteem": 0.30,
    "apollo.low_mood": 0.30,
    "apollo.low_energy": 0.30,
    "apollo.anhedonia": 0.30,
    "apollo.sleep_issues": 0.30,
    "apollo.nervousness": 0.35,
    "apollo.worry": 0.35,
    # Psyche affect: high sad / fear / anger with positive verbal content
    # is a strong concordance signal on its own.
    "psyche.sad": 0.60,
    "psyche.fearful": 0.60,
    "psyche.angry": 0.60,
}

LOOKBACK_MS = 60_000
DEDUP_MS = 10_000
# Speechmatics often emits final transcripts word-by-word (1-2 words per event
# at max_delay=2s), so phrases like "i'm fine" get split across events and a
# per-event regex would never match. We match against a rolling concatenation
# of the last PHRASE_WINDOW_MS of patient speech instead.
PHRASE_WINDOW_MS = 12_000


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
        # Rolling buffer of recent patient transcript fragments. Used to match
        # minimisation phrases that Speechmatics split across multiple finals.
        self._recent: list[tuple[int, str]] = []  # (ts_ms, text)
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

    def _rolling_text(self, now_ms: int) -> str:
        cutoff = now_ms - PHRASE_WINDOW_MS
        self._recent = [(t, x) for t, x in self._recent if t >= cutoff]
        return " ".join(x for _, x in self._recent)

    async def _maybe_flag(self, evt: dict) -> None:
        fragment = (evt.get("text") or "").strip()
        if not fragment:
            return
        now = self._room.now_ms()
        evt_end = evt.get("end_ms", now)
        self._recent.append((evt_end, fragment))
        combined = self._rolling_text(evt_end)

        phrase = _find_match(combined)
        logger.info(
            "[concordance] %s scan fragment=%r window=%r match=%r",
            self._room.room_id, fragment, combined, phrase,
        )
        if not phrase:
            return

        last = self._last_flag_ms_by_phrase.get(phrase, -10 * DEDUP_MS)
        if now - last < DEDUP_MS:
            return
        self._last_flag_ms_by_phrase[phrase] = now

        breaches = _breaches_in_window(self._room.biomarker_history, evt_end)
        logger.info(
            "[concordance] %s matched '%s' biomarkers_in_history=%d breaches=%d",
            self._room.room_id, phrase, len(self._room.biomarker_history), len(breaches),
        )
        if not breaches:
            return

        gloss = await self._claude.gloss_flag(
            utterance=combined,
            matched_phrase=phrase,
            biomarker_evidence=breaches,
        )

        flag = {
            "type": "concordance_flag",
            "flag_id": nanoid_generate(_ID_ALPHABET, 10),
            "utterance_id": evt.get("utterance_id", ""),
            "utterance_text": combined,
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
