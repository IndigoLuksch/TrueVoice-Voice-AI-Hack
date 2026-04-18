# TrueVoice Backend — Phase 1: Scaffold, Shared Schema, Rooms, EventBus

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the FastAPI backend with the full `DashboardEvent` schema, room management, per-room event bus, and the HTTP/WebSocket endpoints the frontend will connect to. This phase covers the backend portions of PRD 1 and PRD 2 from `voice-ai-hack-prds.md`.

**Architecture:** Single FastAPI process, single `RoomManager` singleton, in-memory state. `Room` dataclass defined with every field later phases will populate (do not mutate structure later — only assign to existing fields). `EventBus` is a per-room async pub/sub with a bounded ring buffer for late-joiner replay. All timestamps are monotonic ms-since-room-creation, issued by the backend.

**Tech Stack:** Python 3.11, FastAPI, uvicorn, pydantic v2, pydantic-settings, websockets, nanoid. Dev: ruff, pytest, pytest-asyncio, httpx (for `TestClient` and integration tests against a live server). Package manager: `uv`.

**Testing strategy (applies to every phase):**
- **Unit tests** — pure Python, fast, mock-free where possible. `pytest` collects from `tests/`.
- **API/WS integration tests** — use FastAPI's `TestClient` (in-process; same test suite). Covers HTTP routes and WebSocket handshakes without spawning a real server.
- **Live-server integration tests** — `tests/integration/` — spawn `uvicorn` as a subprocess, hit real HTTP + WebSocket endpoints via `httpx` and `websockets`. Slower but catches lifecycle/startup issues the in-process `TestClient` misses (CORS config, env loading, startup events). Marked with `@pytest.mark.integration` so `pytest -m "not integration"` skips them locally when you want speed.
- **Playwright** — deferred until the frontend lands (Phase 5+). At that point we'll add `frontend/tests/e2e/` with Playwright for the full telehealth flow (mic permission, WebRTC, live dashboard updates). Not needed for backend-only phases.

**Secret handling:**
- `.env` is gitignored (also `.env.*` except `.env.example`). Never commit real keys.
- `Settings(BaseSettings)` validates all required keys at import time; the app refuses to start if any is missing.
- On startup the app logs *masked* key presence (e.g. `SPEECHMATICS_API_KEY=sm-e***` → confirms loaded, does not leak value). Full keys never appear in logs, error messages, or responses.
- Tests use monkeypatched dummy values via `conftest.py`; they never touch real keys.

**Out of scope for this phase:** audio ingress (`/ws/audio`), dashboard push (`/ws/dashboard`), Speechmatics, Thymia, Claude, WebRTC signaling, report, compare. Those come in later phases but the `Room` dataclass and event schema must already reserve space for them here so later phases only *populate* existing fields.

---

## File Structure

**Create:**
- `backend/pyproject.toml` — project metadata + deps
- `backend/.env.example` — API-key placeholders
- `backend/.gitignore` — venv, pytest cache, .env
- `backend/README.md` — setup commands
- `backend/app/__init__.py` — empty
- `backend/app/config.py` — `Settings(BaseSettings)`
- `backend/app/models.py` — Pydantic `DashboardEvent` discriminated union + `RoomCreateResponse`
- `backend/app/eventbus.py` — `EventBus` class
- `backend/app/rooms.py` — `Room` dataclass, `RoomManager`, module-level `rooms` singleton
- `backend/app/api/__init__.py` — empty
- `backend/app/api/rooms.py` — `POST /api/rooms`, `GET /api/rooms/{id}`
- `backend/app/ws/__init__.py` — empty
- `backend/app/main.py` — FastAPI app, CORS, `/health`, `/ws/echo`, router wiring
- `backend/tests/__init__.py` — empty
- `backend/tests/conftest.py` — shared fixtures (sets dummy env keys for unit tests)
- `backend/tests/test_health.py` — health + echo smoke (in-process `TestClient`)
- `backend/tests/test_models.py` — schema round-trip
- `backend/tests/test_eventbus.py` — pub/sub, ring buffer, backpressure
- `backend/tests/test_rooms.py` — RoomManager behavior + API
- `backend/tests/test_config.py` — env loading + masked key logging
- `backend/tests/integration/__init__.py` — empty
- `backend/tests/integration/conftest.py` — spawns `uvicorn` subprocess for the session
- `backend/tests/integration/test_live_server.py` — hits a real running server over HTTP + WS

**File responsibility boundaries:**
- `config.py` owns env loading; no logic beyond `Settings`.
- `models.py` owns wire schema (Pydantic). It is imported by `api/*` and `ws/*` but never imports them.
- `rooms.py` owns room lifecycle + in-process registry. It imports `eventbus.py` but not service modules.
- `eventbus.py` owns fan-out pub/sub. No imports from the rest of the app.
- `api/rooms.py` owns HTTP surface for room CRUD. Depends on `rooms.py`.
- `main.py` is the composition root: constructs app, wires routers, defines `/health` and `/ws/echo`.

