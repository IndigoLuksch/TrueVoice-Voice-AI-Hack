# TrueVoice Backend — Phase 3: Speechmatics RT + Dashboard WS

> Uses superpowers:subagent-driven-development.

**Goal:** Patient and clinician audio streams are transcribed by Speechmatics medical RT. Partial and final transcripts flow through the room's `EventBus` as `transcript_partial` / `transcript_final` events. A new `/ws/dashboard/{room_id}` endpoint pushes every event (as JSON) to connected dashboards, with a 100-event replay on connect. After this phase, the full transcript pipeline works end-to-end.

**Architecture:**
- `SpeechmaticsService`: one `AsyncClient` per `(room, role)`. Subscribes to `room.audio_distributors[role]` via `.subscribe()`, pipes chunks to `client.send_audio()`. Registers `ADD_PARTIAL_TRANSCRIPT` / `ADD_TRANSCRIPT` handlers that publish events stamped with `room.now_ms()`.
- `/ws/dashboard/{room_id}` subscribes to `room.eventbus`, replays last 100 events, then streams new events as JSON.
- Lifecycle: Speechmatics task spawned lazily on first audio connect for a role; stored in `room.speechmatics_tasks[role]`; cancelled on audio disconnect.

**Tech stack:** `speechmatics-rt >= 1.0.0` (already installed). No new deps.

**Testing strategy:**
- Unit: `SpeechmaticsService` with a fake `AsyncClient` that simulates partial/final server messages.
- Unit: `/ws/dashboard` endpoint via `TestClient` — inject events directly into `room.eventbus` (same process, shared state) and assert the dashboard receives them.
- Live-server: dashboard connects to an empty room, confirms handshake + empty replay, then the test publishes via a tiny debug injector endpoint that's **only registered when `TRUEVOICE_TEST_MODE=1`** (production never exposes it).
- **Manual acceptance:** documented step-by-step — real Speechmatics, real mic, watch transcripts land on the dashboard. This is where you catch real-world integration issues unit tests hide.

**Secret handling:** unchanged. `SPEECHMATICS_API_KEY` is already loaded via `Settings`.

---

## File structure

**Create:**
- `backend/app/services/speechmatics.py` — the Speechmatics service class
- `backend/app/ws/dashboard.py` — dashboard event-push WebSocket router
- `backend/app/api/debug.py` — test-only debug event injector (guarded by env flag)
- `backend/tests/test_speechmatics.py` — unit tests (fake client)
- `backend/tests/test_ws_dashboard.py` — in-process endpoint tests
- `backend/tests/integration/test_live_dashboard.py` — live-server dashboard test
- `backend/docs/MANUAL_ACCEPTANCE.md` — step-by-step real-world check

**Modify:**
- `backend/app/ws/audio.py` — spawn `SpeechmaticsService.start(...)` task on first audio connect for a role; cancel on disconnect
- `backend/app/main.py` — include dashboard router + debug router (conditional)

**Responsibility boundaries:**
- `services/speechmatics.py` — owns the SM client lifecycle + mapping server messages to events. No FastAPI knowledge.
- `ws/dashboard.py` — pure pub/sub bridge: subscribe to EventBus, forward to WS client. No SM knowledge.
- `api/debug.py` — exists only so integration tests can inject events. Import gated behind `TRUEVOICE_TEST_MODE=1`.

---

## Task 1: `/ws/dashboard/{room_id}` endpoint (test first)

**Files:**
- Create: `backend/tests/test_ws_dashboard.py`
- Create: `backend/app/ws/dashboard.py`
- Modify: `backend/app/main.py` — include dashboard router

- [ ] **Step 1: Write the failing test**

