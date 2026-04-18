# TrueVoice Backend — Phase 2: Audio Ingress

> **For agentic workers:** Use superpowers:subagent-driven-development to implement task-by-task.

**Goal:** Browser can open `/ws/audio/{role}/{room_id}` and stream binary PCM16 frames into the backend. Frames are validated (exactly 1280 bytes = 640 samples × 2 bytes @ 16kHz, 40ms) and fanned out through an `AudioDistributor` that later phases (Speechmatics, Thymia) will subscribe to. No STT or biomarker processing yet — this phase proves the audio pipe.

**Architecture:** One `AudioDistributor` per `(room, role)` pair, created lazily on first audio connection. Shares the newest-wins overflow pattern from `EventBus`. The WebSocket handler is thin: validate role+room, push bytes into the distributor, log progress. Invalid role / missing room → close with 4404.

**Tech stack:** Existing (FastAPI, pydantic, pytest). No new deps.

**Testing strategy:** Same two-layer approach as Phase 1.
- Unit tests for `AudioDistributor` (pure async pub/sub — deterministic, fast).
- `TestClient` tests for the WebSocket endpoint (validation rules, frame-size assertion, graceful disconnect).
- Live-server integration test that spawns uvicorn and sends real binary frames over the wire.

**Secret handling:** unchanged — no new keys needed this phase.

---

## File Structure

**Create:**
- `backend/app/services/distributor.py` — `AudioDistributor` class (fan-out over bytes)
- `backend/app/ws/audio.py` — binary audio ingress WebSocket router
- `backend/tests/test_distributor.py` — unit tests for AudioDistributor
- `backend/tests/test_ws_audio.py` — in-process TestClient tests for the audio endpoint
- `backend/tests/integration/test_live_audio.py` — live-server test streaming real binary frames

**Modify:**
- `backend/app/main.py` — wire the audio WebSocket router

**File responsibilities:**
- `services/distributor.py` — pure pub/sub over `bytes`; no FastAPI, no room logic, no I/O. Stands on its own, trivially testable.
- `ws/audio.py` — owns the `/ws/audio/{role}/{room_id}` endpoint and nothing else. Looks up the room, lazily creates the per-role distributor, loops on `receive_bytes`. No STT, no biomarkers — those are Phase 3.

---

## Task 1: `AudioDistributor` (test first)

**Files:**
- Create: `backend/tests/test_distributor.py`
- Create: `backend/app/services/distributor.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_distributor.py`:
```python
import asyncio

from app.services.distributor import AudioDistributor


async def test_publish_delivers_to_subscriber():
    dist = AudioDistributor()
    q = dist.subscribe()
    dist.publish(b"\x01\x02\x03")
    chunk = await asyncio.wait_for(q.get(), timeout=1.0)
    assert chunk == b"\x01\x02\x03"


async def test_multiple_subscribers_all_receive():
    dist = AudioDistributor()
    q1, q2 = dist.subscribe(), dist.subscribe()
    dist.publish(b"a")
    dist.publish(b"b")
    assert await q1.get() == b"a"
    assert await q1.get() == b"b"
    assert await q2.get() == b"a"
    assert await q2.get() == b"b"


async def test_unsubscribe_stops_delivery():
    dist = AudioDistributor()
    q = dist.subscribe()
    dist.unsubscribe(q)
    dist.publish(b"x")
    assert q.empty()


async def test_full_subscriber_drops_oldest_not_crash():
    dist = AudioDistributor(subscriber_maxsize=3)
    q = dist.subscribe()
    for i in range(10):
        dist.publish(bytes([i]))
    drained = []
    while not q.empty():
        drained.append(q.get_nowait())
    assert drained == [bytes([7]), bytes([8]), bytes([9])]


async def test_no_subscribers_publish_silently_drops():
    dist = AudioDistributor()
    dist.publish(b"vanishes")  # must not raise
```

- [ ] **Step 2: Run to verify failure**