---

## Task 1: Initialize backend directory + pyproject.toml

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `backend/.gitignore`
- Create: `backend/README.md`

- [ ] **Step 1: Write `backend/pyproject.toml`**

```toml
[project]
name = "truevoice-backend"
version = "0.1.0"
description = "TrueVoice clinical voice-intelligence backend"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "pydantic>=2.9",
    "pydantic-settings>=2.6",
    "python-dotenv>=1.0",
    "websockets>=13",
    "speechmatics-rt>=1.0",
    "thymia-sentinel>=1.1",
    "anthropic>=0.40",
    "nanoid>=2.0",
    "numpy>=1.26",
    "httpx>=0.27",
]

[dependency-groups]
dev = [
    "ruff>=0.7",
    "pytest>=8.3",
    "pytest-asyncio>=0.24",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["app"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "W", "UP"]
```

- [ ] **Step 2: Write `backend/.env.example`**

```
SPEECHMATICS_API_KEY=
THYMIA_API_KEY=
ANTHROPIC_API_KEY=
ALLOWED_ORIGINS=http://localhost:3000
```

- [ ] **Step 3: Write `backend/.gitignore`**

```
.venv/
__pycache__/
*.pyc
.pytest_cache/
.ruff_cache/

# secrets — never commit real keys
.env
.env.*
!.env.example
*.pem
*.key
credentials.json
service-account*.json

# build artefacts
dist/
build/
*.egg-info/
uv.lock.bak
```

Also append the same secret-file patterns to the repo-root `.gitignore` (create it if missing — a single line `backend/.env` plus the patterns above). Defence-in-depth: two gitignores mean a misplaced key file is caught regardless of where it lands.

- [ ] **Step 4: Write `backend/README.md`**

```markdown
# TrueVoice Backend

FastAPI backend for the TrueVoice clinical voice-intelligence platform.

## Setup

```bash
cd backend
cp .env.example .env
# fill in SPEECHMATICS_API_KEY, THYMIA_API_KEY, ANTHROPIC_API_KEY
uv sync
uv run uvicorn app.main:app --reload
```

Server runs at http://localhost:8000.

## Tests

```bash
uv run pytest
```

## Lint

```bash
uv run ruff check .
```
```

- [ ] **Step 5: Install dependencies**

Run (from `backend/`): `uv sync`
Expected: creates `.venv/`, writes `uv.lock`, no errors.

- [ ] **Step 6: Commit**

User commits. Suggested message: `chore(backend): scaffold pyproject, env example, gitignore`.

---

## Task 2: Create empty package structure

**Files:**
- Create: `backend/app/__init__.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/ws/__init__.py`
- Create: `backend/app/services/__init__.py`
- Create: `backend/tests/__init__.py`

- [ ] **Step 1: Create all `__init__.py` files as empty files**

All five files contain no content (0 bytes is fine).

- [ ] **Step 2: Commit**

User commits. Suggested message: `chore(backend): create package structure`.

---

## Task 3: `config.py` — settings loader (test first)

