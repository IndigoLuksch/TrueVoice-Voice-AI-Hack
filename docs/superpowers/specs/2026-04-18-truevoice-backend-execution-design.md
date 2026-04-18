# TrueVoice — Backend Execution Design

**Date**: 2026-04-18
**Scope**: Backend only. Frontend is handed off to a teammate working in parallel.
**Authoritative spec**: `voice-ai-hack-prds.md` at repo root. This document captures (1) scope split, (2) reference-informed SDK corrections to the PRD, (3) execution strategy, and (4) the frontend hand-off contract.

---

## 1. Scope split: backend vs frontend

| PRD | Backend deliverables | Frontend deliverables |
|---|---|---|
| 1 | `pyproject.toml`, `.env.example`, `config.py`, `models.py`, `main.py`, `/health`, `/ws/echo` | `package.json`, `next.config.mjs`, `lib/types.ts`, landing page, dead links |
| 2 | `rooms.py` (Room dataclass, RoomManager), `eventbus.py`, `api/rooms.py` | Role stub pages, landing page tiles wired |
| 3 | `ws/audio.py` (binary ingress, 1280-byte frame assertion, AudioDistributor hook) | `pcm-worklet.js`, `lib/audioCapture.ts`, patient page mic flow |
| 4 | `services/speechmatics.py`, `ws/dashboard.py` | `lib/dashboardSocket.ts`, `TranscriptLane.tsx`, clinician page |
| 5 | `services/thymia.py` (+ Step 0 payload discovery, schema sync) | `BiomarkerLane.tsx` |
| 6 | `services/concordance.py`, `services/claude.py` (gloss) | `FlagCard.tsx`, flag panel |
| 7 | `ws/signaling.py` | `lib/webrtc.ts`, `VideoTile.tsx`, page integration |
| 8 | — (no backend changes) | `Dashboard.tsx`, `ConcordanceMeter.tsx`, connection-health pills |
| 9 | — (no backend changes; existing audio WS reused) | `inperson/[room]/page.tsx` |
| 10 | `api/report.py`, `services/claude.py` (report generation) | `report/[room]/page.tsx`, markdown render, print CSS |
| 11 | `api/compare.py`, startup precompute job, ffmpeg Opus round-trip | `compare/page.tsx` |
| 12 | Root + backend README, error logging, env sanity | Frontend README, error UX banners |

I own: everything in the "Backend deliverables" column. Teammate owns the frontend column.

**Rule**: neither side modifies the shared event schema unilaterally. If PRD 5 Step 0 discovers a payload shape that doesn't match, the schema update lands in both `backend/app/models.py` and `frontend/lib/types.ts` in the same commit, coordinated between us.

---

## 2. Reference-informed SDK corrections

The PRD was written from docs, not from the hackathon reference examples. After reading `thymia-ai/voice-ai-hack-lnd-26/examples/{00,01}/run.py` and the `pyproject.toml`, here are the binding corrections:

### Speechmatics (affects PRD 4)

- Import surface (modern SDK):
  ```python
  from speechmatics.rt import (
      AsyncClient, AudioEncoding, AudioFormat, ConversationConfig,
      OperatingPoint, ServerMessageType, SpeakerDiarizationConfig,
      TranscriptionConfig, TranscriptResult,
  )
  ```
- Event handlers use the `@client.on(ServerMessageType.ADD_PARTIAL_TRANSCRIPT)` decorator, not raw callbacks.
- Parse messages with `TranscriptResult.from_message(message)`; the transcript string lives at `result.metadata.transcript`.
- `max_delay=2.0` (PRD said `1.0`) — the example uses 2.0 and it's the right stability tradeoff for medical domain.
- Extra config knobs the PRD didn't list, include them:
  - `ConversationConfig(end_of_utterance_silence_trigger=0.7)`
  - `SpeakerDiarizationConfig(speaker_sensitivity=0.7)`
- Session lifecycle: `async with AsyncClient(api_key=...)` then `await client.start_session(transcription_config, audio_format)`. Audio fed via `await client.send_audio(chunk)`. Stop via `await client.stop_session()`.
- Audio format for `AudioFormat`: `encoding=AudioEncoding.PCM_S16LE, sample_rate=16000, chunk_size=4096`. Our wire frames are 1280 bytes — fine, the SDK accepts variable chunk sizes; the `chunk_size` param is a buffering hint.

### Thymia Sentinel (affects PRD 5)

- Constructor: `SentinelClient(user_label=..., policies=[...], biomarkers=[...], sample_rate=16000)`. The `sample_rate` kwarg is explicit.
- Handlers registered via decorators `@sentinel.on_progress` and `@sentinel.on_policy_result` — PRD shape was right.
- `send_user_transcript(text, is_final=True)` — the `is_final` kwarg was missing from the PRD.
- `await sentinel.connect()` before feeding audio; `await sentinel.send_user_audio(chunk)` per chunk; `await sentinel.close()` at end.
- **Step 0 still required**: basics example uses `policies=["passthrough"]` + `biomarkers=["helios", "psyche"]`. We plan `policies=["wellbeing-awareness"]` + `biomarkers=["helios", "apollo", "psyche"]`. The payload shape for these policies/biomarkers in combination is not verified from the example — log raw payloads on the first real run before writing the mapping.

### Dependencies (affects PRD 1 `pyproject.toml`)

