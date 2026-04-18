import asyncio
import json

import httpx
import pytest
import websockets
from websockets.exceptions import ConnectionClosedError

pytestmark = pytest.mark.integration


def _create_room(live_server: str) -> str:
    return httpx.post(f"{live_server}/api/rooms").json()["room_id"]


def test_dashboard_receives_injected_event_live(live_server, ws_base):
    room_id = _create_room(live_server)
    got: list = []

    async def run():
        async with websockets.connect(f"{ws_base}/ws/dashboard/{room_id}") as ws:
            # Give the subscribe a moment to register.
            await asyncio.sleep(0.05)
            r = httpx.post(
                f"{live_server}/api/debug/emit-event/{room_id}",
                json={"type": "call_status", "status": "connected", "peers": 3},
            )
            assert r.status_code == 200
            msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
            got.append(json.loads(msg))

    asyncio.run(run())
    assert got[0]["peers"] == 3


def test_dashboard_unknown_room_closed_live(ws_base):
    async def run():
        with pytest.raises(ConnectionClosedError) as exc:
            async with websockets.connect(f"{ws_base}/ws/dashboard/doesnotex") as ws:
                await asyncio.wait_for(ws.recv(), timeout=2.0)
        assert exc.value.rcvd.code == 4404

    asyncio.run(run())
