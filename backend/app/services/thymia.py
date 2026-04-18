"""Thymia Sentinel integration (patient-only).

One ThymiaService per room. Subscribes to room.audio_distributors["patient"],
pipes PCM16 chunks to Sentinel, and publishes biomarker_progress /
biomarker_result / psyche_update events on room.eventbus.

Payload shape discovery is defensive — we accept multiple likely SDK
response shapes and log anything we can't map so we can inspect and
tighten later.
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import Any

logger = logging.getLogger("truevoice.thymia")


def _default_client_factory(api_key: str, room_id: str):
    """Build a thymia_sentinel.SentinelClient for this room."""
    from thymia_sentinel import SentinelClient

    return SentinelClient(
        user_label=f"room-{room_id}",
        policies=["wellbeing-awareness"],
        biomarkers=["helios", "apollo", "psyche"],
        sample_rate=16000,
        api_key=api_key or None,
    )


class ThymiaService:
    """One instance per room. Feeds patient audio into Sentinel and emits events."""

    def __init__(
        self,
        client_factory: Callable[[str, str], Any] | None = None,
        api_key: str = "",
    ):
        self._client_factory = client_factory or _default_client_factory
        self._api_key = api_key
        self._client: Any = None  # set during start()
        self._send_lock = asyncio.Lock()  # protect send_user_transcript from races

    async def start(self, room) -> None:
        distributor = room.audio_distributors.get("patient")
        if distributor is None:
            logger.warning("[thymia] no patient distributor for %s", room.room_id)
            return
        audio_queue = distributor.subscribe()

        client = self._client_factory(self._api_key, room.room_id)
        self._client = client

        @client.on_progress
        async def _on_progress(payload):
            try:
                self._emit_progress(room, payload)
            except Exception as e:
                logger.exception("[thymia] progress handler error: %s", e)

        @client.on_policy_result
        async def _on_policy(payload):
            try:
                self._emit_policy_result(room, payload)
            except Exception as e:
                logger.exception("[thymia] policy handler error: %s", e)

        try:
            await client.connect()
            logger.info("[thymia] %s connected", room.room_id)
            try:
                while True:
                    chunk = await audio_queue.get()
                    try:
                        await client.send_user_audio(chunk)
                    except Exception as e:
                        logger.warning("[thymia] send_user_audio failed: %s", e)
            except asyncio.CancelledError:
                logger.info("[thymia] %s cancelled", room.room_id)
                raise
            finally:
                try:
                    await client.close()
                except Exception:
                    pass
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.exception("[thymia] %s session error: %s", room.room_id, e)
        finally:
            self._client = None
            distributor.unsubscribe(audio_queue)

    async def send_transcript(self, text: str) -> None:
        """Forward a patient transcript to Sentinel for policy context."""
        client = self._client
        if client is None or not text:
            return
        async with self._send_lock:
            try:
                await client.send_user_transcript(text, is_final=True)
            except Exception as e:
                logger.warning("[thymia] send_transcript failed: %s", e)

    def _emit_progress(self, room, payload) -> None:
        """Map a ProgressResult to biomarker_progress events.

        Expected shape (from thymia_sentinel.models.ProgressResult):
          {"type": "PROGRESS",
           "biomarkers": {"helios": {"speech_seconds": x, "trigger_seconds": y, ...}, ...},
           "timestamp": ...}

        We also accept list-of-dicts and object-with-__dict__ shapes defensively.
        """
        logger.debug("[thymia] progress raw: %r", payload)
        data = self._to_dict(payload)
        if not data:
            logger.warning("[thymia] unrecognized progress payload shape: %r", payload)
            return

        biomarkers = data.get("biomarkers")
        if isinstance(biomarkers, dict):
            for name, entry in biomarkers.items():
                e = self._to_dict(entry) or {}
                speech_seconds = float(e.get("speech_seconds") or 0)
                trigger_seconds = float(e.get("trigger_seconds") or 0)
                room.eventbus.publish({
                    "type": "biomarker_progress",
                    "model": name,
                    "name": name,
                    "speech_seconds": speech_seconds,
                    "trigger_seconds": trigger_seconds,
                })
            return

        # Fallback: list of entries each identifying its own model.
        entries = self._coerce_entries(data)
        emitted = False
        for entry in entries:
            model = (
                entry.get("model") or entry.get("biomarker") or entry.get("name")
            )
            if not model:
                continue
            speech_seconds = float(
                entry.get("speech_seconds")
                or entry.get("elapsed_seconds")
                or 0
            )
            trigger_seconds = float(
                entry.get("trigger_seconds")
                or entry.get("threshold_seconds")
                or 0
            )
            room.eventbus.publish({
                "type": "biomarker_progress",
                "model": model,
                "name": entry.get("name") or model,
                "speech_seconds": speech_seconds,
                "trigger_seconds": trigger_seconds,
            })
            emitted = True
        if not emitted:
            logger.warning("[thymia] unrecognized progress payload shape: %r", payload)

    def _emit_policy_result(self, room, payload) -> None:
        """Map a PolicyResult to biomarker_result / psyche_update events.

        Expected shape (from thymia_sentinel.models.PolicyResult):
          {"type": "POLICY_RESULT", "policy": str, "policy_name": str,
           "triggered_at_turn": int, "timestamp": float, "result": dict}

        The `result` dict schema is opaque per the SDK typing, so we try
        several likely shapes: per-biomarker nested dicts with `value`
        and/or `affect`; a flat `scores`/`biomarkers`/`results` list; or
        top-level biomarker keys.
        """
        logger.debug("[thymia] policy raw: %r", payload)
        data = self._to_dict(payload)
        if not data:
            logger.warning("[thymia] unrecognized policy payload shape: %r", payload)
            return

        result = data.get("result")
        if result is None:
            # Maybe the payload itself is the result.
            result = data

        result = self._to_dict(result) or {}

        handled = False

        # Shape A: {"helios": {...}, "apollo": {...}, "psyche": {...}} at top level.
        for model_name in ("helios", "apollo", "psyche"):
            if model_name in result:
                entry = self._to_dict(result[model_name]) or {}
                if self._publish_biomarker(room, model_name, entry):
                    handled = True

        # Shape B: list under a common key.
        if not handled:
            for key in ("scores", "biomarkers", "results"):
                lst = result.get(key)
                if isinstance(lst, list):
                    for item in lst:
                        e = self._to_dict(item) or {}
                        model_name = (
                            str(e.get("model") or e.get("biomarker") or e.get("name") or "")
                        ).lower()
                        if not model_name:
                            continue
                        if self._publish_biomarker(room, model_name, e):
                            handled = True

        if not handled:
            logger.warning(
                "[thymia] unrecognized policy result shape (payload=%r)", payload
            )

    def _publish_biomarker(self, room, model_name: str, entry: dict) -> bool:
        """Publish one biomarker entry. Returns True if something was emitted."""
        model_name = (model_name or "").lower()
        name = entry.get("name") or entry.get("metric") or model_name
        ts_ms = room.now_ms()

        if model_name == "psyche":
            affect = entry.get("affect") or entry.get("scores") or entry.get("emotions")
            if isinstance(affect, dict):
                try:
                    affect_f = {k: float(v) for k, v in affect.items()}
                except (TypeError, ValueError):
                    logger.warning("[thymia] psyche affect non-numeric: %r", affect)
                    return False
                room.eventbus.publish({
                    "type": "psyche_update",
                    "affect": affect_f,
                    "ts_ms": ts_ms,
                })
                return True
            logger.warning("[thymia] psyche entry without affect: %r", entry)
            return False

        if model_name not in ("helios", "apollo"):
            logger.warning("[thymia] unknown biomarker model: %r", model_name)
            return False

        value = entry.get("value")
        if value is None:
            value = entry.get("score")
        if value is None:
            logger.warning("[thymia] %s entry has no value: %r", model_name, entry)
            return False
        try:
            value = float(value)
        except (TypeError, ValueError):
            logger.warning("[thymia] non-numeric value: %r", entry)
            return False

        room.eventbus.publish({
            "type": "biomarker_result",
            "model": model_name,
            "name": name,
            "value": value,
            "ts_ms": ts_ms,
        })
        room.biomarker_history.append({
            "model": model_name,
            "name": name,
            "value": value,
            "ts_ms": ts_ms,
        })
        return True

    @staticmethod
    def _to_dict(payload) -> dict:
        """Best-effort conversion of SDK payload to a plain dict."""
        if payload is None:
            return {}
        if isinstance(payload, dict):
            return payload
        if hasattr(payload, "model_dump"):
            try:
                return payload.model_dump()
            except Exception:
                pass
        if hasattr(payload, "_asdict"):
            try:
                return dict(payload._asdict())
            except Exception:
                pass
        if hasattr(payload, "__dict__"):
            return dict(payload.__dict__)
        return {}

    @staticmethod
    def _coerce_entries(payload) -> list[dict]:
        """Normalize to a list of dicts."""
        if payload is None:
            return []
        if isinstance(payload, list):
            return [
                p if isinstance(p, dict) else getattr(p, "__dict__", {})
                for p in payload
            ]
        if isinstance(payload, dict):
            for key in ("scores", "biomarkers", "results", "progress"):
                if key in payload and isinstance(payload[key], list):
                    return payload[key]
            return [payload]
        return []