Pins from the reference:
- `speechmatics-rt >= 1.0.0`
- `thymia-sentinel >= 1.1.0`
- `python-dotenv >= 1.0.0`
- `httpx >= 0.27.0`
- `numpy >= 1.26.0` (for any audio math — Opus round-trip, etc.)
- Python 3.10+ (PRD said 3.11 — either works, go with 3.11 for newer stdlib features)

PRD additions beyond the reference: `fastapi`, `uvicorn[standard]`, `pydantic>=2`, `pydantic-settings`, `websockets`, `anthropic`, `nanoid`. Dev: `ruff`, `pytest`, `pytest-asyncio`.

---

## 3. Execution strategy

### Main trunk (sequential, gates everything)

```
PRD 1 → PRD 2 → PRD 3 → PRD 4 → PRD 5 → PRD 6 → PRD 10
```

This is the demo money-shot path: minimization flag cards + end-of-consult report. Nothing else matters if this chain isn't rock-solid.

### Parallel side track (starts after PRD 3 acceptance test passes)

```
PRD 7 (WebRTC signaling)
```

Signaling is a pure relay with no dependency on the diagnostic pipeline beyond `room.peers` living on the Room dataclass (already reserved in PRD 2). Can proceed independently.

### Polish wave (after PRD 10 passes)

```
PRD 11 (codec compare — batch, cacheable, startup job) → PRD 12 (README + error UX)
```

PRDs 8 and 9 are pure frontend; the teammate owns those and we do not block on them.

### Acceptance-test gate between every PRD

Every PRD's "Acceptance test" section runs verbatim before starting the next PRD. A failing gate means we fix before proceeding — no stacking PRDs on a broken foundation. This is the core bulletproofing mechanism.

### Schema drift checkpoint at PRD 5 Step 0

**Before** writing any `on_progress` / `on_policy_result` mapping: wire temporary `print(json.dumps(payload, default=str))` inside each handler, run a 60+ second session, inspect raw keys. If the discovered shape differs from the `DashboardEvent` union, update `backend/app/models.py` AND tell the teammate to update `frontend/lib/types.ts` in lockstep before continuing. This is the single largest cascading-bug risk in the PRD.

### Demo-critical subset if anything slips

1, 2, 3, 4, 5, 6, 10 → minimum to tell the pitch story. 7, 8, 9, 11, 12 all improve the demo but none of them carry the narrative alone.

---

## 4. Frontend hand-off contract

These are the stable interfaces my teammate codes the frontend against. Once these are defined (end of PRD 2 / PRD 3), they do not change without a coordinated commit on both sides.

### HTTP endpoints

- `GET /health` → `{"ok": true}`
- `POST /api/rooms` → `{"room_id": str, "created_at_ms": int}`
- `GET /api/rooms/{room_id}` → `{"exists": bool, "created_at_ms"?: int}`
- `POST /api/report/{room_id}` → `{"ok": true}` (triggers generation)
- `GET /api/report/{room_id}` → `{"markdown": str, "generated_at_ms": int, "duration_sec": int, "flags": [...], "transcripts": [...], "biomarker_history": [...]}`
- `GET /api/compare` → `{"raw": {...}, "opus": {...}, "delta": {...}, "generated_at_ms": int}` or 503 if precompute not yet ready

### WebSocket endpoints

- `/ws/echo` — smoke test, echoes text frames
- `/ws/audio/{role}/{room_id}` — role ∈ {"patient", "clinician"}; binary PCM16LE @ 16kHz, exactly 1280-byte frames (640 samples, 40ms)
- `/ws/dashboard/{room_id}` — one-way push of `DashboardEvent` JSON; replays last 100 buffered events on connect
- `/ws/signaling/{room_id}` — WebRTC signaling relay; `{"type": "hello"}` → server `{"type": "welcome", "peer_id", "peers": [...]}`; relay `{"type": "signal", "to", "data"}`

### Shared event schema

The `DashboardEvent` discriminated union in PRD §"Shared event schema" is the single source of truth. `backend/app/models.py` (Pydantic) and `frontend/lib/types.ts` (TS) must mirror each other exactly. `ts_ms` is milliseconds since room creation (monotonic, server-assigned).

### Env vars the frontend needs

- `NEXT_PUBLIC_BACKEND_WS_URL` — e.g. `ws://localhost:8000` — used because Next.js rewrites don't proxy WebSockets.
- Next.js rewrites handle `/api/*` → `http://localhost:8000/api/*` for HTTP only.

### CORS

Backend allows `http://localhost:3000` by default via `allowed_origins` in `Settings`.

---

## 5. Progress visibility for user commits

The user wants to make small commits along the way. After each PRD's backend portion lands and passes its acceptance test, I will post a status update listing:

- What files were created/modified
- What acceptance test was run and its result
- What's the next PRD and its prereqs

This gives natural commit boundaries the user can use to make their own incremental commits alongside mine. I will not batch multiple PRDs into one commit — each PRD completing gets its own commit with the acceptance-test result referenced.

---

## 6. What this design does not cover

- Frontend component design, layout, styling — owned by teammate.
- Deployment / HIPAA / persistent storage — explicitly out of scope for the hackathon (ephemeral in-memory rooms).
- TURN servers for WebRTC — same-network demo only.
- Multi-room scaling — single FastAPI process, single RoomManager singleton.

These are all intentional scope cuts from the PRD and remain cut.
