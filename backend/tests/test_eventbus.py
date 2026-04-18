import asyncio

import pytest

from app.eventbus import EventBus


async def test_publish_delivers_to_subscriber():
    bus = EventBus()
    q = bus.subscribe()
    bus.publish({"type": "call_status", "status": "connected", "peers": 1})
    evt = await asyncio.wait_for(q.get(), timeout=1.0)
    assert evt["type"] == "call_status"


async def test_multiple_subscribers_all_receive():
    bus = EventBus()
    q1, q2 = bus.subscribe(), bus.subscribe()
    bus.publish({"type": "tick", "n": 1})
    bus.publish({"type": "tick", "n": 2})
    assert (await q1.get())["n"] == 1
    assert (await q1.get())["n"] == 2
    assert (await q2.get())["n"] == 1
    assert (await q2.get())["n"] == 2


async def test_unsubscribe_stops_delivery():
    bus = EventBus()
    q = bus.subscribe()
    bus.unsubscribe(q)
    bus.publish({"type": "tick"})
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(q.get(), timeout=0.05)


async def test_ring_buffer_caps_at_500():
    bus = EventBus()
    for i in range(600):
        bus.publish({"type": "tick", "n": i})
    assert len(bus.recent) == 500
    assert bus.recent[0]["n"] == 100
    assert bus.recent[-1]["n"] == 599


async def test_full_subscriber_drops_oldest_not_crash():
    bus = EventBus(subscriber_maxsize=3)
    q = bus.subscribe()
    for i in range(10):
        bus.publish({"n": i})
    # Queue kept the most recent 3 entries (oldest dropped on overflow).
    drained = []
    while not q.empty():
        drained.append(q.get_nowait()["n"])
    assert drained == [7, 8, 9]