`backend/tests/test_ws_dashboard.py`:
```python
import asyncio
import json

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect


def _client() -> TestClient:
    from app.main import app

    return TestClient(app)


def _create_room(client: TestClient) -> str:
    return client.post("/api/rooms").json()["room_id"]


def test_dashboard_connect_and_receive_live_event():
    client = _client()
    room_id = _create_room(client)

    from app.rooms import rooms as rooms_mgr

    with client.websocket_connect(f"/ws/dashboard/{room_id}") as ws:
        room = rooms_mgr.get(room_id)
        assert room is not None
        room.eventbus.publish({
            "type": "call_status",
            "status": "connected",
            "peers": 1,
        })
        msg = ws.receive_text()
        assert json.loads(msg) == {
            "type": "call_status", "status": "connected", "peers": 1,
        }


def test_dashboard_replays_recent_events_on_connect():
    client = _client()
    room_id = _create_room(client)

    from app.rooms import rooms as rooms_mgr

    room = rooms_mgr.get(room_id)
    # Publish 3 events BEFORE anyone is subscribed — they go into the ring buffer.
    for i in range(3):
        room.eventbus.publish({"type": "call_status", "status": "connected", "peers": i})

    with client.websocket_connect(f"/ws/dashboard/{room_id}") as ws:
        received = [json.loads(ws.receive_text()) for _ in range(3)]
        assert [e["peers"] for e in received] == [0, 1, 2]


def test_dashboard_unknown_room_closes_4404():
    client = _client()
    try:
        with client.websocket_connect("/ws/dashboard/doesnotex") as ws:
            ws.receive_text()
    except WebSocketDisconnect as e:
        assert e.code == 4404
    else:
        raise AssertionError("expected 4404")


def test_dashboard_ignores_client_sends():
    """Client may try to send (shouldn't), server must stay up."""
    client = _client()
    room_id = _create_room(client)

    from app.rooms import rooms as rooms_mgr

    with client.websocket_connect(f"/ws/dashboard/{room_id}") as ws:
        ws.send_text("noise")
        room = rooms_mgr.get(room_id)
        room.eventbus.publish({"type": "call_status", "status": "connected", "peers": 5})
        # We should still receive the server-pushed event.
        msg = json.loads(ws.receive_text())
        assert msg["peers"] == 5
```

- [ ] **Step 2: Run to fail**

```
export PATH="$HOME/.local/bin:$PATH" && cd backend && uv run pytest tests/test_ws_dashboard.py -v
```
Expected: fail (router not wired).

- [ ] **Step 3: Implement `backend/app/ws/dashboard.py`**

```python
import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.rooms import rooms as rooms_mgr

logger = logging.getLogger("truevoice.dashboard")

REPLAY_LIMIT = 100

router = APIRouter()


@router.websocket("/ws/dashboard/{room_id}")
async def dashboard_stream(ws: WebSocket, room_id: str) -> None:
    await ws.accept()

    room = rooms_mgr.get(room_id)
    if room is None:
        await ws.close(code=4404, reason=f"unknown room: {room_id}")
        return

    queue = room.eventbus.subscribe()
    logger.info("[dashboard] %s subscribed", room_id)

    # Replay recent history so late-joiners catch up.
    replay = list(room.eventbus.recent)[-REPLAY_LIMIT:]
    for evt in replay:
        await ws.send_text(json.dumps(evt))

    reader_task = asyncio.create_task(_drain_client_sends(ws))

    try:
        while True:
            evt = await queue.get()
            await ws.send_text(json.dumps(evt))
    except WebSocketDisconnect:
        pass
    finally:
        room.eventbus.unsubscribe(queue)
        reader_task.cancel()
        logger.info("[dashboard] %s unsubscribed", room_id)


async def _drain_client_sends(ws: WebSocket) -> None:
    """Consume and discard anything the client sends; the channel is one-way."""
    try:
        while True:
            await ws.receive()
    except WebSocketDisconnect:
        return
```

Design notes:
- `_drain_client_sends` runs concurrently so the WS stays healthy even if the client sends noise (browsers may send pings or accidental data). Without it, unread frames back up and eventually block.
- `replay` is drained from the ring buffer BEFORE subscribing to avoid a race where we'd miss an event that arrives between subscription and replay. But strictly, subscribing first then replaying means some events could be delivered twice. We accept possible duplicates over missed events — dashboards can de-dup by event content if needed.

Actually — re-read that. Let's subscribe first, then replay, and note the dup risk. Duplicates are safer than gaps for clinical monitoring.