**Files:**
- Create: `backend/tests/test_config.py`
- Create: `backend/app/config.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_config.py`:
```python
import pytest


def test_settings_loads_from_env(monkeypatch):
    monkeypatch.setenv("SPEECHMATICS_API_KEY", "sm-test")
    monkeypatch.setenv("THYMIA_API_KEY", "th-test")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "an-test")
    from app.config import Settings

    s = Settings(_env_file=None)
    assert s.speechmatics_api_key.get_secret_value() == "sm-test"
    assert s.thymia_api_key.get_secret_value() == "th-test"
    assert s.anthropic_api_key.get_secret_value() == "an-test"
    assert s.allowed_origins == ["http://localhost:3000"]


def test_allowed_origins_csv(monkeypatch):
    monkeypatch.setenv("SPEECHMATICS_API_KEY", "x")
    monkeypatch.setenv("THYMIA_API_KEY", "x")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000,https://example.com")
    from app.config import Settings

    s = Settings(_env_file=None)
    assert s.allowed_origins == ["http://localhost:3000", "https://example.com"]


def test_missing_key_fails_loud(monkeypatch):
    monkeypatch.delenv("SPEECHMATICS_API_KEY", raising=False)
    monkeypatch.delenv("THYMIA_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    from app.config import Settings

    with pytest.raises(Exception):
        Settings(_env_file=None)


def test_mask_key_short_secret():
    from app.config import mask_key
    out = mask_key("sm-verysecretvalue")
    assert out.startswith("sm-")
    assert "verysecretvalue" not in out
    assert "len=" in out


def test_mask_key_empty():
    from app.config import mask_key
    assert mask_key("") == "<empty>"


def test_settings_repr_does_not_leak_secret(monkeypatch):
    monkeypatch.setenv("SPEECHMATICS_API_KEY", "sm-shouldnotappear")
    monkeypatch.setenv("THYMIA_API_KEY", "th-alsohidden")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "an-hidden")
    from app.config import Settings

    s = Settings(_env_file=None)
    r = repr(s)
    assert "shouldnotappear" not in r
    assert "alsohidden" not in r
    assert "hidden" not in r


def test_log_key_presence_returns_masked_entries(monkeypatch):
    monkeypatch.setenv("SPEECHMATICS_API_KEY", "sm-abcdefghij")
    monkeypatch.setenv("THYMIA_API_KEY", "th-klmnopqrst")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "an-uvwxyzabcd")
    from app.config import Settings, log_key_presence

    s = Settings(_env_file=None)
    out = log_key_presence(s)
    assert set(out.keys()) == {"SPEECHMATICS_API_KEY", "THYMIA_API_KEY", "ANTHROPIC_API_KEY"}
    for v in out.values():
        assert "abcdefghij" not in v and "klmnopqrst" not in v and "uvwxyzabcd" not in v
        assert "len=" in v
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `uv run pytest tests/test_config.py -v`
Expected: FAIL with `ImportError` or `ModuleNotFoundError` for `app.config`.

- [ ] **Step 3: Write `backend/app/config.py`**

```python
from typing import Annotated

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    speechmatics_api_key: SecretStr
    thymia_api_key: SecretStr
    anthropic_api_key: SecretStr
    # NoDecode tells pydantic-settings to skip its JSON decoder for this
    # field so the raw env string reaches the field_validator below.
    # Without it, pydantic-settings >= 2.13 tries to JSON-parse the CSV
    # and raises SettingsError before the validator runs.
    allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def split_csv(cls, v):
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v


def mask_key(value: str) -> str:
    """Return a short, non-reversible identifier for a secret.

    Shows the first 3 characters and the length, e.g. "sm-ab****(len=20)".
    Safe to log. Never log raw secret values.
    """
    if not value:
        return "<empty>"
    head = value[:3]
    return f"{head}****(len={len(value)})"


def log_key_presence(settings: "Settings") -> dict[str, str]:
    """Return a dict of {env_var: masked_value} for startup logging."""
    return {
        "SPEECHMATICS_API_KEY": mask_key(settings.speechmatics_api_key.get_secret_value()),
        "THYMIA_API_KEY": mask_key(settings.thymia_api_key.get_secret_value()),
        "ANTHROPIC_API_KEY": mask_key(settings.anthropic_api_key.get_secret_value()),
    }


settings = Settings()
```

Notes:
- `SecretStr` is Pydantic's opaque-string wrapper. Printing a `Settings` instance now shows `speechmatics_api_key=SecretStr('**********')` instead of the raw key — so accidental `repr()`/logging of the settings object can't leak keys.
- Code that needs the real value calls `.get_secret_value()` explicitly. This makes key usage greppable and auditable.
- `mask_key` produces a short identifier safe for logs: first 3 chars + length. Enough to confirm the right key is loaded, not enough to reconstruct it.
- The module-level `settings = Settings()` fails loud at import time if any required key is missing. That's intentional.

- [ ] **Step 4: Handle import-time settings construction in tests**

Update `backend/tests/conftest.py` (create it) so tests don't crash on `from app.config import Settings` when env vars aren't set:

```python
import os

os.environ.setdefault("SPEECHMATICS_API_KEY", "test-sm")
os.environ.setdefault("THYMIA_API_KEY", "test-th")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-an")
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/test_config.py -v`
Expected: 2 passed.

- [ ] **Step 6: Commit**

User commits. Suggested message: `feat(backend): settings loader with CSV allowed_origins`.

---

## Task 4: `models.py` — DashboardEvent union + RoomCreateResponse (test first)

**Files:**
- Create: `backend/tests/test_models.py`
- Create: `backend/app/models.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_models.py`:
```python
import pytest
from pydantic import TypeAdapter, ValidationError

from app.models import DashboardEvent, RoomCreateResponse


_adapter = TypeAdapter(DashboardEvent)


def test_transcript_partial_roundtrip():
    raw = {
        "type": "transcript_partial",
        "role": "patient",
        "text": "hello",
        "ts_ms": 1234,
    }
    evt = _adapter.validate_python(raw)
    assert evt.type == "transcript_partial"
    assert _adapter.dump_python(evt, mode="json") == raw


