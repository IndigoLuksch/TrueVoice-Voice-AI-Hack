"""Test-only debug endpoints. Only mounted when TRUEVOICE_TEST_MODE=1.

NOT safe for production — allows anyone to inject arbitrary events into any
room. The env-flag gate prevents them from being mounted at all when the
flag is not set.
"""
import os

from fastapi import APIRouter, HTTPException

from app.rooms import rooms as rooms_mgr

router = APIRouter(prefix="/api/debug", tags=["debug"])


@router.post("/emit-event/{room_id}")
def emit_event(room_id: str, event: dict) -> dict:
    room = rooms_mgr.get(room_id)
    if room is None:
        raise HTTPException(404, f"unknown room: {room_id}")
    room.eventbus.publish(event)
    return {"ok": True}


def is_enabled() -> bool:
    return os.environ.get("TRUEVOICE_TEST_MODE") == "1"