Correction to the code above: move `queue = room.eventbus.subscribe()` BEFORE the replay loop is fine (it's already before). The dup window is tiny. Document it:

Add a comment in the code:
```python
# Subscribe FIRST so we don't miss events that arrive during replay.
# Cost: a new event during replay may appear twice (once via replay,
# once via the live queue). Clinical UIs should accept dup events.
```

- [ ] **Step 4: Wire router in `backend/app/main.py`**

Add import + include:
```python
from app.ws.dashboard import router as dashboard_router
...
app.include_router(dashboard_router)
```

- [ ] **Step 5: Run to verify green**

```
uv run pytest tests/test_ws_dashboard.py -v
```
Expected: 4 passed.

---

## Task 2: `SpeechmaticsService` with fake client (test first)

**Files:**
- Create: `backend/tests/test_speechmatics.py`
- Create: `backend/app/services/speechmatics.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_speechmatics.py`:
```python
import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.rooms import RoomManager


class _FakeSMClient:
    """Stand-in for speechmatics.rt.AsyncClient — captures handlers and audio."""

    def __init__(self):
        self.handlers: dict = {}
        self.sent_audio: list[bytes] = []
        self.started = False
        self.stopped = False

    def on(self, message_type):
        def decorator(fn):
            self.handlers[message_type] = fn
            return fn
        return decorator

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return None

    async def start_session(self, transcription_config, audio_format):
        self.started = True

    async def send_audio(self, chunk: bytes):
        self.sent_audio.append(chunk)

    async def stop_session(self):
        self.stopped = True


def _fake_message(transcript: str):
    """Build an object that looks like what TranscriptResult.from_message expects."""
    msg = MagicMock()
    # The real code calls TranscriptResult.from_message(msg).metadata.transcript
    # We short-circuit by returning a pre-shaped object via a custom factory in the test hook.
    return msg


async def test_forwards_audio_to_client():
    from app.services.speechmatics import SpeechmaticsService

    rooms_mgr = RoomManager()
    room = rooms_mgr.create()
    from app.services.distributor import AudioDistributor
    room.audio_distributors["patient"] = AudioDistributor()

    fake_client = _FakeSMClient()
    svc = SpeechmaticsService(client_factory=lambda api_key: fake_client)

    task = asyncio.create_task(svc.start(room, "patient"))
    await asyncio.sleep(0.05)

    room.audio_distributors["patient"].publish(b"\x01" * 1280)
    room.audio_distributors["patient"].publish(b"\x02" * 1280)
    await asyncio.sleep(0.1)

    assert fake_client.started is True
    assert len(fake_client.sent_audio) >= 2

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


async def test_publishes_partial_transcript_event():
    from app.services.speechmatics import SpeechmaticsService

    rooms_mgr = RoomManager()
    room = rooms_mgr.create()
    from app.services.distributor import AudioDistributor
    room.audio_distributors["patient"] = AudioDistributor()

    fake_client = _FakeSMClient()
    svc = SpeechmaticsService(
        client_factory=lambda api_key: fake_client,
        transcript_extractor=lambda msg: msg,  # pass-through for test
    )
    q = room.eventbus.subscribe()

    task = asyncio.create_task(svc.start(room, "patient"))
    await asyncio.sleep(0.05)

    # Simulate a partial message from Speechmatics.
    partial_handler = fake_client.handlers["ADD_PARTIAL_TRANSCRIPT"]
    await _maybe_await(partial_handler("i'm feeling"))

    evt = await asyncio.wait_for(q.get(), timeout=1.0)
    assert evt["type"] == "transcript_partial"
    assert evt["role"] == "patient"
    assert evt["text"] == "i'm feeling"

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


async def test_publishes_final_transcript_event_and_stores_on_room():
    from app.services.speechmatics import SpeechmaticsService

    rooms_mgr = RoomManager()
    room = rooms_mgr.create()
    from app.services.distributor import AudioDistributor
    room.audio_distributors["patient"] = AudioDistributor()

    fake_client = _FakeSMClient()
    svc = SpeechmaticsService(
        client_factory=lambda api_key: fake_client,
        transcript_extractor=lambda msg: msg,
    )
    q = room.eventbus.subscribe()

    task = asyncio.create_task(svc.start(room, "patient"))
    await asyncio.sleep(0.05)

    final_handler = fake_client.handlers["ADD_TRANSCRIPT"]
    await _maybe_await(final_handler("i'm doing fine thanks"))

    evt = await asyncio.wait_for(q.get(), timeout=1.0)
    assert evt["type"] == "transcript_final"
    assert evt["text"] == "i'm doing fine thanks"
    assert "utterance_id" in evt
    assert evt["end_ms"] >= evt["start_ms"]

    assert len(room.transcripts) == 1
    assert room.transcripts[0]["text"] == "i'm doing fine thanks"

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


async def _maybe_await(result):
    if asyncio.iscoroutine(result):
        await result
```

- [ ] **Step 2: Run to fail**

```
uv run pytest tests/test_speechmatics.py -v
```
Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement `backend/app/services/speechmatics.py`**

```python
"""Speechmatics RT integration.

One SpeechmaticsService instance runs per (room, role). It subscribes to the
room's AudioDistributor for that role, pipes bytes into Speechmatics, and
publishes transcript_partial / transcript_final events onto the room's EventBus.

The SDK's exact handler signature is captured via decorators on the AsyncClient;
we mirror that through a client_factory hook so unit tests can inject a fake
client without hitting the network.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable

from nanoid import generate as nanoid_generate

logger = logging.getLogger("truevoice.speechmatics")


_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"


def _default_client_factory(api_key: str):
    """Build a real Speechmatics AsyncClient wrapped in a facade that exposes
    the plain `on(message_type)` / `start_session` / `send_audio` / `stop_session`
    surface our service relies on."""
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
        def __init__(self):
            self._inner = AsyncClient(api_key=api_key)
            self._entered = False

        async def __aenter__(self):
            await self._inner.__aenter__()
            self._entered = True
            return self

        async def __aexit__(self, *a):
            return await self._inner.__aexit__(*a)

        def on(self, message_type_name):
            # message_type_name is either a string like "ADD_PARTIAL_TRANSCRIPT" or
            # a ServerMessageType enum. Accept both.
            mt = (
                getattr(ServerMessageType, message_type_name)
                if isinstance(message_type_name, str)
                else message_type_name
            )
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

    # Build default configs used by the real path.
    _RealClient.default_transcription_config = TranscriptionConfig(
        language="en",
        domain="medical",
        operating_point=OperatingPoint.ENHANCED,
        enable_partials=True,
        diarization="speaker",
        speaker_diarization_config=SpeakerDiarizationConfig(speaker_sensitivity=0.7),
        conversation_config=ConversationConfig(end_of_utterance_silence_trigger=0.7),
        max_delay=2.0,
    )
    _RealClient.default_audio_format = AudioFormat(
        encoding=AudioEncoding.PCM_S16LE,
        chunk_size=4096,
        sample_rate=16000,
    )
    return _RealClient()


def _default_transcript_extractor(message) -> str:
    """Parse a Speechmatics RT server message into the raw transcript string."""
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

    async def start(self, room, role: str) -> None:
        """Run until cancelled. Feed audio from the distributor into Speechmatics
        and publish transcript events onto the room's EventBus."""
        distributor = room.audio_distributors.get(role)
        if distributor is None:
            logger.warning("[sm] no distributor for %s@%s — nothing to do", role, room.room_id)
            return
        audio_queue = distributor.subscribe()

        client = self._client_factory(self._api_key)

        async def on_partial(msg):
            try:
                text = self._extract(msg)
                if text:
                    room.eventbus.publish({
                        "type": "transcript_partial",
                        "role": role,
                        "text": text,
                        "ts_ms": room.now_ms(),
                    })
            except Exception as e:
                logger.exception("[sm] partial handler error: %s", e)

        async def on_final(msg):
            try:
                text = self._extract(msg)
                if not text:
                    return
                end_ms = room.now_ms()
                evt = {
                    "type": "transcript_final",
                    "role": role,
                    "text": text,
                    "start_ms": end_ms,  # refined once we have SM duration metadata
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
            except Exception as e:
                logger.exception("[sm] final handler error: %s", e)

        try:
            async with client as c:
                c.on("ADD_PARTIAL_TRANSCRIPT")(on_partial)
                c.on("ADD_TRANSCRIPT")(on_final)

                # Start SM session using defaults attached to the client (real client)
                # or the test fake which just records .started = True.
                tc = getattr(
                    type(c),
                    "default_transcription_config",
                    _DEFAULT_STUB_TRANSCRIPTION_CONFIG,
                )
                af = getattr(
                    type(c),
                    "default_audio_format",
                    _DEFAULT_STUB_AUDIO_FORMAT,
                )
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
        finally:
            distributor.unsubscribe(audio_queue)


# Sentinels for the fake-client code path in tests.
_DEFAULT_STUB_TRANSCRIPTION_CONFIG = object()
_DEFAULT_STUB_AUDIO_FORMAT = object()
```

- [ ] **Step 4: Run to verify green**

```
uv run pytest tests/test_speechmatics.py -v
```
Expected: 3 passed.

Note: the `on("ADD_PARTIAL_TRANSCRIPT")(on_partial)` call pattern matches our fake client's `on` decorator. The real `speechmatics.rt.AsyncClient.on(...)` expects a `ServerMessageType` enum — the facade in `_default_client_factory` translates the string to the enum before delegating.

---

## Task 3: Wire Speechmatics into `ws/audio.py`

**Files:**
- Modify: `backend/app/ws/audio.py`

- [ ] **Step 1: Update `audio.py` to spawn the SM task on first connect for a role**

Edit `backend/app/ws/audio.py`:

```python
import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings
from app.rooms import rooms as rooms_mgr
from app.services.distributor import AudioDistributor
from app.services.speechmatics import SpeechmaticsService

logger = logging.getLogger("truevoice.audio")

FRAME_BYTES = 1280
_VALID_ROLES = frozenset({"patient", "clinician"})

router = APIRouter()


@router.websocket("/ws/audio/{role}/{room_id}")
async def audio_ingress(ws: WebSocket, role: str, room_id: str) -> None:
    await ws.accept()

    if role not in _VALID_ROLES:
        await ws.close(code=4404, reason=f"invalid role: {role}")
        return

    room = rooms_mgr.get(room_id)
    if room is None:
        await ws.close(code=4404, reason=f"unknown room: {room_id}")
        return

    if role not in room.audio_distributors:
        room.audio_distributors[role] = AudioDistributor()
    distributor = room.audio_distributors[role]

    # Spawn Speechmatics task for this (room, role) if not already running.
    if role not in room.speechmatics_tasks or room.speechmatics_tasks[role].done():
        svc = SpeechmaticsService(api_key=settings.speechmatics_api_key.get_secret_value())
        task = asyncio.create_task(svc.start(room, role))
        room.speechmatics_tasks[role] = task
        logger.info("[audio] %s@%s SM task spawned", role, room_id)

    logger.info("[audio] %s@%s connected", role, room_id)
    n_frames = 0
    try:
        while True:
            data = await ws.receive_bytes()
            if len(data) != FRAME_BYTES:
                logger.warning(
                    "[audio] %s@%s bad frame size: %d (expected %d)",
                    role, room_id, len(data), FRAME_BYTES,
                )
                await ws.close(code=4400, reason="bad frame size")
                return
            distributor.publish(data)
            n_frames += 1
            if n_frames % 100 == 0:
                logger.info(
                    "[audio] %s@%s %dms ingested", role, room_id, n_frames * 40,
                )
    except WebSocketDisconnect:
        logger.info(
            "[audio] %s@%s disconnected after %d frames (%dms)",
            role, room_id, n_frames, n_frames * 40,
        )
        # Cancel SM task if this was the last writer. Simple rule for Phase 3:
        # cancel on every disconnect (tasks are cheap to start; no multi-writer
        # yet).
        task = room.speechmatics_tasks.get(role)
        if task and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
            room.speechmatics_tasks.pop(role, None)
            logger.info("[audio] %s@%s SM task cancelled", role, room_id)
```

- [ ] **Step 2: Run existing audio tests**

```
uv run pytest tests/test_ws_audio.py -v
```
Expected: 6 passed (no regression — the SM task is spawned but the tests don't exercise it directly; the fake audio just flows through the distributor).

Heads-up: `test_distributor_created_on_first_connect` now also spawns a real Speechmatics task that will attempt to connect to SM's servers. In a unit test environment without network, this task will fail with a connection error but that error is caught inside `SpeechmaticsService.start` and logged; it should NOT break the test since the WS handler cancels the task cleanly on disconnect.

If the unit test starts hanging or failing because of the real SM connection attempt, mark it with `@pytest.mark.skipif(os.getenv("OFFLINE"), reason="SM connect")` or inject a fake factory via module-level monkeypatch in `conftest.py`.

Recommended: add a pytest fixture in `backend/tests/conftest.py` that monkeypatches `SpeechmaticsService` to use the fake client during unit tests, so unit tests never reach the network:

```python
# Add to backend/tests/conftest.py (append, don't replace):
import pytest


@pytest.fixture(autouse=True)
def _stub_speechmatics(monkeypatch, request):
    """Stub Speechmatics client in unit tests. Live-server tests opt out."""
    if "integration" in request.node.keywords:
        return
    from app.services import speechmatics as sm_module

    class _Stub:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return None
        def on(self, *_): return lambda fn: fn
        async def start_session(self, *_, **__): return None
        async def send_audio(self, *_): return None
        async def stop_session(self): return None

    monkeypatch.setattr(sm_module, "_default_client_factory", lambda api_key: _Stub())
```

- [ ] **Step 3: Run full unit suite**

```
uv run pytest -m "not integration" -v
```
Expected: all prior passes + 4 dashboard + 3 speechmatics = 44 + 4 + 3 = 51 unit tests passing.

---

## Task 4: Debug event injector + live-server dashboard integration test

**Files:**
- Create: `backend/app/api/debug.py` — test-only route
- Modify: `backend/app/main.py` — include debug router only if `TRUEVOICE_TEST_MODE=1`
- Create: `backend/tests/integration/test_live_dashboard.py`

- [ ] **Step 1: Write `backend/app/api/debug.py`**

```python
"""Test-only debug endpoints. Only mounted when TRUEVOICE_TEST_MODE=1.

These are NOT safe for production — they allow anyone to inject arbitrary
events into any room. The env-flag gate prevents them from being mounted
at all when the flag is not set.
"""
import os

from fastapi import APIRouter, HTTPException

from app.rooms import rooms as rooms_mgr

router = APIRouter(prefix="/api/debug", tags=["debug"])


@router.post("/emit-event/{room_id}")
def emit_event(room_id: str, event: dict) -> dict:
    room = rooms_mgr.get(room_id)
    if room is None:
        raise HTTPException(404, f"unknown room: {room_id}")
    room.eventbus.publish(event)
    return {"ok": True}


def is_enabled() -> bool:
    return os.environ.get("TRUEVOICE_TEST_MODE") == "1"
```

- [ ] **Step 2: Modify `backend/app/main.py` to conditionally include debug router**

After the other router includes:

```python
from app.api import debug as debug_api
if debug_api.is_enabled():
    app.include_router(debug_api.router)
    logger.info("DEBUG ROUTES ENABLED — do not expose to the internet")
```

- [ ] **Step 3: Update `backend/tests/integration/conftest.py` to set the env flag**

Add `env.setdefault("TRUEVOICE_TEST_MODE", "1")` to the `live_server` fixture alongside the existing key setdefaults.

- [ ] **Step 4: Write `backend/tests/integration/test_live_dashboard.py`**

```python
import asyncio
import json

import httpx
import pytest
import websockets

pytestmark = pytest.mark.integration


def _create_room(live_server: str) -> str:
    return httpx.post(f"{live_server}/api/rooms").json()["room_id"]


def test_dashboard_receives_injected_event_live(live_server, ws_base):
    room_id = _create_room(live_server)
    got: list = []

    async def run():
        async with websockets.connect(f"{ws_base}/ws/dashboard/{room_id}") as ws:
            # Inject an event via the debug endpoint (running in the subprocess).
            r = httpx.post(
                f"{live_server}/api/debug/emit-event/{room_id}",
                json={"type": "call_status", "status": "connected", "peers": 3},
            )
            assert r.status_code == 200
            msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
            got.append(json.loads(msg))

    asyncio.run(run())
    assert got[0]["peers"] == 3


def test_dashboard_unknown_room_closed_live(ws_base):
    async def run():
        from websockets.exceptions import ConnectionClosedError
        with pytest.raises(ConnectionClosedError) as exc:
            async with websockets.connect(f"{ws_base}/ws/dashboard/doesnotex") as ws:
                await asyncio.wait_for(ws.recv(), timeout=2.0)
        assert exc.value.rcvd.code == 4404

    asyncio.run(run())
```

- [ ] **Step 5: Run all integration tests**

```
uv run pytest tests/integration -v
```
Expected: prior 10 + 2 new dashboard = 12 passed.

- [ ] **Step 6: Run full suite**

```
uv run pytest -v
```
Expected: 51 unit + 12 integration = 63 passed.

---

## Task 5: Manual acceptance (documented — run once after implementation lands)

**Files:**
- Create: `backend/docs/MANUAL_ACCEPTANCE.md`

- [ ] **Step 1: Write the acceptance doc**

```markdown
# Phase 3 Manual Acceptance Test

## Prereqs
- Real `SPEECHMATICS_API_KEY` in `backend/.env`.
- A working microphone on the test machine.

## Steps

1. Start the server:
   ```
   cd backend
   uv run uvicorn app.main:app --reload
   ```

2. Create a room and copy its id:
   ```
   curl -X POST http://127.0.0.1:8000/api/rooms
   ```

3. Open a browser tab on `about:blank` and open DevTools → Console. Paste:

   ```js
   const ROOM = "PASTE_ROOM_ID_HERE";

   // Dashboard subscriber
   const dash = new WebSocket(`ws://127.0.0.1:8000/ws/dashboard/${ROOM}`);
   dash.onmessage = e => console.log("EVENT:", JSON.parse(e.data));

   // Mic → 16kHz PCM16 frames → /ws/audio/patient/{room}
   const ctx = new AudioContext({ sampleRate: 48000 });
   const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
   await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([`
     class P extends AudioWorkletProcessor {
       constructor() { super(); this.out = new Int16Array(0); }
       process(inputs) {
         const x = inputs[0]?.[0]; if (!x) return true;
         const dec = new Int16Array(Math.floor(x.length / 3));
         for (let i=0,j=0;i<dec.length*3;i+=3,j++) dec[j] = Math.max(-1,Math.min(1,(x[i]+x[i+1]+x[i+2])/3)) * 0x7FFF;
         const merged = new Int16Array(this.out.length + dec.length);
         merged.set(this.out); merged.set(dec, this.out.length);
         const FRAME=640; let off=0;
         while (merged.length - off >= FRAME) {
           this.port.postMessage(merged.slice(off, off+FRAME).buffer, [merged.slice(off, off+FRAME).buffer]);
           off += FRAME;
         }
         this.out = merged.slice(off); return true;
       }
     }
     registerProcessor("p", P);
   `], {type:"text/javascript"})));
   const src = ctx.createMediaStreamSource(stream);
   const node = new AudioWorkletNode(ctx, "p");
   src.connect(node);

   const ws = new WebSocket(`ws://127.0.0.1:8000/ws/audio/patient/${ROOM}`);
   ws.binaryType = "arraybuffer";
   node.port.onmessage = e => { if (ws.readyState === 1) ws.send(e.data); };
   ```

4. Speak into the mic. Within ~1 second the console should log:
   ```
   EVENT: {type: "transcript_partial", role: "patient", text: "hello ...", ts_ms: ...}
   EVENT: {type: "transcript_final", role: "patient", text: "hello world", ...}
   ```

5. Backend terminal shows:
   ```
   [audio] patient@... connected
   [audio] patient@... SM task spawned
   [sm] patient@... session started
   [audio] patient@... 4000ms ingested
   ```

## Pass criteria
- Partial transcripts appear within 1s of starting to speak.
- Final transcripts appear at natural sentence boundaries.
- Clean shutdown: close the browser tab, backend logs "SM task cancelled".

## Known limitations this phase
- Clinician channel works the same way but we haven't wired a UI for dual-role capture.
- No Thymia biomarkers yet (Phase 4).
- `start_ms` on final transcripts = `end_ms` for now (refine when we wire SM duration metadata).
```

