import asyncio

from app.services.distributor import AudioDistributor


async def test_publish_delivers_to_subscriber():
    dist = AudioDistributor()
    q = dist.subscribe()
    dist.publish(b"\x01\x02\x03")
    chunk = await asyncio.wait_for(q.get(), timeout=1.0)
    assert chunk == b"\x01\x02\x03"


async def test_multiple_subscribers_all_receive():
    dist = AudioDistributor()
    q1, q2 = dist.subscribe(), dist.subscribe()
    dist.publish(b"a")
    dist.publish(b"b")
    assert await q1.get() == b"a"
    assert await q1.get() == b"b"
    assert await q2.get() == b"a"
    assert await q2.get() == b"b"


async def test_unsubscribe_stops_delivery():
    dist = AudioDistributor()
    q = dist.subscribe()
    dist.unsubscribe(q)
    dist.publish(b"x")
    assert q.empty()


async def test_full_subscriber_drops_oldest_not_crash():
    dist = AudioDistributor(subscriber_maxsize=3)
    q = dist.subscribe()
    for i in range(10):
        dist.publish(bytes([i]))
    drained = []
    while not q.empty():
        drained.append(q.get_nowait())
    assert drained == [bytes([7]), bytes([8]), bytes([9])]


async def test_no_subscribers_publish_silently_drops():
    dist = AudioDistributor()
    dist.publish(b"vanishes")  # must not raise