```
export PATH="$HOME/.local/bin:$PATH" && cd backend && uv run pytest tests/test_distributor.py -v
```
Expected: `ModuleNotFoundError` for `app.services.distributor`.

- [ ] **Step 3: Implement**

`backend/app/services/distributor.py`:
```python
import asyncio


class AudioDistributor:
    """Fan-out distributor for audio byte chunks.

    Mirrors the newest-wins overflow policy of EventBus but carries `bytes`
    instead of dict events. Subscribers get their own bounded queue; if a
    subscriber falls behind, we drop its oldest chunk rather than blocking
    the publisher (audio is real-time — backpressure is worse than gaps).
    """

    def __init__(self, subscriber_maxsize: int = 200):
        self._subscribers: list[asyncio.Queue] = []
        self._subscriber_maxsize = subscriber_maxsize

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=self._subscriber_maxsize)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        try:
            self._subscribers.remove(q)
        except ValueError:
            pass

    def publish(self, chunk: bytes) -> None:
        for q in self._subscribers:
            self._put_newest_wins(q, chunk)

    @staticmethod
    def _put_newest_wins(q: asyncio.Queue, chunk: bytes) -> None:
        try:
            q.put_nowait(chunk)
        except asyncio.QueueFull:
            try:
                q.get_nowait()
            except asyncio.QueueEmpty:
                pass
            try:
                q.put_nowait(chunk)
            except asyncio.QueueFull:
                pass
```

- [ ] **Step 4: Run to verify green**

```
uv run pytest tests/test_distributor.py -v
```
Expected: 5 passed.

---

## Task 2: `ws/audio.py` endpoint (test first, using TestClient)

**Files:**
- Create: `backend/tests/test_ws_audio.py`
- Create: `backend/app/ws/audio.py`
- Modify: `backend/app/main.py` — import and include the new router

- [ ] **Step 1: Write the failing test**

`backend/tests/test_ws_audio.py`:
```python
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect


def _client() -> TestClient:
    from app.main import app

    return TestClient(app)


def _make_frame(value: int = 0) -> bytes:
    # 1280 bytes = 640 samples * 2 bytes PCM16
    return bytes([value & 0xFF]) * 1280


def _create_room(client: TestClient) -> str:
    return client.post("/api/rooms").json()["room_id"]


def test_patient_audio_accepts_valid_frame():
    client = _client()
    room_id = _create_room(client)
    with client.websocket_connect(f"/ws/audio/patient/{room_id}") as ws:
        ws.send_bytes(_make_frame(1))
        ws.send_bytes(_make_frame(2))
        # No server-to-client messages expected; close cleanly.


def test_clinician_audio_accepts_valid_frame():
    client = _client()
    room_id = _create_room(client)
    with client.websocket_connect(f"/ws/audio/clinician/{room_id}") as ws:
        ws.send_bytes(_make_frame(3))


def test_invalid_role_closes_with_4404():
    client = _client()
    room_id = _create_room(client)
    try:
        with client.websocket_connect(f"/ws/audio/nurse/{room_id}") as ws:
            ws.receive_bytes()
    except WebSocketDisconnect as e:
        assert e.code == 4404
    else:
        raise AssertionError("expected WebSocketDisconnect with code 4404")


def test_missing_room_closes_with_4404():
    client = _client()
    try:
        with client.websocket_connect("/ws/audio/patient/doesnotex") as ws:
            ws.receive_bytes()
    except WebSocketDisconnect as e:
        assert e.code == 4404
    else:
        raise AssertionError("expected WebSocketDisconnect with code 4404")


def test_wrong_frame_size_closes_with_4400():
    client = _client()
    room_id = _create_room(client)
    try:
        with client.websocket_connect(f"/ws/audio/patient/{room_id}") as ws:
            ws.send_bytes(b"\x00" * 1000)  # wrong size, must reject
            ws.receive_bytes()
    except WebSocketDisconnect as e:
        assert e.code == 4400
    else:
        raise AssertionError("expected WebSocketDisconnect with code 4400")


def test_distributor_created_on_first_connect():
    client = _client()
    room_id = _create_room(client)

    from app.rooms import rooms as rooms_mgr

    with client.websocket_connect(f"/ws/audio/patient/{room_id}") as ws:
        ws.send_bytes(_make_frame(7))
        # Give the server a moment to register the distributor
        room = rooms_mgr.get(room_id)
        assert room is not None
        assert "patient" in room.audio_distributors
```

