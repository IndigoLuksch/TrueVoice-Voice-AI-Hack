import asyncio

import httpx
import pytest
import websockets

pytestmark = pytest.mark.integration


def test_health_live(live_server):
    r = httpx.get(f"{live_server}/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_rooms_create_and_fetch_live(live_server):
    created = httpx.post(f"{live_server}/api/rooms").json()
    assert len(created["room_id"]) == 8
    fetched = httpx.get(f"{live_server}/api/rooms/{created['room_id']}").json()
    assert fetched["exists"] is True
    assert fetched["created_at_ms"] == created["created_at_ms"]


def test_rooms_missing_live(live_server):
    r = httpx.get(f"{live_server}/api/rooms/doesnotex")
    assert r.status_code == 200
    assert r.json() == {"exists": False, "created_at_ms": None}


def test_ws_echo_text_live(ws_base):
    async def run():
        async with websockets.connect(f"{ws_base}/ws/echo") as ws:
            await ws.send("hello-live")
            reply = await asyncio.wait_for(ws.recv(), timeout=2.0)
            assert reply == "hello-live"

    asyncio.run(run())


def test_ws_echo_binary_live(ws_base):
    async def run():
        async with websockets.connect(f"{ws_base}/ws/echo") as ws:
            await ws.send(b"\x01\x02\x03")
            reply = await asyncio.wait_for(ws.recv(), timeout=2.0)
            assert reply == b"\x01\x02\x03"

    asyncio.run(run())


def test_cors_header_present_live(live_server):
    r = httpx.options(
        f"{live_server}/api/rooms",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert r.status_code in (200, 204)
    allow_origin = r.headers.get("access-control-allow-origin")
    assert allow_origin in ("http://localhost:3000", "*")