def test_transcript_final_roundtrip():
    raw = {
        "type": "transcript_final",
        "role": "clinician",
        "text": "okay",
        "start_ms": 1000,
        "end_ms": 2000,
        "utterance_id": "abc123",
    }
    evt = _adapter.validate_python(raw)
    assert evt.end_ms == 2000
    assert _adapter.dump_python(evt, mode="json") == raw


def test_biomarker_progress_roundtrip():
    raw = {
        "type": "biomarker_progress",
        "model": "helios",
        "name": "stress",
        "speech_seconds": 10.5,
        "trigger_seconds": 30.0,
    }
    evt = _adapter.validate_python(raw)
    assert evt.model == "helios"


def test_biomarker_result_roundtrip():
    raw = {
        "type": "biomarker_result",
        "model": "apollo",
        "name": "low_mood",
        "value": 0.75,
        "ts_ms": 5000,
    }
    evt = _adapter.validate_python(raw)
    assert evt.value == 0.75


def test_psyche_update_roundtrip():
    raw = {
        "type": "psyche_update",
        "affect": {
            "neutral": 0.5, "happy": 0.1, "sad": 0.2, "angry": 0.05,
            "fearful": 0.05, "disgusted": 0.05, "surprised": 0.05,
        },
        "ts_ms": 1500,
    }
    evt = _adapter.validate_python(raw)
    assert evt.affect["sad"] == 0.2


def test_concordance_flag_roundtrip():
    raw = {
        "type": "concordance_flag",
        "flag_id": "f1",
        "utterance_id": "u1",
        "utterance_text": "i'm fine",
        "matched_phrase": "i'm fine",
        "biomarker_evidence": [{"name": "low_mood", "value": 0.8, "ts_ms": 4000}],
        "claude_gloss": "Self-report diverges from biomarker signal.",
        "ts_ms": 5000,
    }
    evt = _adapter.validate_python(raw)
    assert evt.biomarker_evidence[0].name == "low_mood"


def test_call_status_roundtrip():
    raw = {"type": "call_status", "status": "connected", "peers": 2}
    evt = _adapter.validate_python(raw)
    assert evt.peers == 2


def test_invalid_role_rejected():
    with pytest.raises(ValidationError):
        _adapter.validate_python({
            "type": "transcript_partial", "role": "nurse", "text": "x", "ts_ms": 0
        })


def test_room_create_response():
    r = RoomCreateResponse(room_id="abc12345", created_at_ms=1700000000000)
    assert r.model_dump() == {"room_id": "abc12345", "created_at_ms": 1700000000000}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_models.py -v`
Expected: FAIL with import error.

- [ ] **Step 3: Write `backend/app/models.py`**

```python
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


Role = Literal["patient", "clinician"]
BioModel = Literal["helios", "apollo", "psyche"]


class TranscriptPartial(BaseModel):
    type: Literal["transcript_partial"]
    role: Role
    text: str
    ts_ms: int


class TranscriptFinal(BaseModel):
    type: Literal["transcript_final"]
    role: Role
    text: str
    start_ms: int
    end_ms: int
    utterance_id: str


class BiomarkerProgress(BaseModel):
    type: Literal["biomarker_progress"]
    model: BioModel
    name: str
    speech_seconds: float
    trigger_seconds: float


class BiomarkerResult(BaseModel):
    type: Literal["biomarker_result"]
    model: Literal["helios", "apollo"]
    name: str
    value: float
    ts_ms: int


class PsycheUpdate(BaseModel):
    type: Literal["psyche_update"]
    # Kept as an open dict[str, float] rather than a strict model so Phase 3
    # payload discovery (PRD 5 Step 0) can surface any extra affect keys
    # Thymia emits without failing validation.
    affect: dict[str, float]
    ts_ms: int


class BiomarkerEvidence(BaseModel):
    name: str
    value: float
    ts_ms: int


class ConcordanceFlag(BaseModel):
    type: Literal["concordance_flag"]
    flag_id: str
    utterance_id: str
    utterance_text: str
    matched_phrase: str
    biomarker_evidence: list[BiomarkerEvidence]
    claude_gloss: str
    ts_ms: int


class CallStatus(BaseModel):
    type: Literal["call_status"]
    status: Literal["connecting", "connected", "ended"]
    peers: int


DashboardEvent = Annotated[
    Union[
        TranscriptPartial,
        TranscriptFinal,
        BiomarkerProgress,
        BiomarkerResult,
        PsycheUpdate,
        ConcordanceFlag,
        CallStatus,
    ],
    Field(discriminator="type"),
]


class RoomCreateResponse(BaseModel):
    room_id: str
    created_at_ms: int


class RoomExistsResponse(BaseModel):
    exists: bool
    created_at_ms: int | None = None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_models.py -v`
Expected: 9 passed.

- [ ] **Step 5: Commit**

User commits. Suggested message: `feat(backend): DashboardEvent discriminated union and room response types`.

---

## Task 5: `eventbus.py` — fan-out pub/sub with ring buffer (test first)

**Files:**
- Create: `backend/tests/test_eventbus.py`
- Create: `backend/app/eventbus.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_eventbus.py`:
```python
import asyncio

