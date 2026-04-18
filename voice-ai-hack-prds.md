# Voice AI Hack — Build Plan (PRDs for Cursor Composer 2)

A clinical voice-intelligence platform combining Speechmatics medical STT + Thymia Sentinel biomarkers, with three consultation surfaces: telehealth (browser video call), in-person (single laptop), and a telehealth-codec comparison demo.

**Pitch one-liner**: *Patients minimize. Voices don't. We capture raw clinical signal wherever the consultation happens, flag minimization-biomarker concordance gaps live, and hand the GP a one-page evidence report at the end.*

## How to use this document

Feed PRDs to Cursor Composer 2 **in order**. Each PRD lists its prerequisites and ends with an explicit acceptance test. Do not skip ahead — later PRDs assume earlier ones work. If a test fails, fix before proceeding.

## Conventions referenced by every PRD

### Languages / frameworks
- **Backend**: Python 3.11, FastAPI, uvicorn, pydantic v2, pydantic-settings, `speechmatics-rt`, `thymia-sentinel`, `anthropic`.
- **Frontend**: Next.js 14 App Router, TypeScript (strict), Tailwind CSS, `simple-peer` for WebRTC. No component library — plain Tailwind.
- **Dep manager**: `uv` for backend (matches hackathon repo), `pnpm` for frontend.
- **Env**: `.env` at each app root. Keys: `SPEECHMATICS_API_KEY`, `THYMIA_API_KEY`, `ANTHROPIC_API_KEY`.

### Audio format (canonical)
- Capture: 48kHz Float32 stereo from browser.
- Transmit: **16kHz mono PCM16 little-endian**. Downsampled client-side in the AudioWorklet.
- Frame size on wire: 640 samples (40ms @ 16kHz) = 1280 bytes. Send as binary WebSocket messages.

### Room model
- `room_id`: 8-char nanoid, URL-safe.
- In-memory only. Single FastAPI process, one `RoomManager` singleton. No Redis, no DB. Sessions are ephemeral and end when the room closes.

### Claude models
- Flag-gloss (hot path, sub-second): `claude-haiku-4-5-20251001`.
- End-of-consult report: `claude-sonnet-4-6`.

### Shared event schema (both TS and Python must mirror this)

All events published on `/ws/dashboard/{room}` are JSON with this union type:

```ts
type DashboardEvent =
  | { type: "transcript_partial"; role: "patient" | "clinician"; text: string; ts_ms: number }
  | { type: "transcript_final"; role: "patient" | "clinician"; text: string; start_ms: number; end_ms: number; utterance_id: string }
  | { type: "biomarker_progress"; model: "helios" | "apollo" | "psyche"; name: string; speech_seconds: number; trigger_seconds: number }
  | { type: "biomarker_result"; model: "helios" | "apollo"; name: string; value: number; ts_ms: number }
  | { type: "psyche_update"; affect: { neutral: number; happy: number; sad: number; angry: number; fearful: number; disgusted: number; surprised: number }; ts_ms: number }
  | { type: "concordance_flag"; flag_id: string; utterance_id: string; utterance_text: string; matched_phrase: string; biomarker_evidence: { name: string; value: number; ts_ms: number }[]; claude_gloss: string; ts_ms: number }
  | { type: "call_status"; status: "connecting" | "connected" | "ended"; peers: number };
```

All `ts_ms` values are milliseconds since room creation (monotonic, shared clock issued by backend).

### Project structure (final, don't deviate)

```
voice-ai-hack/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── models.py              # Pydantic event schema
│   │   ├── rooms.py               # RoomManager, Room state
│   │   ├── eventbus.py            # Per-room async pub/sub
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── speechmatics.py
│   │   │   ├── thymia.py
│   │   │   ├── claude.py
│   │   │   └── concordance.py
│   │   ├── ws/
│   │   │   ├── __init__.py
│   │   │   ├── signaling.py
│   │   │   ├── audio.py
│   │   │   └── dashboard.py
│   │   └── api/
│   │       ├── __init__.py
│   │       ├── rooms.py
│   │       └── report.py
│   ├── pyproject.toml
│   ├── .env.example
│   └── README.md
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── patient/[room]/page.tsx
│   │   ├── clinician/[room]/page.tsx
│   │   ├── inperson/[room]/page.tsx
│   │   ├── report/[room]/page.tsx
│   │   └── compare/page.tsx       # Opus vs raw demo
│   ├── components/
│   │   ├── VideoTile.tsx
│   │   ├── AudioCaptureProvider.tsx
│   │   ├── Dashboard.tsx
│   │   ├── TranscriptLane.tsx
│   │   ├── BiomarkerLane.tsx
│   │   ├── FlagCard.tsx
│   │   └── ConcordanceMeter.tsx
│   ├── lib/
│   │   ├── types.ts
│   │   ├── webrtc.ts
│   │   ├── audioCapture.ts
│   │   └── dashboardSocket.ts
│   ├── public/
│   │   └── pcm-worklet.js
│   ├── package.json
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   └── tsconfig.json
└── README.md
```

---

## PRD 1 — Scaffold, shared schema, smoke tests

**Goal**: Both apps boot. Shared event schema exists in Python and TypeScript. A trivial WebSocket echo verifies the full dev loop.

**Prereqs**: none.

**Deliverables**:

1. **Root `README.md`** with setup commands for both apps.
2. **`backend/pyproject.toml`**: dependencies = `fastapi`, `uvicorn[standard]`, `pydantic>=2`, `pydantic-settings`, `python-dotenv`, `websockets`, `speechmatics-rt`, `thymia-sentinel`, `anthropic`, `nanoid`. Dev: `ruff`, `pytest`, `pytest-asyncio`.
3. **`backend/.env.example`** with the three API keys as blanks.
4. **`backend/app/config.py`**: `Settings(BaseSettings)` with `speechmatics_api_key`, `thymia_api_key`, `anthropic_api_key`, `allowed_origins: list[str] = ["http://localhost:3000"]`. Loads from `.env`.
5. **`backend/app/models.py`**: Pydantic discriminated union mirroring the `DashboardEvent` TS type above. Use `Literal` on `type` field. Plus `RoomCreateResponse { room_id: str, created_at_ms: int }`.
6. **`backend/app/main.py`**: FastAPI app, CORS middleware, health check `GET /health` returning `{"ok": true}`, and a smoke WebSocket `/ws/echo` that echoes text frames.
7. **`frontend/package.json`**: Next.js 14, React 18, TypeScript 5, Tailwind 3, `simple-peer`, `@types/simple-peer`, `nanoid`.
8. **`frontend/lib/types.ts`**: the `DashboardEvent` union + `RoomCreateResponse` type.
9. **`frontend/app/page.tsx`**: a landing page with buttons that call `POST /api/rooms` (stubbed for now — just `fetch('/health')`), display response, and links to `/patient/[room]`, `/clinician/[room]`, `/inperson/[room]` (dead links OK for now). Three big tiles: "Start telehealth", "Start in-person", "Compare codec demo".
10. **`frontend/next.config.mjs`**: rewrites for `/api/*` and `/ws/*` to `http://localhost:8000/*` during dev. (See note below on proxying WebSockets.)

