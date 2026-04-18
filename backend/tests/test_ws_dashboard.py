import json

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect


def _client() -> TestClient:
    from app.main import app

    return TestClient(app)


def _create_room(client: TestClient) -> str:
    return client.post("/api/rooms").json()["room_id"]


def test_dashboard_connect_and_receive_live_event():
    client = _client()
    room_id = _create_room(client)

    from app.rooms import rooms as rooms_mgr

    with client.websocket_connect(f"/ws/dashboard/{room_id}") as ws:
        room = rooms_mgr.get(room_id)
        assert room is not None
        room.eventbus.publish({
            "type": "call_status",
            "status": "connected",
            "peers": 1,
        })
        msg = ws.receive_text()
        assert json.loads(msg) == {
            "type": "call_status", "status": "connected", "peers": 1,
        }


def test_dashboard_replays_recent_events_on_connect():
    client = _client()
    room_id = _create_room(client)

    from app.rooms import rooms as rooms_mgr

    room = rooms_mgr.get(room_id)
    for i in range(3):
        room.eventbus.publish({"type": "call_status", "status": "connected", "peers": i})

    with client.websocket_connect(f"/ws/dashboard/{room_id}") as ws:
        received = [json.loads(ws.receive_text()) for _ in range(3)]
        assert [e["peers"] for e in received] == [0, 1, 2]


def test_dashboard_unknown_room_closes_4404():
    client = _client()
    try:
        with client.websocket_connect("/ws/dashboard/doesnotex") as ws:
            ws.receive_text()
    except WebSocketDisconnect as e:
        assert e.code == 4404
    else:
        raise AssertionError("expected 4404")


def test_dashboard_ignores_client_sends():
    client = _client()
    room_id = _create_room(client)

    from app.rooms import rooms as rooms_mgr

    with client.websocket_connect(f"/ws/dashboard/{room_id}") as ws:
        ws.send_text("noise")
        room = rooms_mgr.get(room_id)
        room.eventbus.publish({"type": "call_status", "status": "connected", "peers": 5})
        msg = json.loads(ws.receive_text())
        assert msg["peers"] == 5
