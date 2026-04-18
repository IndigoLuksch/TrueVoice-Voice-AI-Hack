import time

import pytest
from fastapi.testclient import TestClient

from app.rooms import RoomManager


def test_create_returns_room_with_4digit_id_and_eventbus():
    mgr = RoomManager()
    room = mgr.create()
    assert isinstance(room.room_id, str)
    assert len(room.room_id) == 4
    assert room.room_id.isdigit()
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


@pytest.fixture
def client():
    from app.main import app

    return TestClient(app)


def test_post_rooms_returns_new_room(client):
    r = client.post("/api/rooms")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["room_id"], str)
    assert len(body["room_id"]) == 4
    assert body["room_id"].isdigit()
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