**Implementation notes**:
- Next.js `rewrites` proxies HTTP fine but **not** WebSockets. For WebSockets, connect the client directly to `ws://localhost:8000/ws/...` using the full URL from `NEXT_PUBLIC_BACKEND_WS_URL` env var. Bake this into `dashboardSocket.ts` in the next PRD.
- Tailwind config: dark mode class-based, default colors only.
- No ESLint noise — set `eslint-config-next` only.

**Acceptance test**:
- `cd backend && uv sync && uv run uvicorn app.main:app --reload` — server starts on :8000, `curl localhost:8000/health` returns `{"ok":true}`.
- `cd frontend && pnpm i && pnpm dev` — landing renders on :3000 with three tiles.
- Browser console: `new WebSocket("ws://localhost:8000/ws/echo").send("hi")` — receives `"hi"` back.

---

## PRD 2 — Rooms API, RoomManager, EventBus

**Goal**: Backend can create rooms, track their clock, and fan events per-room. Frontend can create a room and land on a per-role page with the room ID in the URL.

**Prereqs**: PRD 1.

**Deliverables**:

1. **`backend/app/rooms.py`** — define the complete `Room` dataclass now, with all fields that later PRDs will populate. Do **not** mutate this structure in later PRDs; only assign values to existing fields.

   ```python
   from dataclasses import dataclass, field
   from collections import deque
   from typing import Any, Optional
   import time

   @dataclass
   class Room:
       room_id: str
       created_at_ms: int  # UNIX epoch ms at room creation

       # Event history (bounded ring buffer) for dashboard replay on reconnect
       recent_events: deque = field(default_factory=lambda: deque(maxlen=500))

       # Populated by services across PRDs 4–6
       transcripts: list[dict] = field(default_factory=list)           # {role, text, start_ms, end_ms, utterance_id}
       biomarker_history: list[dict] = field(default_factory=list)     # {model, name, value, ts_ms}
       flags: list[dict] = field(default_factory=list)                 # concordance_flag event dicts

       # Wired in PRD 2
       eventbus: Any = None                # EventBus

       # Wired in PRDs 3, 5, 6, 7 — leave None until the respective PRD sets them
       audio_distributors: dict[str, Any] = field(default_factory=dict)  # role -> AudioDistributor (PRD 5)
       speechmatics_tasks: dict[str, Any] = field(default_factory=dict)  # role -> asyncio.Task (PRD 4)
       thymia_service: Optional[Any] = None                              # ThymiaService (PRD 5)
       concordance_engine: Optional[Any] = None                          # ConcordanceEngine (PRD 6)
       peers: dict[str, Any] = field(default_factory=dict)               # peer_id -> WebSocket (PRD 7)

       # Populated in PRD 10
       report: Optional[dict] = None  # {markdown, generated_at_ms, duration_sec}

       def now_ms(self) -> int:
           return int(time.time() * 1000) - self.created_at_ms
   ```

   - `class RoomManager`: `create() -> Room` (generates nanoid id, constructs Room, attaches an `EventBus` instance to `room.eventbus`, returns it), `get(room_id) -> Room | None`, `all_ids() -> list[str]`. Singleton at module scope: `rooms = RoomManager()`.
   - `RoomManager.create` does not wire `thymia_service` / `concordance_engine` / `audio_distributors` — those are populated by their respective services when audio first arrives. This avoids paying for service startup on rooms that never get used.

2. **`backend/app/eventbus.py`**:
   - `class EventBus`: async fan-out pub/sub. Methods: `subscribe() -> asyncio.Queue`, `unsubscribe(queue)`, `publish(event: dict)`. Publish also appends to the room's event ring buffer (so late-joining dashboards can replay recent history on connect — see dashboard PRD).

3. **`backend/app/api/rooms.py`**:
   - `POST /api/rooms` — creates room, returns `{room_id, created_at_ms}`.
   - `GET /api/rooms/{room_id}` — returns `{exists: bool, created_at_ms?: int}`.

4. **`backend/app/main.py`**: wire the router.

5. **`frontend/app/page.tsx`**: the three tiles now actually call `POST /api/rooms` and route to `/patient/[room_id]`, `/clinician/[room_id]`, or `/inperson/[room_id]`.

6. **Three stub pages**: `/patient/[room]/page.tsx`, `/clinician/[room]/page.tsx`, `/inperson/[room]/page.tsx` — each displays the room ID and a placeholder "Coming in next PRD" message.

**Implementation notes**:
- `nanoid` on both sides; use `size=8`, URL-safe alphabet.
- Use `asyncio.Queue(maxsize=500)` per subscriber; drop oldest if full to avoid backpressure crashes.
- `EventBus.publish` is non-blocking — iterate subscribers and `put_nowait`; on `QueueFull`, pop one and retry once, then drop.

**Acceptance test**:
- Click "Start telehealth" → lands on `/clinician/abc12345` with room ID displayed.
- `curl -X POST localhost:8000/api/rooms` returns a valid room ID; subsequent `GET /api/rooms/{id}` returns `exists: true`.

---

## PRD 3 — Audio capture pipeline (client + server)

**Goal**: Patient browser mic → 16kHz PCM16 → backend WebSocket. Backend validates framing. No STT yet, just prove audio bytes arrive correctly.

**Prereqs**: PRD 2.

**Deliverables**:

1. **`frontend/public/pcm-worklet.js`** — an `AudioWorkletProcessor` that converts incoming 128-sample Float32 frames at 48kHz to 640-sample PCM16 frames at 16kHz, posting each completed frame to the main thread.

   **Critical**: the worklet's `process()` callback is invoked with **exactly 128 input samples per call** (hard browser constant). 128 is not divisible by 3, and 48→16kHz decimation is 3:1. You must accumulate samples across callbacks. Use two ring buffers:

   ```js
   class PcmWorklet extends AudioWorkletProcessor {
     constructor() {
       super();
       this.inBuf = new Float32Array(0);   // 48kHz input accumulator
       this.outBuf = new Int16Array(0);    // 16kHz output accumulator
     }
     process(inputs) {
       const input = inputs[0]?.[0];
       if (!input) return true;

       // Append to 48kHz input buffer
       const merged = new Float32Array(this.inBuf.length + input.length);
       merged.set(this.inBuf); merged.set(input, this.inBuf.length);

       // Drain in groups of 3 samples -> 1 output sample (simple average)
       const usable = Math.floor(merged.length / 3) * 3;
       const decimated = new Int16Array(usable / 3);
       for (let i = 0, j = 0; i < usable; i += 3, j++) {
         const avg = (merged[i] + merged[i+1] + merged[i+2]) / 3;
         const clamped = Math.max(-1, Math.min(1, avg));
         decimated[j] = (clamped * 0x7FFF) | 0;
       }
       this.inBuf = merged.slice(usable);

       // Append to 16kHz output buffer
       const mergedOut = new Int16Array(this.outBuf.length + decimated.length);
       mergedOut.set(this.outBuf); mergedOut.set(decimated, this.outBuf.length);

       // Emit in frames of exactly 640 samples (40ms)
       const FRAME = 640;
       let offset = 0;
       while (mergedOut.length - offset >= FRAME) {
         const frame = mergedOut.slice(offset, offset + FRAME);
         this.port.postMessage(frame.buffer, [frame.buffer]);
         offset += FRAME;
       }
       this.outBuf = mergedOut.slice(offset);
       return true;
     }
   }
   registerProcessor("pcm-worklet", PcmWorklet);
   ```

   - Must be **served as a static file** under `/pcm-worklet.js` (not bundled through webpack). Next.js serves files from `public/` at the root path.

2. **Media acquisition is done in the page component, not in `startAudioCapture`.** This decouples mic/video permission from diagnostic pipeline startup so the same `MediaStream` can be shared with WebRTC later (PRD 7) without triggering a second permission prompt.

   **`frontend/lib/audioCapture.ts`**:
   ```ts
   export function startAudioCapture(opts: {
     stream: MediaStream;       // already-acquired MediaStream (audio track required)
     role: "patient" | "clinician";
     wsUrl: string;
   }): Promise<{ stop: () => void }>;
   ```
   - Creates `new AudioContext({ sampleRate: 48000 })`; **assert `ctx.sampleRate === 48000`**, throw if not (fail loud rather than silently wrong).
   - `await ctx.audioWorklet.addModule('/pcm-worklet.js')`.
   - `const src = ctx.createMediaStreamSource(opts.stream)`; `const node = new AudioWorkletNode(ctx, 'pcm-worklet')`; connect `src → node`. Do **not** connect `node → ctx.destination` (prevents echo).
   - Open `WebSocket(wsUrl)` with `ws.binaryType = "arraybuffer"`.
   - On `node.port.onmessage = (e) => { if (ws.readyState === 1) ws.send(e.data); }`.
   - `.stop()` closes the WS, calls `node.disconnect()`, and `ctx.close()`. Does **not** stop mic tracks — the page owns the MediaStream lifecycle.

3. **`backend/app/ws/audio.py`**:
   - `@router.websocket("/ws/audio/{role}/{room_id}")`.
   - Validate `role in {"patient", "clinician"}` and that the room exists; else `await ws.close(code=4404)`.
   - On connect: if `room.audio_distributors.get(role)` is None, create an `AudioDistributor` (defined in PRD 5; for now, just a queue). Push each received frame into it.
   - Accept binary frames in a loop, assert `len(data) == 1280` (640 samples × 2 bytes PCM16). Increment a frame counter.
   - On connect: `print(f"[audio] {role}@{room_id} connected")`; every 100 frames: `print(f"[audio] {role}@{room_id} {n_frames*40}ms ingested")`.
   - On disconnect (`WebSocketDisconnect`): clean up the distributor subscription if this was the last writer.

4. **`frontend/app/patient/[room]/page.tsx`**:
   - State machine: `idle → requesting → live → ended`.
   - On "Join consultation" click: `navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })` (video added in PRD 7 — for now audio-only).
   - Pass the returned `MediaStream` to `startAudioCapture({ stream, role: "patient", wsUrl: ... })`.
   - Show a "Live" indicator and mic level meter (tap the stream with a second `AnalyserNode` for RMS — do this independently of the worklet).
   - On "Leave": call the returned `.stop()`, stop all tracks on the MediaStream (`stream.getTracks().forEach(t => t.stop())`), set state to `ended`.

**Implementation notes**:
- Browser mic permission must be requested in a user gesture handler. Never auto-start on mount.
- `AudioContext({ sampleRate: 48000 })` is a hint, not a contract. In practice Chrome/Firefox/Safari all honour it; still, assert and throw. A mismatch = silent wrong downsampling.
- **Never use `ScriptProcessorNode`.** It runs on the main thread and will glitch under load.
- **Echo cancellation trade-off**: `echoCancellation: true` helps the WebRTC call but slightly filters acoustic detail that biomarkers consume. For this hackathon, leave AEC **on** — the call-quality win outweighs the biomarker fidelity loss, and judges care more about the live demo working than marginal biomarker accuracy. Note this as a production deployment consideration (a real clinical deployment would use a dedicated diagnostic mic with AEC off).
- Binary WebSocket reads in Python: `await ws.receive_bytes()` inside `try/except WebSocketDisconnect`.

**Acceptance test**:
- Click "Start telehealth" → patient page → "Join consultation" button → allow mic → mic level meter moves.
- Backend console prints `[audio] patient@{room} connected` then `[audio] patient@{room} 40ms ingested`, `80ms ingested`, etc.
- Every frame received is exactly 1280 bytes (assert in backend).
- Calling `.stop()` and re-joining works without reloading the page.

---

## PRD 4 — Speechmatics RT integration + live transcript to dashboard

**Goal**: Patient + clinician audio both transcribed via Speechmatics medical RT. Events flow through EventBus to a dashboard WebSocket. Clinician page shows a live transcript lane.

**Prereqs**: PRD 3.

**Deliverables**:

1. **`backend/app/services/speechmatics.py`**:
   - `class SpeechmaticsService`: manages one RT connection **per role per room** (so a room has up to 2 connections).
   - `async def start(room: Room, role: str, audio_queue: asyncio.Queue[bytes])`: opens Speechmatics RT client using `speechmatics-rt` SDK, config: `language="en"`, `domain="medical"`, `operating_point="enhanced"`, enable `diarization="speaker"` (defensive — even though we're already role-tagged per stream, diarization inside patient audio still helps if a family member speaks), `max_delay=1.0`, partial transcripts enabled.
   - **Timestamping**: ignore Speechmatics' own relative timestamps. Stamp every outgoing event with `room.now_ms()` **at the moment the event is received from the SM SDK**. This keeps all event types (STT, biomarkers, flags) on a single unified timeline with no drift bookkeeping. Acceptable tolerance for a sub-10-minute demo; worth noting as a future-work item.
   - On each partial: publish `transcript_partial` event to `room.eventbus` with `ts_ms = room.now_ms()`.
   - On each final: publish `transcript_final` with `start_ms` = `room.now_ms()` at the moment the final arrives (or compute as `end_ms - (sm_duration_sec * 1000)` if you want a rough start), `end_ms = room.now_ms()`, `utterance_id = nanoid(10)`, append the dict to `room.transcripts`.
   - Pull audio from `audio_queue.get()` in a loop and forward to SM client.
   - Handle reconnection: if SM drops, log and reconnect once, then give up and publish an error event.

2. **`backend/app/ws/audio.py` update**: on connect, kick off `SpeechmaticsService.start(...)` as a background task feeding from the room's audio queue. On disconnect, cancel the task.

3. **`backend/app/ws/dashboard.py`**:
   - `@router.websocket("/ws/dashboard/{room_id}")`.
   - Subscribe to `room.eventbus`, replay last 100 buffered events, then stream new ones.
   - Expect no inbound messages (one-way push); ignore any received.

4. **`frontend/lib/dashboardSocket.ts`**:
   - `useDashboardEvents(roomId: string)` React hook returning `DashboardEvent[]` (append-only, capped at 1000 for memory).
   - Uses `useEffect` to connect, `useState` for events, auto-reconnect with exponential backoff (500ms → 8s).

5. **`frontend/components/TranscriptLane.tsx`**:
   - Props: `events: DashboardEvent[]`.
   - Filter to `transcript_partial` (latest only per role) and `transcript_final`.
   - Two-column layout: patient | clinician, finals stacked chronologically, partial shown as greyed italic at the bottom of its column.
   - Auto-scroll to bottom.

6. **`frontend/app/clinician/[room]/page.tsx`**:
   - Use the hook, render `<TranscriptLane events={events} />` in the left half.
   - Placeholder right half: "Biomarkers coming next PRD".

**Implementation notes**:
- Speechmatics `operating_point="enhanced"` may have higher latency than `standard`; start with `enhanced` (we want medical accuracy) and measure. If demo feels sluggish, fall back to `standard`.
- Keep the Speechmatics SDK's audio feed method behind a thin wrapper so you can swap if the API shape differs from the examples in `thymia-ai/voice-ai-hack-lnd-26/examples/00_speechmatics_transcribe`. Check that example first and mirror its pattern exactly.
- Clinician audio also goes to Speechmatics but **not** to Thymia (see next PRD).

**Acceptance test**:
- Open `/patient/{room}` on one device, `/clinician/{room}` (dashboard view) on another.
- Speak into patient mic: clinician page transcript updates within ~1s.
- Speak into clinician mic (or same browser with clinician role joined separately): shows in clinician column.
- Backend logs show both RT sessions active.

---

## PRD 5 — Thymia Sentinel integration + biomarker events

**Goal**: Patient audio (and only patient audio) is forked to Thymia Sentinel. Biomarker progress, biomarker results, and psyche updates flow into EventBus.

**Prereqs**: PRD 4.

**Deliverables**:

1. **`backend/app/services/thymia.py`**:

   **Step 0 — Payload discovery (do this FIRST).** The exact shapes of `on_progress` and `on_policy_result` payloads are not fully documented in the quickstart and may differ between SDK versions. Before writing the mapping to our event schema, run a throwaway script (or add temporary `print(json.dumps(payload, default=str))` calls inside each handler) that logs **the complete raw payload** for one session containing at least 60 seconds of emotional speech. Inspect the actual keys for:
   - How are `helios`, `apollo`, `psyche` results distinguished? (Likely a `model` or `biomarker` key on each score.)
   - Where do Psyche's ~5s affect updates arrive — inside `on_progress`, `on_policy_result`, or a separate handler?
   - What is the shape of the progress payload (`speech_seconds` / `trigger_seconds`)?

   Fill in the mapping to our `DashboardEvent` schema based on what the SDK actually emits. Do not guess — the events drive every downstream consumer (dashboard, concordance engine, report), and wrong field names break everything silently.

   **If the discovered payload shape differs meaningfully from the `DashboardEvent` union defined in the "Shared event schema" section at the top of this document, STOP.** Update the schema in both places before continuing:
   - `backend/app/models.py` (Pydantic union)
   - `frontend/lib/types.ts` (TypeScript union)

   Keep field names identical across both. Only then proceed to PRD 6. The schema is load-bearing — every subsequent PRD (concordance engine, dashboard UI, report generation) depends on these exact field names, and a drift here cascades into silent bugs that are very expensive to debug at 2am.

   **Step 1 — Service class**:
   - `class ThymiaService`: one `SentinelClient` per room, keyed on `room_id`.
   - `async def start(room: Room, audio_queue: asyncio.Queue[bytes])`:
     - Initialise `SentinelClient(user_label=f"room-{room.room_id}", policies=["wellbeing-awareness"], biomarkers=["helios", "apollo", "psyche"])`.
     - Register handlers (shapes confirmed via Step 0):
       - `on_progress` → publish `biomarker_progress` per biomarker in the update, stamped with `room.now_ms()`.
       - `on_policy_result` → for each biomarker score in the result: publish `biomarker_result` (stamped with `room.now_ms()`), append `{model, name, value, ts_ms}` to `room.biomarker_history`. If the SDK routes Psyche updates here too, emit `psyche_update` instead.
     - If the SDK exposes a separate psyche handler (discovered in Step 0), register it and emit `psyche_update` from there.
     - `await sentinel.connect()`.
     - Loop: pull from `audio_queue`, call `await sentinel.send_user_audio(chunk)`. If Sentinel expects a larger buffer size than our 1280-byte frames, accumulate before sending — discover in Step 0.
   - Expose `async def send_transcript(text: str)` → calls `sentinel.send_user_transcript(text)`. Speechmatics service calls this when a patient `transcript_final` is emitted. Guard against `None` / not-yet-connected.

2. **Audio forking**: modify `backend/app/ws/audio.py` so the patient audio queue has **two consumers**. Simplest approach: instead of a single queue per role, make `room.audio_distributors[role]` a fan-out utility where services can subscribe and each subscriber gets a copy. Use an `asyncio.Queue` per subscriber populated by a single broadcaster task.

   Implementation sketch:
   ```python
   class AudioDistributor:
       def __init__(self):
           self._subscribers: list[asyncio.Queue] = []
       def subscribe(self) -> asyncio.Queue:
           q = asyncio.Queue(maxsize=200)
           self._subscribers.append(q)
           return q
       def publish(self, chunk: bytes):
           for q in self._subscribers:
               try: q.put_nowait(chunk)
               except asyncio.QueueFull:
                   try: q.get_nowait()
                   except: pass
                   try: q.put_nowait(chunk)
                   except: pass
   ```

3. **Cross-wire transcripts → Thymia**: in `SpeechmaticsService`, when emitting `transcript_final` for role == "patient", also call `room.thymia_service.send_transcript(text)`.

4. **`frontend/components/BiomarkerLane.tsx`**:
   - Props: `events: DashboardEvent[]`.
   - Render three sections: **Psyche** (7 bars, updates ~5s), **Helios** (5 bars), **Apollo** (core symptoms: low_mood, low_energy, anhedonia, sleep_issues, nervousness, worry — pick 6 to show).
   - Each bar: value 0–1 as filled width, label, current value rounded to 2 dp. If biomarker has `biomarker_progress` but no `biomarker_result` yet, show progress ring with `speech_seconds / trigger_seconds` percentage.
   - Colour: green 0–0.4, amber 0.4–0.7, red >0.7.

5. **`frontend/app/clinician/[room]/page.tsx`**: place `<BiomarkerLane />` in the right half.

**Implementation notes**:
- Sentinel expects **PCM16 @ 16kHz** — our canonical format. No conversion needed.
- The `thymia-sentinel-integrations` repo v1.1.0 is the reference; if its API surface differs from this spec, follow the repo and adjust.
- Do **not** send clinician audio to Sentinel. Biomarker pollution is the single biggest risk.
- Psyche lags ~5s, Helios/Apollo need 15–60s of speech — the progress ring is important UX so the demo doesn't look broken for the first minute.

**Acceptance test**:
- Join patient page, speak for 20s about something neutral. Dashboard shows psyche bars updating every ~5s.
- Speak for 60s with emotional content ("I'm really struggling with sleep and I feel so tired"). Dashboard shows Helios/Apollo bars filled with plausible values.
- Clinician speaking into clinician mic does **not** change biomarker bars (verify with server logs that only patient bytes go to Thymia).

---

## PRD 6 — Concordance engine + Claude flag glossing

**Goal**: Detect minimization-biomarker concordance gaps and publish `concordance_flag` events with Claude-written clinical gloss lines.

**Prereqs**: PRD 5.

**Deliverables**:

1. **`backend/app/services/concordance.py`**:

   ```python
   MINIMIZATION_PATTERNS = [
       r"\bi['’]?m fine\b", r"\bi am fine\b",
       r"\bi['’]?m okay\b", r"\bi am okay\b", r"\bdoing okay\b",
       r"\bi['’]?m good\b", r"\bi am good\b", r"\bdoing (good|well)\b",
       r"\ball good\b", r"\ball right\b", r"\balright\b",
       r"\bno problems?\b", r"\bnothing much\b",
       r"\bcould be worse\b", r"\bcan't complain\b",
       r"\bsleep(ing)? (fine|well|okay|ok)\b",
       r"\bmood is (fine|good|okay|ok)\b",
       r"\bfeel(ing)? (fine|good|okay|ok)\b",
   ]

   DISTRESS_THRESHOLDS = {
       "helios.distress": 0.65,
       "helios.stress": 0.7,
       "helios.fatigue": 0.7,
       "apollo.low_mood": 0.65,
       "apollo.low_energy": 0.65,
       "apollo.anhedonia": 0.65,
       "apollo.sleep_issues": 0.65,
       "apollo.nervousness": 0.7,
   }

   LOOKBACK_MS = 60_000  # 60s
   ```

   - `class ConcordanceEngine`:
     - Subscribes to `room.eventbus` using the regular `subscribe()` method (returns an `asyncio.Queue`). Consumes events in a background task; ignores non-transcript events.
     - On `transcript_final` with `role == "patient"`, check each minimization pattern. If matched, look back at `room.biomarker_history` for any reading within `LOOKBACK_MS` that exceeds its threshold. If ≥1 biomarker breaches, raise a flag.
     - Evidence object: the utterance, matched phrase, the breaching biomarkers (name + value + ts).
     - Call `ClaudeService.gloss_flag(evidence)` to get the clinical line.
     - Publish `concordance_flag` to EventBus with `flag_id = nanoid(10)` and `ts_ms = room.now_ms()`.
     - Append to `room.flags`.

2. **`backend/app/services/claude.py`**:

   ```python
   GLOSS_SYSTEM = """You are a clinical documentation assistant helping a GP note concordance gaps between a patient's self-report and their voice biomarkers. You do NOT diagnose. You state the gap objectively in one sentence suitable for a UK GP clinical note. Use neutral, non-accusatory language. Never suggest the patient is lying."""

   GLOSS_USER_TEMPLATE = """Patient just said: "{utterance}"
   Matched minimization phrase: "{phrase}"
   Voice biomarkers breaching threshold in the preceding 60 seconds:
   {biomarker_lines}
   Write one sentence (max 30 words) for the GP's note."""
   ```

   - `async def gloss_flag(evidence) -> str`: calls `claude-haiku-4-5-20251001`, max_tokens=100, temperature=0.3. Returns stripped text.
   - Timeout 2s; on failure return a deterministic fallback: `f"Patient self-reports positively but biomarkers indicate elevated {top_marker} ({top_value:.2f})."`

3. **Wire up**: instantiate `ConcordanceEngine` per room lazily — when the patient audio WebSocket first connects (in `ws/audio.py`), if `room.concordance_engine is None`, construct it and assign to `room.concordance_engine`. The engine starts its own background consumer task inside its `__init__`.

4. **`frontend/components/FlagCard.tsx`**:
   - Props: a `concordance_flag` event.
   - Renders a card with: red left border, timestamp, quoted utterance (italic), matched phrase highlighted, list of biomarker evidence (name + value bars), bold Claude gloss line at the bottom.

5. **`frontend/app/clinician/[room]/page.tsx`**: add a third column or a floating panel showing flag cards, newest at top. When a new flag arrives, flash the whole dashboard border red for 600ms.

**Implementation notes**:
- Keep regex matching case-insensitive. Compile once at module load.
- The LOOKBACK window slides; you look at biomarker_history filtered by `ts_ms > utterance.start_ms - LOOKBACK_MS AND ts_ms <= utterance.end_ms + 5_000` (allow up to 5s after utterance for biomarkers that settled just after).
- De-duplicate: if the same utterance matches multiple minimization phrases, flag once with the first match. If the same minimization phrase repeats within 10s, skip (avoid flag spam).
- Claude call is on the hot path. Haiku at temp 0.3 is ~800ms typical. Acceptable.
- If the Sentinel `wellbeing-awareness` policy already emits its own concordance flags in `on_policy_result`, **do not** double-flag — prefer our engine (we want full control of evidence and gloss). Log Sentinel's own concordance signals but don't publish them as `concordance_flag` events.

**Acceptance test**:
- Patient mic: speak for 60s with a low, flat, sad tone saying things like "ugh, I haven't been sleeping, everything feels pointless."
- Biomarkers spike for low_mood / sleep_issues.
- Then say: "But I'm fine, doing okay."
- Within ~2s, a red flag card appears in the clinician dashboard with the quoted utterance, matched phrase "i'm fine", the biomarker evidence, and a Claude gloss line like "Patient self-reports well-being but voice biomarkers show sustained low mood (0.78) and elevated sleep disturbance (0.71) during the preceding minute."

---

## PRD 7 — WebRTC video call (signaling + peer tiles)

**Goal**: Patient and clinician can see and hear each other via WebRTC, independently of the diagnostic audio pipeline. Works cross-device on the same network.

**Prereqs**: PRD 3.

**Deliverables**:

1. **`backend/app/ws/signaling.py`**:
   - `@router.websocket("/ws/signaling/{room_id}")`.
   - Maintain `room.peers: dict[peer_id, WebSocket]` (peer_id assigned on connect).
   - Protocol: client sends `{"type": "hello"}` on connect; server replies `{"type": "welcome", "peer_id": "...", "peers": [existing_peer_ids]}`.
   - Relay: any `{"type": "signal", "to": peer_id, "data": ...}` is forwarded to the target peer as `{"type": "signal", "from": sender_id, "data": ...}`.
   - On disconnect, broadcast `{"type": "peer-left", "peer_id": ...}`.
   - Publish `call_status` events to the room's EventBus when peer count changes.

2. **`frontend/lib/webrtc.ts`**:
   - `class PeerManager`:
     - `constructor(opts: { roomId: string, wsUrl: string, localStream: MediaStream, onRemoteStream: (peerId, stream) => void, onPeerLeft: (peerId) => void })`.
     - Connects to signaling WS. On `welcome`, creates a `SimplePeer({initiator: true})` for each existing peer. On `signal` message, routes to the right peer. For inbound `hello`, creates a non-initiator peer and waits for their signal.
     - Each `SimplePeer` uses `localStream` and relays its signal data through the signaling WS.
     - Exposes `close()` to tear down.

3. **`frontend/components/VideoTile.tsx`**:
   - Props: `stream: MediaStream | null, label: string, muted?: boolean`.
   - Renders `<video autoPlay playsInline muted={muted}>` with the stream attached via `ref`.

4. **Integrate into patient and clinician pages**:
   - The page is the single owner of the `MediaStream` lifecycle. On "Join call", the page calls `getUserMedia({ audio: {...}, video: true })` **once**, then passes the resulting stream to both `startAudioCapture({ stream, role, wsUrl })` (diagnostic pipeline) and `new PeerManager({ localStream: stream, ... })` (WebRTC). This avoids a double permission prompt and keeps the two subsystems decoupled.
   - Update PRD 3's page code accordingly — the patient page now requests `video: true` when it's the telehealth page (not the in-person page, which stays audio-only in PRD 9).
   - Patient page: 1 local tile (self, muted) + up to 1 remote tile (clinician, not muted), plus the "Live diagnostic capture" indicator.
   - Clinician page: 1 local tile (self, muted, small corner) + 1 remote tile (patient, not muted, larger), plus the full dashboard.
   - On page unmount or "Leave" click: close `PeerManager`, stop diagnostic capture, then `stream.getTracks().forEach(t => t.stop())`.

**Implementation notes**:
- `simple-peer` bundles STUN by default; for same-network demo that's enough. For cross-network, add TURN later — not needed for hackathon demo.
- **Echo**: if both laptops are in the same room with speakers on, you'll get feedback. Put the remote tile `muted` on the clinician side during in-room demos OR use headphones.
- The WebRTC `getUserMedia` call is **the same** `MediaStream` used for the diagnostic WebSocket. You do not need two `getUserMedia` calls — that would also create two mic permission prompts and UX friction. Share the stream.
- Signaling ordering matters: when a second peer joins, the first peer must initiate (`initiator: true`); the second is the answerer. Our `hello`/`welcome` flow handles this via the `peers` list.
- Don't use `peerjs` — heavier and less predictable than `simple-peer`.

**Acceptance test**:
- Open `/clinician/{room}` on laptop A (join call).
- Open `/patient/{room}` on laptop B (join call).
- Both see each other's video tile. Audio works (use headphones).
- Backend logs `call_status` events showing peer count 0 → 1 → 2.
- Verify diagnostic pipeline still works: patient speaks → transcripts and biomarkers on clinician dashboard.

---

## PRD 8 — Dashboard layout polish, concordance meter, connection health

**Goal**: Clinician dashboard looks like a real clinical tool, not a debug UI. Includes an overall "concordance meter", flag timeline, and connection-health indicators.

**Prereqs**: PRD 5, PRD 6, PRD 7.

**Deliverables**:

1. **`frontend/components/Dashboard.tsx`**:
   - Props: `{ events: DashboardEvent[]; mode: "telehealth" | "inperson"; localStream?: MediaStream; remoteStream?: MediaStream | null; onEndConsultation: () => void; }`.
   - Layout: 3 columns on desktop (`grid-template-columns: 3fr 4fr 3fr`).
     - **Left (30%)**:
       - If `mode === "telehealth"`: patient video tile at top, clinician self-view in corner, call status pill underneath.
       - If `mode === "inperson"`: large "● Recording" indicator with pulsing red dot, elapsed session time, prominent mic level meter. No video.
     - **Centre (40%)**: `<TranscriptLane />`.
     - **Right (30%)**: `<BiomarkerLane />` top, `<ConcordanceMeter />` middle, flag card stack bottom.
   - On mobile / narrow viewport: stack vertically (left column → centre → right).

2. **`frontend/components/ConcordanceMeter.tsx`**:
   - A single prominent gauge.
   - Compute: `score = max(biomarker_value / threshold)` over the last 60s of patient biomarkers (from the events stream). If score > 1.0, amber; > 1.3, red.
   - Additionally overlay a flag count pill: "3 flags this session".
   - Animate value changes with CSS transitions.

3. **Connection-health indicators**: small pills at the top of the dashboard:
   - Mic: green if audio WS connected.
   - STT: green if last `transcript_*` event within 10s of speech, amber otherwise.
   - Biomarkers: green if any `biomarker_progress` or `psyche_update` in last 15s, amber otherwise.
   - Peer: green if `call_status.status === "connected"`.

4. **End-session button**: top-right, "End consultation". Triggers `POST /api/report/{room}` (stub returns `{ok: true}` for now — next PRD) and routes to `/report/{room}`.

**Implementation notes**:
- Use CSS `grid-template-columns: 3fr 4fr 3fr` on desktop; `media-query (max-width: 900px)` collapses to single column.
- Colours: Tailwind `emerald-500`, `amber-500`, `rose-500` on a `slate-950` background for clinical-looking dark UI.
- Keep total information density high but readable. No decorative icons. Numbers and bars only.

**Acceptance test**:
- Full flow: create room → both parties join → patient speaks emotionally → dashboard reflects everything in its proper columns.
- Concordance meter rises as biomarkers spike.
- Disconnect mic (stop tracks via dev tools) — mic pill goes grey/red within ~3s.

---

## PRD 9 — In-person mode (single-laptop layout)

**Goal**: A single-tab layout for in-person GP consultations. Patient mic is captured on the same device; clinician's screen shows the live dashboard directly.

**Prereqs**: PRD 8.

**Deliverables**:

1. **`frontend/app/inperson/[room]/page.tsx`**:
   - On "Start consultation" button click:
     - `getUserMedia({ audio: {...}, video: false })` — **audio only**, no video prompt.
     - `startAudioCapture({ stream, role: "patient", wsUrl: ... })` — single mic, tagged as patient.
     - **No WebRTC.** No `PeerManager`.
     - Render `<Dashboard mode="inperson" events={events} onEndConsultation={...} />`. The Dashboard's `inperson` mode (from PRD 8) already handles the left-column layout (Recording indicator + elapsed time + mic level) — no new component needed.
   - Optionally: a "Note" field for the GP to type thoughts that get attached to the report metadata.

2. **Landing page update**: the "Start in-person" tile should explain the mode ("Single laptop. Mic captures patient. You see the dashboard.") and create a room + route to `/inperson/[room]`.

3. **Backend note**: no changes needed — the existing `/ws/audio/patient/{room}` endpoint handles this identically.

**Implementation notes**:
- The GP is supposed to not be staring at the screen — put the dashboard on a secondary monitor or let them glance. Keep flag cards very visually prominent (large, high-contrast) so peripheral vision catches them.
- "Elapsed time" is nice — pulls from room clock via a first dashboard event carrying `created_at_ms`, or refetch `GET /api/rooms/{id}`.

**Acceptance test**:
- Open `/inperson/{room}` on a single laptop.
- Speak emotional patient-style monologue.
- Dashboard populates: transcripts, biomarkers, flags. No video tiles. No peer connection.
- "End consultation" button routes to `/report/{room}`.

---

## PRD 10 — End-of-consult report (Claude synthesis + printable page)

**Goal**: After a session ends, generate a structured one-page clinical report with transcript excerpts, biomarker trajectory, flagged moments, and suggested follow-up. Printable.

**Prereqs**: PRD 6.

**Deliverables**:

1. **`backend/app/api/report.py`**:
   - `POST /api/report/{room_id}` — generates and stores the report.
   - `GET /api/report/{room_id}` — returns the stored report JSON.
   - Implementation: call `ClaudeService.generate_report(room)` which uses `claude-sonnet-4-6`.

2. **`backend/app/services/claude.py` addition**:

   ```python
   REPORT_SYSTEM = """You write concise UK GP consultation summaries that highlight concordance between patient self-report and voice biomarker data. You are not a diagnostic tool. You flag patterns worth a clinician's attention. Use clinical register, neutral language, British English. Never speculate beyond the evidence."""

   REPORT_USER_TEMPLATE = """Session duration: {duration_sec} seconds.

   Patient utterances (role=patient only, abridged):
   {patient_transcript}

   Biomarker trajectory (key values over time):
   {biomarker_summary}

   Concordance flags raised during session ({n_flags}):
   {flags_detail}

   Produce a markdown report with these sections exactly:

   ## Summary
   (2-3 sentence narrative of the session's key clinical signal)

   ## Flagged concordance moments
   (For each flag: timestamp, quoted utterance, biomarker evidence, one-line clinical note)

   ## Biomarker trajectory
   (Prose description of how key biomarkers moved across the session)

   ## Suggested follow-up
   (Non-diagnostic suggestions: e.g. "Consider PHQ-9 at next visit", "Sleep history worth exploring". Max 4 bullets.)

   Keep total length ≤ 400 words. Reference specific timestamps."""
   ```

   - `biomarker_summary`: downsample biomarker_history to every ~15s, report (name, value, ts) triples. Cap at 30 rows.
   - `patient_transcript`: full finalized utterances, timestamped.
   - `flags_detail`: each flag's utterance + gloss + top biomarker evidence.

3. **Store the report** in `room.report: dict | None` with fields `{markdown: str, generated_at_ms: int, duration_sec: int}`. Also persist `flags`, `transcripts`, `biomarker_history` snapshots so the report page can render richer context.

4. **`frontend/app/report/[room]/page.tsx`**:
   - On mount: `POST /api/report/{room}`, await, then `GET` to fetch.
   - Render the markdown with `react-markdown` (or your preferred minimal renderer — could even be a hand-rolled line-by-line splitter since the schema is fixed).
   - Add a header with session meta (date, duration, flag count).
   - Below the report, render a clickable flag timeline: each flag as a row, click expands audio (not yet implemented — stub) and evidence.
   - Print CSS: `@media print { ... }` hides nav, enforces A4.
   - "Print / Save as PDF" button uses `window.print()`.

5. **Landing from other pages**: clinician and in-person dashboards' "End consultation" button already routes here (from PRD 8).

**Implementation notes**:
- Sonnet latency ~5s for this size. Acceptable — show a skeleton while loading.
- `react-markdown` is fine; don't need heavy MDX.
- For the flag timeline, audio clip playback is a future feature. Flag says "play audio snippet (coming soon)" if clicked.
- The Claude prompt must include "British English" and "non-diagnostic" explicitly. The hackathon judges will read this output; overclaiming tanks credibility.

**Acceptance test**:
- Run a 2-minute session. Click "End consultation".
- Report page loads within ~8s, shows four sections as specified, references real timestamps from the session.
- Print preview produces a clean one-page A4 output.

---

## PRD 11 — Codec comparison demo page (/compare)

**Goal**: A standalone demo page that runs the same patient audio clip through two paths — raw PCM and Opus-compressed-then-decoded — and shows side-by-side Thymia biomarker output. This is the "telehealth mode" pitch slide made interactive.

**Prereqs**: PRD 5.

**Deliverables**:

1. **Sample audio**: include `backend/app/static/samples/patient_sample.wav` — a 60–90s emotional patient monologue. (Generate via TTS before the hackathon — e.g., ElevenLabs or a team member reading a script; 16kHz mono WAV.)

2. **Pre-compute at server startup (core requirement)**. Running Thymia on 60–90s of audio takes 60–90 seconds because biomarkers need that much speech to trigger. On-demand computation = the user clicks "Run comparison" and waits a full minute. Unacceptable for a demo.

   Instead, on FastAPI startup (`@app.on_event("startup")`):
   - Load the bundled WAV.
   - Spawn two concurrent tasks:
     - Task A: feed raw PCM16 @ 16kHz to a Thymia Sentinel session (`user_label=f"compare-raw-{nanoid(4)}"`).
     - Task B: pipe PCM → Opus encode @ 24kbps → decode → feed to a second Sentinel session (`user_label=f"compare-opus-{nanoid(4)}"`).
   - Await both; collect the final `biomarker_result` values from each path.
   - Cache the result dict at module scope: `COMPARE_CACHE = {"raw": {...}, "opus": {...}, "delta": {...}, "generated_at_ms": ...}`.
   - If this startup job fails, log loudly; the `/compare` page falls back to a static placeholder with a warning banner.

3. **`backend/app/api/compare.py`**:
   - `GET /api/compare` — returns `COMPARE_CACHE` (or 503 if not yet ready). Instant.
   - `POST /api/compare/recompute` (admin/dev only) — re-runs the pre-compute job. Useful if you swap the sample.

4. **Opus encode/decode utility**: use `ffmpeg` subprocess (already a documented prereq in PRD 12):
   ```
   ffmpeg -f s16le -ar 16000 -ac 1 -i input.pcm -c:a libopus -b:a 24k -f ogg - | \
   ffmpeg -i - -f s16le -ar 16000 -ac 1 output.pcm
   ```
   Run via `asyncio.create_subprocess_exec`. Do not use `opuslib` — ffmpeg is simpler and the team will already have it installed.

5. **`frontend/app/compare/page.tsx`**:
   - On mount, `GET /api/compare`. If 503, show "Comparison still computing…" with a retry button that polls every 2s.
   - Play the sample audio in a `<audio>` element with controls.
   - Two columns labelled "Raw 16kHz PCM (our pipeline)" vs "Opus-compressed 24kbps (standard VoIP)".
   - Each column shows the same biomarker bars as the live dashboard, but static/final values from the cached response.
   - Below: explanation paragraph — "Standard telehealth VoIP uses Opus at 24–32 kbps. Fine for intelligibility; lossy for paralinguistic signals that biomarkers depend on."

**Implementation notes**:
- Two Sentinel connections running concurrently. The Sentinel API might not love two sessions for the same `user_label` — use distinct labels like `compare-raw-{nonce}` and `compare-opus-{nonce}`.
- This endpoint is **batch**, not streaming. Feed the entire audio, then wait for terminal policy results. Use an explicit `await sentinel.close()` to flush.
- If the Opus path's biomarkers don't collapse as dramatically as expected, try lower bitrate (16kbps) — most real-world telehealth negotiates aggressively under poor network conditions, so this is realistic.
- Consider running the comparison server-side at startup on the packaged sample and caching the results. The demo then feels instant.

**Acceptance test**:
- Start the backend. Server logs show "Pre-computing codec comparison..." during startup, followed by "Compare cache ready" within ~90s.
- Navigate to `/compare`. Both columns populate **immediately** (data served from cache, no spinner beyond the initial fetch).
- Raw column shows meaningful biomarker values (e.g., low_mood 0.7+). Opus column shows degraded or collapsed values (0.2–0.4 range or fewer triggered biomarkers). Delta column highlights the gap.
- Visually compelling side-by-side.
- If you restart the server during the demo, the `/compare` page correctly shows "Still computing…" and auto-updates when ready.

---

## PRD 12 — README, demo script, polish

**Goal**: Everything a judge or external dev needs to run and understand the project in 5 minutes.

**Prereqs**: everything above working.

**Deliverables**:

1. **`README.md` (root)**:
   - 2-paragraph pitch.
   - Architecture diagram (ASCII or simple SVG in `/docs`).
   - Setup steps:
     - Prereqs: Python 3.11, Node 20+, pnpm, uv, ffmpeg.
     - `cp backend/.env.example backend/.env && <fill in keys>`.
     - `cd backend && uv sync && uv run uvicorn app.main:app`.
     - `cd frontend && pnpm i && pnpm dev`.
   - How to demo:
     - Telehealth: 2 devices, both hit landing, click "Start telehealth" on one, share room ID.
     - In-person: 1 laptop, click "Start in-person".
     - Codec demo: `/compare`.
   - Known limitations (ephemeral rooms, in-memory state, biomarker latency, no HIPAA, etc.).
   - Credits: Speechmatics, Thymia, Anthropic.

2. **`DEMO_SCRIPT.md`**:
   - 8-minute demo walkthrough matching the pitch flow discussed.
   - Exact phrases to say ("I'm fine, sleeping well") for triggering flags.
   - Fallback plan: if WebRTC/wifi fails on stage, switch to in-person mode.

3. **Linting, formatting**: `ruff check .` passes on backend, `pnpm lint` passes on frontend. Remove debug prints that aren't useful.

4. **Error UX**: any failed WebSocket connection should display a red banner at the top of the affected page with a retry button. Don't swallow errors silently.

5. **Env sanity**: landing page calls `GET /health` on mount and warns if backend is unreachable.

**Acceptance test**:
- A teammate who hasn't seen the code clones fresh, follows README, has the demo running in under 10 minutes.
- Dry-run the demo script end-to-end. Nothing unexpected happens.

---

## Critical risks & pre-hackathon prep

Before the hack starts (or in the first hour), do these:

1. **Verify Thymia Sentinel quickstart works** with your API key. Run `examples/01_sentinel_basics` and `examples/03_clinical_voice_monitor` from `thymia-ai/voice-ai-hack-lnd-26`. Confirm biomarker events arrive and the event shapes match what PRD 5 assumes. If shapes differ, update PRD 5's schema.

2. **Verify Speechmatics RT medical domain works** with your key. Run `examples/00_speechmatics_transcribe`. Confirm the config knobs match PRD 4 (`domain="medical"`, `operating_point="enhanced"`).

3. **Pre-record a 60–90s emotional patient monologue** for the `/compare` page and fallback demos. TTS or a team member reading a prepared script. Test that Thymia actually returns meaningful biomarkers on it — if a voice doesn't trigger biomarkers, rewrite the script/voice.

4. **Test `getUserMedia` + AudioWorklet on the actual demo laptops** at the venue. Some venue wifi captive portals break WebSocket upgrades; have a mobile hotspot ready.

5. **Headphones for both demo machines.** Do not do live video call with speakers on.

## Post-hackathon ideas (not for build, for pitch)

- Speechmatics speaker diarization as a second defense layer — gate Thymia on `speaker_label=S2` within patient stream, catching family members in the room.
- FHIR observation export — one-click push of the report to an EHR.
- Multi-session longitudinal tracking.
- On-device Speechmatics (they support it) for data residency.
