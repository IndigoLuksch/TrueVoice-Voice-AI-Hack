"""End-of-consult report endpoints."""
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.rooms import rooms as rooms_mgr
from app.services.claude import ClaudeService

router = APIRouter(prefix="/api/report", tags=["report"])


class GenerateResponse(BaseModel):
    ok: bool = True
    generated_at_ms: int


class ReportBody(BaseModel):
    markdown: str
    generated_at_ms: int
    duration_sec: int
    flags: list[dict]
    transcripts: list[dict]
    biomarker_history: list[dict]


_claude = ClaudeService()


@router.post("/{room_id}", response_model=GenerateResponse)
async def generate_report(room_id: str) -> GenerateResponse:
    room = rooms_mgr.get(room_id)
    if room is None:
        raise HTTPException(404, f"unknown room: {room_id}")

    duration_sec = max(1, room.now_ms() // 1000)
    patient_transcripts = [t for t in room.transcripts if t.get("role") == "patient"]

    markdown = await _claude.generate_report(
        duration_sec=duration_sec,
        patient_transcripts=patient_transcripts,
        biomarker_history=list(room.biomarker_history),
        flags=list(room.flags),
    )

    generated_at_ms = int(time.time() * 1000)
    room.report = {
        "markdown": markdown,
        "generated_at_ms": generated_at_ms,
        "duration_sec": duration_sec,
        "flags": list(room.flags),
        "transcripts": list(room.transcripts),
        "biomarker_history": list(room.biomarker_history),
    }
    return GenerateResponse(ok=True, generated_at_ms=generated_at_ms)


@router.get("/{room_id}", response_model=ReportBody)
def fetch_report(room_id: str) -> ReportBody:
    room = rooms_mgr.get(room_id)
    if room is None:
        raise HTTPException(404, f"unknown room: {room_id}")
    if room.report is None:
        raise HTTPException(
            409,
            "report not yet generated — POST /api/report/{room_id} first",
        )
    return ReportBody(**room.report)