import pytest

from app.eventbus import EventBus


async def test_publish_delivers_to_subscriber():
    bus = EventBus()
    q = bus.subscribe()
    bus.publish({"type": "call_status", "status": "connected", "peers": 1})
    evt = await asyncio.wait_for(q.get(), timeout=1.0)
    assert evt["type"] == "call_status"


async def test_multiple_subscribers_all_receive():
    bus = EventBus()
    q1, q2 = bus.subscribe(), bus.subscribe()
    bus.publish({"type": "tick", "n": 1})
    bus.publish({"type": "tick", "n": 2})
    assert (await q1.get())["n"] == 1
    assert (await q1.get())["n"] == 2
    assert (await q2.get())["n"] == 1
    assert (await q2.get())["n"] == 2


async def test_unsubscribe_stops_delivery():
    bus = EventBus()
    q = bus.subscribe()
    bus.unsubscribe(q)
    bus.publish({"type": "tick"})
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(q.get(), timeout=0.05)


async def test_ring_buffer_caps_at_500():
    bus = EventBus()
    for i in range(600):
        bus.publish({"type": "tick", "n": i})
    assert len(bus.recent) == 500
    assert bus.recent[0]["n"] == 100
    assert bus.recent[-1]["n"] == 599


async def test_full_subscriber_drops_oldest_not_crash():
    bus = EventBus(subscriber_maxsize=3)
    q = bus.subscribe()
    for i in range(10):
        bus.publish({"n": i})
    # Queue kept the most recent 3 entries (oldest dropped on overflow).
    drained = []
    while not q.empty():
        drained.append(q.get_nowait()["n"])
    assert drained == [7, 8, 9]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_eventbus.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Write `backend/app/eventbus.py`**

```python
import asyncio
from collections import deque


class EventBus:
    """Per-room async fan-out pub/sub.

    - `publish` is non-blocking; on per-subscriber overflow, the oldest item
      is dropped to make room for the newest (newest-wins). This keeps
      dashboards responsive under burst load at the cost of gap recovery.
    - `recent` is a bounded ring buffer so late subscribers can replay
      history on connect.
    """

    def __init__(self, subscriber_maxsize: int = 500, recent_maxsize: int = 500):
        self._subscribers: list[asyncio.Queue] = []
        self._subscriber_maxsize = subscriber_maxsize
        self.recent: deque[dict] = deque(maxlen=recent_maxsize)

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=self._subscriber_maxsize)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        try:
            self._subscribers.remove(q)
        except ValueError:
            pass

    def publish(self, event: dict) -> None:
        self.recent.append(event)
        for q in self._subscribers:
            self._put_newest_wins(q, event)

    @staticmethod
    def _put_newest_wins(q: asyncio.Queue, event: dict) -> None:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            try:
                q.get_nowait()
            except asyncio.QueueEmpty:
                pass
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_eventbus.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

User commits. Suggested message: `feat(backend): EventBus with newest-wins overflow and ring buffer`.

---

## Task 6: `rooms.py` — Room dataclass + RoomManager (test first)

**Files:**
- Create: `backend/tests/test_rooms.py`
- Create: `backend/app/rooms.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_rooms.py`:
```python
import time

from app.rooms import Room, RoomManager


def test_create_returns_room_with_8char_id_and_eventbus():
    mgr = RoomManager()
    room = mgr.create()
    assert isinstance(room.room_id, str)
    assert len(room.room_id) == 8
    assert room.eventbus is not None
    # All later-phase service slots default to None / empty.
    assert room.thymia_service is None
    assert room.concordance_engine is None
    assert room.audio_distributors == {}
    assert room.speechmatics_tasks == {}
    assert room.peers == {}
    assert room.report is None
    assert room.transcripts == []
    assert room.biomarker_history == []
    assert room.flags == []


def test_get_returns_same_room():
    mgr = RoomManager()
    room = mgr.create()
    assert mgr.get(room.room_id) is room


def test_get_returns_none_for_unknown():
    mgr = RoomManager()
    assert mgr.get("nope") is None


def test_now_ms_monotonic_from_creation():
    mgr = RoomManager()
    room = mgr.create()
    t0 = room.now_ms()
    time.sleep(0.02)
    t1 = room.now_ms()
    assert 0 <= t0 < t1


def test_all_ids():
    mgr = RoomManager()
    r1, r2 = mgr.create(), mgr.create()
    ids = mgr.all_ids()
    assert set(ids) == {r1.room_id, r2.room_id}


