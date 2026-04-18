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
