from fastapi.testclient import TestClient


def test_health_ok():
    from app.main import app

    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_ws_echo():
    from app.main import app

    client = TestClient(app)
    with client.websocket_connect("/ws/echo") as ws:
        ws.send_text("hi")
        assert ws.receive_text() == "hi"


def test_ws_echo_binary():
    from app.main import app

    client = TestClient(app)
    with client.websocket_connect("/ws/echo") as ws:
        ws.send_bytes(b"\x00\x01\x02")
        assert ws.receive_bytes() == b"\x00\x01\x02"