def test_module_singleton_exists():
    from app.rooms import rooms as singleton

    assert isinstance(singleton, RoomManager)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_rooms.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Write `backend/app/rooms.py`**

```python
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Optional

from nanoid import generate as nanoid_generate

from app.eventbus import EventBus


_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"


@dataclass
class Room:
    room_id: str
    created_at_ms: int  # UNIX epoch ms at room creation

    # Event history (late-joiner replay).
    recent_events: deque = field(default_factory=lambda: deque(maxlen=500))

    # Populated across later phases; never restructured, only assigned.
    transcripts: list[dict] = field(default_factory=list)
    biomarker_history: list[dict] = field(default_factory=list)
    flags: list[dict] = field(default_factory=list)

    eventbus: Any = None

    audio_distributors: dict[str, Any] = field(default_factory=dict)
    speechmatics_tasks: dict[str, Any] = field(default_factory=dict)
    thymia_service: Optional[Any] = None
    concordance_engine: Optional[Any] = None
    peers: dict[str, Any] = field(default_factory=dict)

    report: Optional[dict] = None

    def now_ms(self) -> int:
        return int(time.time() * 1000) - self.created_at_ms


class RoomManager:
    def __init__(self):
        self._rooms: dict[str, Room] = {}

    def create(self) -> Room:
        room_id = nanoid_generate(_ID_ALPHABET, 8)
        room = Room(
            room_id=room_id,
            created_at_ms=int(time.time() * 1000),
            eventbus=EventBus(),
        )
        self._rooms[room_id] = room
        return room

    def get(self, room_id: str) -> Room | None:
        return self._rooms.get(room_id)

    def all_ids(self) -> list[str]:
        return list(self._rooms.keys())


rooms = RoomManager()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_rooms.py -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

User commits. Suggested message: `feat(backend): Room dataclass with reserved service slots and RoomManager`.

---

## Task 7: `api/rooms.py` — HTTP surface for rooms (test first)

**Files:**
- Create: `backend/app/api/rooms.py`
- Modify: `backend/tests/test_rooms.py` (add API tests)

- [ ] **Step 1: Append API tests to `backend/tests/test_rooms.py`**

Append to the file created in Task 6:
```python
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from app.main import app

    return TestClient(app)


def test_post_rooms_returns_new_room(client):
    r = client.post("/api/rooms")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["room_id"], str)
    assert len(body["room_id"]) == 8
    assert isinstance(body["created_at_ms"], int)


def test_get_rooms_existing(client):
    created = client.post("/api/rooms").json()
    r = client.get(f"/api/rooms/{created['room_id']}")
    assert r.status_code == 200
    body = r.json()
    assert body["exists"] is True
    assert body["created_at_ms"] == created["created_at_ms"]


def test_get_rooms_missing(client):
    r = client.get("/api/rooms/doesnotex")
    assert r.status_code == 200
    assert r.json() == {"exists": False, "created_at_ms": None}
```

Note: these tests will fail on Task 7 until `main.py` (Task 8) wires the router, but the router implementation itself is Task 7.

- [ ] **Step 2: Write `backend/app/api/rooms.py`**

```python
from fastapi import APIRouter

from app.models import RoomCreateResponse, RoomExistsResponse
from app.rooms import rooms

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


@router.post("", response_model=RoomCreateResponse)
def create_room() -> RoomCreateResponse:
    room = rooms.create()
    return RoomCreateResponse(room_id=room.room_id, created_at_ms=room.created_at_ms)


@router.get("/{room_id}", response_model=RoomExistsResponse)
def get_room(room_id: str) -> RoomExistsResponse:
    room = rooms.get(room_id)
    if room is None:
        return RoomExistsResponse(exists=False, created_at_ms=None)
    return RoomExistsResponse(exists=True, created_at_ms=room.created_at_ms)
```

- [ ] **Step 3: Do not run tests yet**

The API tests require `app.main` to exist (Task 8). Proceed to Task 8; both Task 7 and Task 8's tests will pass together.

- [ ] **Step 4: Commit**

User commits. Suggested message: `feat(backend): rooms HTTP router (POST + GET)`.

---

## Task 8: `main.py` — app composition, `/health`, `/ws/echo`, router wiring (test first)

**Files:**
- Create: `backend/tests/test_health.py`
- Create: `backend/app/main.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_health.py`:
```python
from fastapi.testclient import TestClient


def test_health_ok():
    from app.main import app

    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_ws_echo():
    from app.main import app

    client = TestClient(app)
    with client.websocket_connect("/ws/echo") as ws:
        ws.send_text("hi")
        assert ws.receive_text() == "hi"


