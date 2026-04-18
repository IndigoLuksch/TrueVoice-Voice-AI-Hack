from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect


def _client() -> TestClient:
    from app.main import app

    return TestClient(app)


def _make_frame(value: int = 0) -> bytes:
    # 1280 bytes = 640 samples * 2 bytes PCM16
    return bytes([value & 0xFF]) * 1280


def _create_room(client: TestClient) -> str:
    return client.post("/api/rooms").json()["room_id"]


def test_patient_audio_accepts_valid_frame():
    client = _client()
    room_id = _create_room(client)
    with client.websocket_connect(f"/ws/audio/patient/{room_id}") as ws:
        ws.send_bytes(_make_frame(1))
        ws.send_bytes(_make_frame(2))


def test_clinician_audio_accepts_valid_frame():
    client = _client()
    room_id = _create_room(client)
    with client.websocket_connect(f"/ws/audio/clinician/{room_id}") as ws:
        ws.send_bytes(_make_frame(3))


def test_invalid_role_closes_with_4404():
    client = _client()
    room_id = _create_room(client)
    try:
        with client.websocket_connect(f"/ws/audio/nurse/{room_id}") as ws:
            ws.receive_bytes()
    except WebSocketDisconnect as e:
        assert e.code == 4404
    else:
        raise AssertionError("expected WebSocketDisconnect with code 4404")


def test_missing_room_closes_with_4404():
    client = _client()
    try:
        with client.websocket_connect("/ws/audio/patient/doesnotex") as ws:
            ws.receive_bytes()
    except WebSocketDisconnect as e:
        assert e.code == 4404
    else:
        raise AssertionError("expected WebSocketDisconnect with code 4404")


def test_wrong_frame_size_closes_with_4400():
    client = _client()
    room_id = _create_room(client)
    try:
        with client.websocket_connect(f"/ws/audio/patient/{room_id}") as ws:
            ws.send_bytes(b"\x00" * 1000)
            ws.receive_bytes()
    except WebSocketDisconnect as e:
        assert e.code == 4400
    else:
        raise AssertionError("expected WebSocketDisconnect with code 4400")


def test_distributor_created_on_first_connect():
    client = _client()
    room_id = _create_room(client)

    from app.rooms import rooms as rooms_mgr

    with client.websocket_connect(f"/ws/audio/patient/{room_id}") as ws:
        ws.send_bytes(_make_frame(7))
        room = rooms_mgr.get(room_id)
        assert room is not None
        assert "patient" in room.audio_distributors