- [ ] **Step 2: Run to verify failure**

Expected: `ModuleNotFoundError` or 404 because the router isn't wired yet.

- [ ] **Step 3: Implement `backend/app/ws/audio.py`**

```python
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.rooms import rooms as rooms_mgr
from app.services.distributor import AudioDistributor

logger = logging.getLogger("truevoice.audio")

FRAME_BYTES = 1280  # 640 samples * 2 bytes PCM16 (40ms @ 16kHz)
_VALID_ROLES = frozenset({"patient", "clinician"})

router = APIRouter()


@router.websocket("/ws/audio/{role}/{room_id}")
async def audio_ingress(ws: WebSocket, role: str, room_id: str) -> None:
    # Validation happens before accept so we can close with a code the
    # client sees. FastAPI requires accept() before any send/close payload,
    # so we accept, then close with a non-1000 code carrying a reason.
    await ws.accept()

    if role not in _VALID_ROLES:
        await ws.close(code=4404, reason=f"invalid role: {role}")
        return

    room = rooms_mgr.get(room_id)
    if room is None:
        await ws.close(code=4404, reason=f"unknown room: {room_id}")
        return

    # Lazily create the distributor for this role.
    if role not in room.audio_distributors:
        room.audio_distributors[role] = AudioDistributor()
    distributor = room.audio_distributors[role]

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
                logger.info("[audio] %s@%s %dms ingested", role, room_id, n_frames * 40)
    except WebSocketDisconnect:
        logger.info(
            "[audio] %s@%s disconnected after %d frames (%dms)",
            role, room_id, n_frames, n_frames * 40,
        )
```

Design note: we accept the WebSocket unconditionally and then close with a custom code (4404 / 4400) because FastAPI's `close()` during the handshake (pre-accept) sends a generic rejection the browser client can't introspect. Post-accept close with a code in the 4000-4999 range is the standard way to surface application-level rejection to the client.

- [ ] **Step 4: Wire the router in `backend/app/main.py`**

Edit `backend/app/main.py`:

```python
from app.api.rooms import router as rooms_router
from app.ws.audio import router as audio_router  # NEW

...

app.include_router(rooms_router)
app.include_router(audio_router)  # NEW
```

- [ ] **Step 5: Run to verify green**

```
uv run pytest tests/test_ws_audio.py -v
```
Expected: 6 passed.

Also run the full unit suite:
```
uv run pytest -m "not integration" -v
```
Expected: 39 + 5 distributor + 6 ws_audio = 50 passed.

---

## Task 3: Live-server integration test

**Files:**
- Create: `backend/tests/integration/test_live_audio.py`

- [ ] **Step 1: Write the test**

