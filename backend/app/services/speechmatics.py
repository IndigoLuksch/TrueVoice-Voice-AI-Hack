"""Speechmatics RT integration.

One SpeechmaticsService runs per (room, role). It subscribes to the room's
AudioDistributor, pipes bytes into Speechmatics, and publishes
transcript_partial / transcript_final events onto the room's EventBus.

The real client and the event-handler pattern are wrapped behind
client_factory + transcript_extractor hooks so unit tests can inject fakes
without touching the network.
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
    """Build a facade over speechmatics.rt.AsyncClient exposing:
      - async with
      - .on(message_type_name: str) -> decorator
      - .start_session(transcription_config, audio_format)
      - .send_audio(chunk: bytes)
      - .stop_session()
    Also attaches default_transcription_config and default_audio_format
    on the facade class so the service can pass them into start_session.
    """
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
                speaker_sensitivity=0.7
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


def _default_transcript_extractor(message) -> str:
    from speechmatics.rt import TranscriptResult

    result = TranscriptResult.from_message(message)
    return result.metadata.transcript.strip()


class SpeechmaticsService:
    def __init__(
        self,
        client_factory: Callable[[str], Any] | None = None,
        transcript_extractor: Callable[[Any], str] | None = None,
        api_key: str = "",
    ):
        self._client_factory = client_factory or _default_client_factory
        self._extract = transcript_extractor or _default_transcript_extractor
        self._api_key = api_key

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

        def _publish_partial(text: str) -> None:
            if text:
                room.eventbus.publish({
                    "type": "transcript_partial",
                    "role": role,
                    "text": text,
                    "ts_ms": room.now_ms(),
                })

        def _publish_final(text: str) -> None:
            if not text:
                return
            end_ms = room.now_ms()
            evt = {
                "type": "transcript_final",
                "role": role,
                "text": text,
                "start_ms": end_ms,
                "end_ms": end_ms,
                "utterance_id": nanoid_generate(_ID_ALPHABET, 10),
            }
            room.eventbus.publish(evt)
            room.transcripts.append({
                "role": role,
                "text": text,
                "start_ms": evt["start_ms"],
                "end_ms": evt["end_ms"],
                "utterance_id": evt["utterance_id"],
            })
            # Feed patient transcripts into Thymia for policy context.
            # The SM SDK requires synchronous callbacks, so fire-and-forget
            # the async Thymia call on the running loop.
            if role == "patient" and room.thymia_service is not None:
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(
                        self._safe_send_transcript(room.thymia_service, text)
                    )
                except RuntimeError:
                    # No running loop (shouldn't happen inside the session).
                    pass

        def _handler(publish_fn):
            def _h(msg):
                try:
                    text = self._extract(msg)
                    publish_fn(text)
                except Exception as e:
                    logger.exception("[sm] handler error: %s", e)
            return _h

        try:
            async with client as c:
                c.on("ADD_PARTIAL_TRANSCRIPT")(_handler(_publish_partial))
                c.on("ADD_TRANSCRIPT")(_handler(_publish_final))

                tc = getattr(type(c), "default_transcription_config", None)
                af = getattr(type(c), "default_audio_format", None)
                await c.start_session(transcription_config=tc, audio_format=af)
                logger.info("[sm] %s@%s session started", role, room.room_id)

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
