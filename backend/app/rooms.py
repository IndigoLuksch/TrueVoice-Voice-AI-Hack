import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

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
    thymia_service: Any | None = None
    concordance_engine: Any | None = None
    peers: dict[str, Any] = field(default_factory=dict)

    report: dict | None = None

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
