import asyncio

import httpx
import pytest
import websockets
from websockets.exceptions import ConnectionClosedError

pytestmark = pytest.mark.integration


FRAME_BYTES = 1280


def _frame(value: int = 0) -> bytes:
    return bytes([value & 0xFF]) * FRAME_BYTES


def _create_room(live_server: str) -> str:
    return httpx.post(f"{live_server}/api/rooms").json()["room_id"]


def test_patient_audio_accepts_frames_live(live_server, ws_base):
    room_id = _create_room(live_server)

    async def run():
        async with websockets.connect(f"{ws_base}/ws/audio/patient/{room_id}") as ws:
            for i in range(10):
                await ws.send(_frame(i))
            # No server reply expected; close clean.

    asyncio.run(run())


def test_invalid_role_rejected_live(live_server, ws_base):
    room_id = _create_room(live_server)

    async def run():
        with pytest.raises(ConnectionClosedError) as exc:
            async with websockets.connect(f"{ws_base}/ws/audio/nurse/{room_id}") as ws:
                # Read until close — the server accepts then closes with 4404.
                await asyncio.wait_for(ws.recv(), timeout=2.0)
        assert exc.value.rcvd is not None
        assert exc.value.rcvd.code == 4404

    asyncio.run(run())


def test_missing_room_rejected_live(ws_base):
    async def run():
        with pytest.raises(ConnectionClosedError) as exc:
            async with websockets.connect(f"{ws_base}/ws/audio/patient/doesnotex") as ws:
                await asyncio.wait_for(ws.recv(), timeout=2.0)
        assert exc.value.rcvd.code == 4404

    asyncio.run(run())


def test_wrong_frame_size_rejected_live(live_server, ws_base):
    room_id = _create_room(live_server)

    async def run():
        with pytest.raises(ConnectionClosedError) as exc:
            async with websockets.connect(f"{ws_base}/ws/audio/patient/{room_id}") as ws:
                await ws.send(b"\x00" * 500)  # wrong size
                await asyncio.wait_for(ws.recv(), timeout=2.0)
        assert exc.value.rcvd.code == 4400

    asyncio.run(run())