def test_ws_echo_binary():
    from app.main import app

    client = TestClient(app)
    with client.websocket_connect("/ws/echo") as ws:
        ws.send_bytes(b"\x00\x01\x02")
        assert ws.receive_bytes() == b"\x00\x01\x02"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_health.py -v`
Expected: FAIL with `ModuleNotFoundError` for `app.main`.

- [ ] **Step 3: Write `backend/app/main.py`**

```python
import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api.rooms import router as rooms_router
from app.config import log_key_presence, settings

logger = logging.getLogger("truevoice")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(title="TrueVoice backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rooms_router)


@app.on_event("startup")
def _log_startup() -> None:
    logger.info("TrueVoice backend starting")
    logger.info("Allowed origins: %s", settings.allowed_origins)
    for name, masked in log_key_presence(settings).items():
        logger.info("%s loaded: %s", name, masked)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.websocket("/ws/echo")
async def ws_echo(ws: WebSocket) -> None:
    await ws.accept()
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                return
            if "text" in msg and msg["text"] is not None:
                await ws.send_text(msg["text"])
            elif "bytes" in msg and msg["bytes"] is not None:
                await ws.send_bytes(msg["bytes"])
    except WebSocketDisconnect:
        return
```

- [ ] **Step 4: Run all tests to verify everything passes**

Run: `uv run pytest -v`
Expected: all tests from Tasks 3, 4, 5, 6, 7, 8 pass. Zero failures.

- [ ] **Step 5: Start the server and hit it manually**

Run (from `backend/`): `uv run uvicorn app.main:app --reload`
In another terminal:
```bash
curl http://localhost:8000/health
# Expected: {"ok":true}
curl -X POST http://localhost:8000/api/rooms
# Expected: {"room_id":"abcd1234","created_at_ms":...}
```
Stop the server with Ctrl+C.

- [ ] **Step 6: Commit**

User commits. Suggested message: `feat(backend): FastAPI app with /health, /ws/echo, and rooms router wired`.

---

## Task 9: Live-server integration smoke (test first, test-only)

**Files:**
- Create: `backend/tests/integration/__init__.py` (empty)
- Create: `backend/tests/integration/conftest.py`
- Create: `backend/tests/integration/test_live_server.py`

Goal: prove the backend works when launched as a real uvicorn process, not just in-process. This catches startup-event bugs, CORS misconfig, and import-order surprises the `TestClient` path hides. The pattern set here extends across every later phase — each phase adds one more live-server integration test for its new endpoints.

- [ ] **Step 1: Write `backend/tests/integration/conftest.py`**

```python
import os
import socket
import subprocess
import sys
import time
from contextlib import closing

import httpx
import pytest


def _free_port() -> int:
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait_for_ready(base_url: str, timeout_s: float = 10.0) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            r = httpx.get(f"{base_url}/health", timeout=0.5)
            if r.status_code == 200:
                return
        except httpx.TransportError:
            pass
        time.sleep(0.1)
    raise RuntimeError(f"server at {base_url} did not become ready within {timeout_s}s")


@pytest.fixture(scope="session")
def live_server():
    """Spawn a real uvicorn process for the whole test session. Yields its base URL."""
    port = _free_port()
    base_url = f"http://127.0.0.1:{port}"
    env = os.environ.copy()
    env.setdefault("SPEECHMATICS_API_KEY", "integration-sm")
    env.setdefault("THYMIA_API_KEY", "integration-th")
    env.setdefault("ANTHROPIC_API_KEY", "integration-an")
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        env=env,
        cwd=os.path.join(os.path.dirname(__file__), "..", ".."),
    )
    try:
        _wait_for_ready(base_url)
        yield base_url
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)


@pytest.fixture(scope="session")
def ws_base(live_server):
    return live_server.replace("http://", "ws://")
```

- [ ] **Step 2: Write `backend/tests/integration/test_live_server.py`**

```python
import asyncio

import httpx
import pytest
import websockets

pytestmark = pytest.mark.integration


