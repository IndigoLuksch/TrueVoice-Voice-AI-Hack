"""Speechmatics RT integration with speaker diarization.

One SpeechmaticsService runs per (room, role). Emits one transcript event per
speaker segment so in-person (single-mic, two voices) produces separate
clinician / patient transcripts.

When `split_speakers=True` (in-person mode), the first distinct Speechmatics
speaker label seen in the stream is mapped to "clinician" (doctors typically
open the conversation) and the second to "patient". When False (telehealth,
one speaker per stream), every segment keeps the URL role.
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import Any

from nanoid import generate as nanoid_generate

logger = logging.getLogger("truevoice.speechmatics")

_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"


def _default_client_factory(api_key: str):
    from speechmatics.rt import (
        AsyncClient,
        AudioEncoding,
        AudioFormat,
        ConversationConfig,
        OperatingPoint,
        ServerMessageType,
        SpeakerDiarizationConfig,
        TranscriptionConfig,
    )

    class _RealClient:
        default_transcription_config = TranscriptionConfig(
            language="en",
            domain="medical",
            operating_point=OperatingPoint.ENHANCED,
            enable_partials=True,
            diarization="speaker",
            speaker_diarization_config=SpeakerDiarizationConfig(
                max_speakers=2,
                speaker_sensitivity=0.7,
                prefer_current_speaker=True,
            ),
            conversation_config=ConversationConfig(
                end_of_utterance_silence_trigger=0.7
            ),
            max_delay=2.0,
        )
        default_audio_format = AudioFormat(
            encoding=AudioEncoding.PCM_S16LE,
            chunk_size=4096,
            sample_rate=16000,
        )

        def __init__(self):
            self._inner = AsyncClient(api_key=api_key)

        async def __aenter__(self):
            await self._inner.__aenter__()
            return self

        async def __aexit__(self, *a):
            return await self._inner.__aexit__(*a)

        def on(self, message_type_name: str):
            mt = getattr(ServerMessageType, message_type_name)
            return self._inner.on(mt)

        async def start_session(self, transcription_config, audio_format):
            await self._inner.start_session(
                transcription_config=transcription_config,
                audio_format=audio_format,
            )

        async def send_audio(self, chunk: bytes):
            await self._inner.send_audio(chunk)

        async def stop_session(self):
            await self._inner.stop_session()

    return _RealClient()


_DEBUG_FIRST_N = 3
_debug_seen = 0


def _extract_segments(message) -> list[tuple[str | None, str]]:
    """Return [(speaker_label_or_None, text), ...] grouped by speaker runs.

    Consecutive words/punctuation from the same speaker collapse into one
    segment. Punctuation attaches to the preceding word (or the next if it
    leads). Returns [] if nothing useful.
    """
    from speechmatics.rt import TranscriptResult

    global _debug_seen
    try:
        result = TranscriptResult.from_message(message)
    except Exception:
        return []

    # Dump raw structure of first few finals so we can see whether
    # Speechmatics is attaching speaker labels at all.
    if _debug_seen < _DEBUG_FIRST_N and result.results:
        _debug_seen += 1
        try:
            speakers_seen = {
                r.alternatives[0].speaker
                for r in result.results
                if r.alternatives
            }
            logger.info(
                "[sm-debug] msg %d: speakers=%s text=%r",
                _debug_seen,
                speakers_seen,
                (result.metadata.transcript if result.metadata else "")[:100],
            )
        except Exception:
            logger.exception("[sm-debug] inspect failed")

    if not result.results:
        text = (result.metadata.transcript if result.metadata else "").strip()
        return [(None, text)] if text else []

    segments: list[tuple[str | None, str]] = []
    current_speaker: str | None = "__unset__"
    current_words: list[str] = []

    def flush():
        nonlocal current_speaker, current_words
        if current_words and current_speaker != "__unset__":
            joined = "".join(current_words).strip()
            joined = joined.replace(" ,", ",").replace(" .", ".").replace(" ?", "?").replace(" !", "!")
            if joined:
                segments.append((current_speaker, joined))
        current_words = []

    for r in result.results:
        if not r.alternatives:
            continue
        alt = r.alternatives[0]
        speaker = alt.speaker
        content = alt.content
        is_punct = r.type == "punctuation"

        if current_speaker == "__unset__":
            current_speaker = speaker
            current_words.append(content)
            continue

        if is_punct:
            # Attach punctuation to current speaker run without spacing
            if current_words:
                current_words[-1] = current_words[-1] + content
            else:
                current_words.append(content)
            continue

        if speaker == current_speaker:
            current_words.append(" " + content)
        else:
            flush()
            current_speaker = speaker
            current_words = [content]

    flush()

    out: list[tuple[str | None, str]] = []
    for spk, text in segments:
        text = text.strip()
        if text:
            out.append((spk, text))
    return out


class SpeechmaticsService:
    def __init__(
        self,
        client_factory: Callable[[str], Any] | None = None,
        segment_extractor: Callable[[Any], list[tuple[str | None, str]]] | None = None,
        api_key: str = "",
        split_speakers: bool = False,
    ):
        self._client_factory = client_factory or _default_client_factory
        self._extract = segment_extractor or _extract_segments
        self._api_key = api_key
        self._split_speakers = split_speakers

    @staticmethod
    async def _safe_send_transcript(thymia_service, text: str) -> None:
        try:
            await thymia_service.send_transcript(text)
        except Exception as e:
            logger.warning("[sm] thymia send_transcript failed: %s", e)

    async def start(self, room, role: str) -> None:
        distributor = room.audio_distributors.get(role)
        if distributor is None:
            logger.warning(
                "[sm] no distributor for %s@%s — nothing to do", role, room.room_id
            )
            return
        audio_queue = distributor.subscribe()

        client = self._client_factory(self._api_key)

        speaker_to_role: dict[str, str] = {}

        def _resolve_role(speaker_label: str | None) -> str:
            if not self._split_speakers or speaker_label is None:
                return role
            if speaker_label in speaker_to_role:
                return speaker_to_role[speaker_label]
            # In-person: first speaker seen = clinician (doctor opens),
            # second = patient.
            if len(speaker_to_role) == 0:
                assigned = "clinician"
            elif len(speaker_to_role) == 1:
                assigned = "patient"
            else:
                assigned = role
            speaker_to_role[speaker_label] = assigned
            logger.info(
                "[sm] %s@%s speaker %s → %s",
                role, room.room_id, speaker_label, assigned,
            )
            return assigned

        def _publish_partial(msg) -> None:
            try:
                segments = self._extract(msg)
            except Exception:
                logger.exception("[sm] partial extract error")
                return
            for speaker_label, text in segments:
                if not text:
                    continue
                resolved_role = _resolve_role(speaker_label)
                room.eventbus.publish({
                    "type": "transcript_partial",
                    "role": resolved_role,
                    "text": text,
                    "ts_ms": room.now_ms(),
                })

        def _publish_final(msg) -> None:
            try:
                segments = self._extract(msg)
            except Exception:
                logger.exception("[sm] final extract error")
                return
            end_ms = room.now_ms()
            for speaker_label, text in segments:
                if not text:
                    continue
                resolved_role = _resolve_role(speaker_label)
                evt = {
                    "type": "transcript_final",
                    "role": resolved_role,
                    "text": text,
                    "start_ms": end_ms,
                    "end_ms": end_ms,
                    "utterance_id": nanoid_generate(_ID_ALPHABET, 10),
                }
                room.eventbus.publish(evt)
                room.transcripts.append({
                    "role": resolved_role,
                    "text": text,
                    "start_ms": evt["start_ms"],
                    "end_ms": evt["end_ms"],
                    "utterance_id": evt["utterance_id"],
                })
                # Only patient text feeds Thymia's policy context.
                if resolved_role == "patient" and room.thymia_service is not None:
                    try:
                        loop = asyncio.get_running_loop()
                        loop.create_task(
                            self._safe_send_transcript(room.thymia_service, text)
                        )
                    except RuntimeError:
                        pass

        try:
            async with client as c:
                c.on("ADD_PARTIAL_TRANSCRIPT")(_publish_partial)
                c.on("ADD_TRANSCRIPT")(_publish_final)

                tc = getattr(type(c), "default_transcription_config", None)
                af = getattr(type(c), "default_audio_format", None)
                await c.start_session(transcription_config=tc, audio_format=af)
                logger.info(
                    "[sm] %s@%s session started (split_speakers=%s)",
                    role, room.room_id, self._split_speakers,
                )

                try:
                    while True:
                        chunk = await audio_queue.get()
                        await c.send_audio(chunk)
                except asyncio.CancelledError:
                    logger.info("[sm] %s@%s cancelled", role, room.room_id)
                    raise
                finally:
                    try:
                        await c.stop_session()
                    except Exception:
                        pass
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.exception("[sm] %s@%s session error: %s", role, room.room_id, e)
        finally:
            distributor.unsubscribe(audio_queue)
