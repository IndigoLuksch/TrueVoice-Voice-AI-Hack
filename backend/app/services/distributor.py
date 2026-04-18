import asyncio


class AudioDistributor:
    """Fan-out distributor for audio byte chunks.

    Mirrors the newest-wins overflow policy of EventBus but carries `bytes`
    instead of dict events. Subscribers get their own bounded queue; if a
    subscriber falls behind, we drop its oldest chunk rather than blocking
    the publisher (audio is real-time — backpressure is worse than gaps).
    """

    def __init__(self, subscriber_maxsize: int = 200):
        self._subscribers: list[asyncio.Queue] = []
        self._subscriber_maxsize = subscriber_maxsize

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=self._subscriber_maxsize)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        try:
            self._subscribers.remove(q)
        except ValueError:
            pass

    def publish(self, chunk: bytes) -> None:
        for q in self._subscribers:
            self._put_newest_wins(q, chunk)

    @staticmethod
    def _put_newest_wins(q: asyncio.Queue, chunk: bytes) -> None:
        try:
            q.put_nowait(chunk)
        except asyncio.QueueFull:
            try:
                q.get_nowait()
            except asyncio.QueueEmpty:
                pass
            try:
                q.put_nowait(chunk)
            except asyncio.QueueFull:
                pass