def test_health_live(live_server):
    r = httpx.get(f"{live_server}/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_rooms_create_and_fetch_live(live_server):
    created = httpx.post(f"{live_server}/api/rooms").json()
    assert len(created["room_id"]) == 8
    fetched = httpx.get(f"{live_server}/api/rooms/{created['room_id']}").json()
    assert fetched["exists"] is True
    assert fetched["created_at_ms"] == created["created_at_ms"]


def test_rooms_missing_live(live_server):
    r = httpx.get(f"{live_server}/api/rooms/doesnotex")
    assert r.status_code == 200
    assert r.json() == {"exists": False, "created_at_ms": None}


def test_ws_echo_text_live(ws_base):
    async def run():
        async with websockets.connect(f"{ws_base}/ws/echo") as ws:
            await ws.send("hello-live")
            reply = await asyncio.wait_for(ws.recv(), timeout=2.0)
            assert reply == "hello-live"

    asyncio.run(run())


def test_ws_echo_binary_live(ws_base):
    async def run():
        async with websockets.connect(f"{ws_base}/ws/echo") as ws:
            await ws.send(b"\x01\x02\x03")
            reply = await asyncio.wait_for(ws.recv(), timeout=2.0)
            assert reply == b"\x01\x02\x03"

    asyncio.run(run())


def test_cors_header_present_live(live_server):
    r = httpx.options(
        f"{live_server}/api/rooms",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert r.status_code in (200, 204)
    allow_origin = r.headers.get("access-control-allow-origin")
    assert allow_origin in ("http://localhost:3000", "*")
```

- [ ] **Step 3: Register the `integration` marker**

Append to `backend/pyproject.toml` under `[tool.pytest.ini_options]`:

```toml
markers = [
    "integration: live-server integration tests (spawn real uvicorn; slower)",
]
```

- [ ] **Step 4: Run integration tests**

Run (from `backend/`): `uv run pytest tests/integration -v`
Expected: 6 passed. First run takes ~2s longer due to server spawn.

- [ ] **Step 5: Run the full suite (unit + integration)**

Run: `uv run pytest -v`
Expected: every test from every task passes; no warnings about unknown markers.

- [ ] **Step 6: Confirm `pytest -m "not integration"` skips the live tests**

Run: `uv run pytest -m "not integration" -v`
Expected: unit tests run, integration tests are deselected. This is the fast iteration mode during development.

- [ ] **Step 7: Commit**

User commits. Suggested message: `test(backend): live-server integration harness (phase 1)`.

---

## Task 10: Lint + final acceptance gate

**Files:** none (verification-only task).

- [ ] **Step 1: Run ruff**

Run (from `backend/`): `uv run ruff check .`
Expected: `All checks passed!` (or zero issues).
If issues: fix them, re-run until clean.

- [ ] **Step 2: Run full test suite one more time**

Run: `uv run pytest -v`
Expected: all tests pass.

- [ ] **Step 3: Manual PRD 1 acceptance test**

From `voice-ai-hack-prds.md` PRD 1:
- Start server: `uv run uvicorn app.main:app --reload` → listens on :8000.
- `curl localhost:8000/health` → `{"ok":true}`.
- In a browser console at about:blank: `let ws = new WebSocket("ws://localhost:8000/ws/echo"); ws.onmessage = e => console.log(e.data); ws.onopen = () => ws.send("hi")` — observe `"hi"` echoed back.

- [ ] **Step 4: Manual PRD 2 acceptance test**

From `voice-ai-hack-prds.md` PRD 2:
- `curl -X POST http://localhost:8000/api/rooms` returns a valid `{room_id, created_at_ms}`.
- `curl http://localhost:8000/api/rooms/{id}` using the returned id → `{"exists": true, "created_at_ms": <same>}`.
- `curl http://localhost:8000/api/rooms/doesnotex` → `{"exists": false, "created_at_ms": null}`.

- [ ] **Step 5: Report completion**

Post a progress update to the user:
- List of files created.
- Acceptance test results (both PRD 1 and PRD 2).
- Ready for them to commit.
- Next phase: audio ingress WebSocket (PRD 3 backend).

- [ ] **Step 6: Commit (user)**

User commits any final tweaks. Suggested message: `chore(backend): phase 1 complete (scaffold + rooms)`.

---

## Phase 1 — Done criteria

All the following must be true before declaring Phase 1 complete and moving to Phase 2 (audio ingress):

1. `uv run pytest` → 0 failures (unit + integration).
2. `uv run pytest -m "not integration"` → 0 failures (fast mode still green).
3. `uv run ruff check .` → clean.
4. PRD 1 acceptance test passes (health + ws/echo manually verified).
5. PRD 2 acceptance test passes (rooms POST + GET manually verified).
6. Live-server integration tests in `tests/integration/test_live_server.py` all pass.
7. Server startup log shows each API key loaded with masked value (e.g. `SPEECHMATICS_API_KEY loaded: sm-****(len=20)`) — confirm visually once.
8. `Room` dataclass has reserved slots for every later-phase service (asserted in `test_create_returns_room_with_8char_id_and_eventbus`).
9. `.env` is not tracked by git (`git check-ignore backend/.env` returns exit 0).
10. All files committed (user).

## What the frontend teammate can start on in parallel

Once Phase 1 lands, the frontend teammate has a stable contract for:
- `POST /api/rooms` and `GET /api/rooms/{id}` — for the landing page's "Start telehealth / in-person" tiles and the dead-link role pages.
- `/health` — for env sanity banner on the landing page.
- `/ws/echo` — for smoke-testing their WebSocket client abstraction.
- The full `DashboardEvent` union — they should mirror it exactly in `frontend/lib/types.ts`.

Any divergence from these interfaces is a bug in one side or the other; neither side mutates them without a coordinated commit.
