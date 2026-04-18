"""One-off smoke test for Phase 4 Thymia wiring. Not part of the suite."""
import asyncio
import json

import httpx
import websockets


async def main():
    base = "http://127.0.0.1:8765"
    wsbase = "ws://127.0.0.1:8765"

    r = httpx.post(f"{base}/api/rooms").json()
    room = r["room_id"]
    print(f"room: {room}")

    events = []

    async def dash():
        async with websockets.connect(f"{wsbase}/ws/dashboard/{room}") as ws:
            try:
                while True:
                    msg = await asyncio.wait_for(ws.recv(), timeout=1.0)
                    e = json.loads(msg)
                    print(f"EVENT: {e.get('type')} -> {e}")
                    events.append(e)
            except TimeoutError:
                pass
            except Exception as ex:
                print(f"dash exit: {ex!r}")

    async def audio():
        async with websockets.connect(f"{wsbase}/ws/audio/patient/{room}") as ws:
            # 35 seconds at 40ms frames = 875 frames
            for i in range(875):
                await ws.send(b"\x00" * 1280)
                await asyncio.sleep(0.04)
            print("audio done")

    # Verify room.thymia_service is populated by peeking after a short delay.
    async def peek_state():
        await asyncio.sleep(2.0)
        # There is no HTTP endpoint for this, but we can observe via /api/rooms/<id>.
        try:
            r2 = httpx.get(f"{base}/api/rooms/{room}")
            print(f"room GET: {r2.status_code} {r2.text[:200]}")
        except Exception as ex:
            print(f"peek failed: {ex!r}")

    await asyncio.gather(audio(), dash(), peek_state())
    print(f"total events: {len(events)}")
    type_counts = {}
    for e in events:
        t = e.get("type")
        type_counts[t] = type_counts.get(t, 0) + 1
    print(f"type counts: {type_counts}")


asyncio.run(main())
