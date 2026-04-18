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