---

## Task 6: Lint + gate

- [ ] **Step 1: Ruff**

```
uv run ruff check .
```
Expected: clean. Auto-fix any new import-sort issues.

- [ ] **Step 2: Full suite**

```
uv run pytest -v
```
Expected: 63 passed + the usual 2 `on_event` deprecation warnings.

- [ ] **Step 3: Manual acceptance from Task 5** (run once, confirm live transcripts work with real Speechmatics and real mic).

---

## Phase 3 — Done criteria

1. `uv run pytest` → 63 passed.
2. `uv run ruff check .` → clean.
3. `/ws/dashboard/{room}` streams `transcript_partial` and `transcript_final` JSON events.
4. Speechmatics task lifecycle is automatic: spawned on first audio connect, cancelled on disconnect, stored in `room.speechmatics_tasks[role]`.
5. Debug injector is gated behind `TRUEVOICE_TEST_MODE=1` and NEVER mounted in production startup logs.
6. Manual acceptance doc exists and was run at least once with real audio → real transcripts.

## Hand-off to frontend teammate

After Phase 3 lands, the frontend can:
- Connect to `/ws/dashboard/{room}` and parse `DashboardEvent` JSON (schema already mirrored in `frontend/lib/types.ts`).
- Render a live `TranscriptLane` component reading `transcript_partial` + `transcript_final` events.
- Show per-role transcript columns (`patient` | `clinician`).

Contract: events are push-only (server → client); client sends are silently dropped. Dashboard receives up to the last 100 events as a replay on connect.
