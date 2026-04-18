import asyncio
from collections import deque


class EventBus:
    """Per-room async fan-out pub/sub.

    - `publish` is non-blocking; on per-subscriber overflow, the oldest item
      is dropped to make room for the newest (newest-wins). This keeps
      dashboards responsive under burst load at the cost of gap recovery.
    - `recent` is a bounded ring buffer so late subscribers can replay
      history on connect.
    """

    def __init__(self, subscriber_maxsize: int = 500, recent_maxsize: int = 500):
        self._subscribers: list[asyncio.Queue] = []
        self._subscriber_maxsize = subscriber_maxsize
        self.recent: deque[dict] = deque(maxlen=recent_maxsize)

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=self._subscriber_maxsize)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        try:
            self._subscribers.remove(q)
        except ValueError:
            pass

    def publish(self, event: dict) -> None:
        self.recent.append(event)
        for q in self._subscribers:
            self._put_newest_wins(q, event)

    @staticmethod
    def _put_newest_wins(q: asyncio.Queue, event: dict) -> None:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            try:
                q.get_nowait()
            except asyncio.QueueEmpty:
                pass
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass
