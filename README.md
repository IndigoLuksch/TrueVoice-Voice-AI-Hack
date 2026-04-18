# TrueVoice

![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-async-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)
![Claude](https://img.shields.io/badge/Claude-Haiku%204.5%20%2F%20Sonnet%204.6-D97706?logo=anthropic&logoColor=white)
![Speechmatics](https://img.shields.io/badge/Speechmatics-Medical%20STT-2563EB)
![Thymia](https://img.shields.io/badge/Thymia-Voice%20Biomarkers-7C3AED)
![Track](https://img.shields.io/badge/Track-Voice%20%26%20Medical-6366F1)
![Hackathon](https://img.shields.io/badge/Voice%20AI%20Hack-London%202026-EC4899)

**Clinical voice intelligence that listens for what patients don't say.**

Built at the [Voice AI Hack](https://lu.ma/voiceaihack) (London, 2026) — **Voice & Medical** track, sponsored by Thymia and Speechmatics.

Patients routinely minimise symptoms during GP consultations: "I'm fine, just a bit tired." TrueVoice catches the gap between what they say and what their voice reveals — in real time, with no recording stored.

---

## How It Works

Audio is captured in the browser, downsampled to 16 kHz, and streamed over WebSockets to a FastAPI backend. Three parallel services analyse each utterance: Speechmatics medical STT produces the transcript; Thymia's Helios, Apollo, and Psyche models extract voice biomarkers; and a concordance engine matches minimisation phrases. When text and biomarkers diverge, Claude flags the moment and glosses it for the clinician. At the end of the consultation, Claude synthesises a one-page evidence report.

```mermaid
flowchart LR
    MIC["Microphone\n48 kHz"] --> AW["AudioWorklet\n→ 16 kHz PCM16"]
    AW -->|"WS binary frames\n640 samples / 40ms"| BE["Backend\n/ws/audio"]

    BE --> STT["Speechmatics\nMedical STT"]
    BE --> BIO["Thymia Biomarkers\nHelios · Apollo · Psyche"]

    STT --> CE["Concordance Engine"]
    BIO --> CE

    CE --> CL["Claude Haiku 4.5\nHot-path gloss < 1s"]
    CL --> EB["EventBus\nper-room pub/sub"]
    EB -->|"WS stream"| DASH["Clinician Dashboard"]
    DASH -->|"end of consult"| RPT["Claude Sonnet 4.6\nEvidence Report"]
```

### Signal pipeline

| Stage | Service | Target latency |
|---|---|---|
| Medical transcription | Speechmatics RT | ~200 ms |
| Distress / stress score (Helios) | Thymia | per utterance |
| Mood / energy score (Apollo) | Thymia | per utterance |
| Affect breakdown (Psyche) | Thymia | per utterance |
| Minimisation flag gloss | Claude Haiku 4.5 | < 1 s |
| End-of-consult evidence report | Claude Sonnet 4.6 | on demand |

---

## Landing Page

The landing page explains the three consultation modes and links to the clinical dashboard.

![Landing page showing the three consultation modes and the TrueVoice value proposition](docs/images/landing.png)

---

## Clinician Dashboard

The live dashboard streams transcript, biomarker bars, and concordance flags as the consultation unfolds. Each flag shows the minimisation phrase, the biomarker evidence that triggered it, and Claude's clinical gloss.

![Clinician dashboard with live transcript, Helios/Apollo/Psyche biomarker bars, and a concordance flag card](docs/images/dashboard.png)

---

## Evidence Report

At the end of the consultation, clicking **Generate Report** calls Claude Sonnet 4.6 with the full transcript, all biomarker readings, and every flagged moment. The output is a structured one-page brief the GP can review and attach to the patient record.

![Evidence report showing executive summary, flagged moments with supporting biomarker readings, and recommended follow-up actions](docs/images/report.png)

---

## Consultation Modes

```mermaid
graph TD
    A[TrueVoice] --> B[Telehealth]
    A --> C[In-person]
    A --> D[Codec Demo]

    B --> B1["Browser WebRTC\npatient + clinician on separate devices"]
    C --> C1["Single laptop mic\nboth people in the room"]
    D --> D1["Raw PCM vs Opus VOIP\nbiomarker fidelity comparison"]
```

---

## Tech Stack

**Backend:** Python 3.11 · FastAPI · WebSockets · `speechmatics-rt` · `thymia-sentinel` · Anthropic SDK · `uv`

**Frontend:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · AudioWorklet · `pnpm`

---

## Getting Started

### Backend
```bash
cd backend
uv sync
cp .env.example .env   # add SPEECHMATICS_API_KEY, THYMIA_API_KEY, ANTHROPIC_API_KEY
uv run uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
pnpm install
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_URL
pnpm dev
```

Open `http://localhost:3000`.

---

## Project Structure

```
TrueVoice/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── models.py            # Pydantic event schema
│   │   ├── rooms.py             # Ephemeral session state
│   │   ├── eventbus.py          # Per-room async pub/sub
│   │   ├── services/
│   │   │   ├── speechmatics.py  # Medical STT
│   │   │   ├── thymia.py        # Voice biomarkers
│   │   │   ├── claude.py        # Flag gloss + report
│   │   │   └── concordance.py   # Minimisation detection
│   │   └── ws/
│   │       ├── audio.py         # Audio ingress WebSocket
│   │       └── dashboard.py     # Dashboard event stream
│   └── tests/
└── frontend/
    ├── app/
    │   ├── page.tsx             # Landing
    │   ├── in-person/           # In-person mode
    │   ├── report/[room]/       # Evidence report
    │   └── test-ui/             # Codec demo
    └── components/
        ├── Dashboard.tsx
        ├── BiomarkerLane.tsx
        ├── FlagCard.tsx
        └── TranscriptLane.tsx
```

---

## Team

| Name | GitHub |
|---|---|
| Joan Torres Gordo | [@joant11](https://github.com/joant11) |
| Indigo Luksch | [@IndigoLuksch](https://github.com/IndigoLuksch) |
| Oriol Morros Vilaseca | — |

---

> **Disclaimer:** TrueVoice is a research-grade hackathon prototype. It is not a medical device and should not be used for clinical diagnosis.