```python
import asyncio

import httpx
import pytest
import websockets
from websockets.exceptions import ConnectionClosedError

pytestmark = pytest.mark.integration


FRAME_BYTES = 1280


def _frame(value: int = 0) -> bytes:
    return bytes([value & 0xFF]) * FRAME_BYTES


def _create_room(live_server: str) -> str:
    return httpx.post(f"{live_server}/api/rooms").json()["room_id"]


def test_patient_audio_accepts_frames_live(live_server, ws_base):
    room_id = _create_room(live_server)

    async def run():
        async with websockets.connect(f"{ws_base}/ws/audio/patient/{room_id}") as ws:
            for i in range(10):
                await ws.send(_frame(i))
            # No server reply expected; close clean.

    asyncio.run(run())


def test_invalid_role_rejected_live(live_server, ws_base):
    room_id = _create_room(live_server)

    async def run():
        with pytest.raises(ConnectionClosedError) as exc:
            async with websockets.connect(f"{ws_base}/ws/audio/nurse/{room_id}") as ws:
                # Read until close — the server accepts then closes with 4404.
                await asyncio.wait_for(ws.recv(), timeout=2.0)
        assert exc.value.rcvd is not None
        assert exc.value.rcvd.code == 4404

    asyncio.run(run())


def test_missing_room_rejected_live(ws_base):
    async def run():
        with pytest.raises(ConnectionClosedError) as exc:
            async with websockets.connect(f"{ws_base}/ws/audio/patient/doesnotex") as ws:
                await asyncio.wait_for(ws.recv(), timeout=2.0)
        assert exc.value.rcvd.code == 4404

    asyncio.run(run())


def test_wrong_frame_size_rejected_live(live_server, ws_base):
    room_id = _create_room(live_server)

    async def run():
        with pytest.raises(ConnectionClosedError) as exc:
            async with websockets.connect(f"{ws_base}/ws/audio/patient/{room_id}") as ws:
                await ws.send(b"\x00" * 500)  # wrong size
                await asyncio.wait_for(ws.recv(), timeout=2.0)
        assert exc.value.rcvd.code == 4400

    asyncio.run(run())
```

- [ ] **Step 2: Run integration**

```
uv run pytest tests/integration -v
```
Expected: original 6 + new 4 = 10 passed.

- [ ] **Step 3: Run full suite**

```
uv run pytest -v
```
Expected: 50 unit + 10 integration = 60 passed. Two FastAPI `on_event` deprecation warnings are still acceptable.

---

## Task 4: Lint + final gate

- [ ] **Step 1: Ruff**

```
uv run ruff check .
```
Expected: clean. If new `Union`/`Optional` style issues appear, auto-fix with `uv run ruff check --fix .` then re-run.

- [ ] **Step 2: Full suite one more time**

```
uv run pytest -v
```
Expected: 60 passed.

- [ ] **Step 3: Manual acceptance (optional — skip if Task 3 live tests passed cleanly)**

Start the server, create a room, connect a browser WebSocket:
```bash
cd backend && uv run uvicorn app.main:app &
ROOM=$(curl -sX POST http://localhost:8000/api/rooms | python -c "import sys,json; print(json.load(sys.stdin)['room_id'])")
# In a browser console at about:blank:
#   let ws = new WebSocket(`ws://localhost:8000/ws/audio/patient/${ROOM}`);
#   let buf = new Uint8Array(1280); ws.binaryType = "arraybuffer";
#   ws.onopen = () => ws.send(buf.buffer);
# Backend log should show "[audio] patient@... connected".
```
Live integration tests already cover this, so manual check is optional.

---

## Phase 2 — Done criteria

1. `uv run pytest` → 60 passed.
2. `uv run pytest -m "not integration"` → 50 passed, deselected.
3. `uv run ruff check .` → clean.
4. `/ws/audio/{role}/{room_id}` accepts 1280-byte binary frames from both `patient` and `clinician` roles.
5. Invalid role → close 4404. Missing room → close 4404. Wrong frame size → close 4400.
6. `room.audio_distributors[role]` is lazily populated on first audio connect and persists for subscribers (Phase 3 Speechmatics/Thymia will subscribe here).
7. No new dependencies added; no new secrets.

## Hand-off to frontend teammate

Once Phase 2 lands, the frontend teammate can build the AudioWorklet + `startAudioCapture` helper against the real endpoint. Contract:
- URL: `ws://{BACKEND}/ws/audio/{role}/{room_id}`, `role ∈ {"patient", "clinician"}`.
- Wire format: binary frames, exactly **1280 bytes** each (640 PCM16 samples, 16kHz, mono, 40ms).
- Server sends nothing back. It closes with a non-1000 code on rejection: 4404 = invalid role or unknown room, 4400 = frame-size mismatch.
- No auth yet (hackathon scope).
