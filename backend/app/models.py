from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

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
    model_config = ConfigDict(protected_namespaces=())

    type: Literal["biomarker_progress"]
    model: BioModel
    name: str
    speech_seconds: float
    trigger_seconds: float


class BiomarkerResult(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    type: Literal["biomarker_result"]
    model: Literal["helios", "apollo"]
    name: str
    value: float
    ts_ms: int


class PsycheUpdate(BaseModel):
    type: Literal["psyche_update"]
    # Open dict so Phase 3 payload discovery (PRD 5 Step 0) can surface any
    # extra affect keys Thymia emits without failing validation.
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
    (
        TranscriptPartial
        | TranscriptFinal
        | BiomarkerProgress
        | BiomarkerResult
        | PsycheUpdate
        | ConcordanceFlag
        | CallStatus
    ),
    Field(discriminator="type"),
]


class RoomCreateResponse(BaseModel):
    room_id: str
    created_at_ms: int


class RoomExistsResponse(BaseModel):
    exists: bool
    created_at_ms: int | None = None
