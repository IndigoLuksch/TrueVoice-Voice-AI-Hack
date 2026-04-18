import asyncio

from app.rooms import RoomManager
from app.services.distributor import AudioDistributor


class _FakeSMClient:
    """Stand-in for the Speechmatics AsyncClient facade.

    Captures handlers and audio so tests can verify flow without the network.
    """

    def __init__(self):
        self.handlers: dict = {}
        self.sent_audio: list[bytes] = []
        self.started = False
        self.stopped = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return None

    def on(self, message_type_name):
        def decorator(fn):
            self.handlers[message_type_name] = fn
            return fn
        return decorator

    async def start_session(self, transcription_config=None, audio_format=None):
        self.started = True

    async def send_audio(self, chunk: bytes):
        self.sent_audio.append(chunk)

    async def stop_session(self):
        self.stopped = True


async def _maybe_await(result):
    if asyncio.iscoroutine(result):
        await result


async def test_forwards_audio_to_client():
    from app.services.speechmatics import SpeechmaticsService

    rooms_mgr = RoomManager()
    room = rooms_mgr.create()
    room.audio_distributors["patient"] = AudioDistributor()

    fake_client = _FakeSMClient()
    svc = SpeechmaticsService(client_factory=lambda api_key: fake_client)

    task = asyncio.create_task(svc.start(room, "patient"))
    await asyncio.sleep(0.05)

    room.audio_distributors["patient"].publish(b"\x01" * 1280)
    room.audio_distributors["patient"].publish(b"\x02" * 1280)
    await asyncio.sleep(0.1)

    assert fake_client.started is True
    assert len(fake_client.sent_audio) >= 2

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


async def test_publishes_partial_transcript_event():
    from app.services.speechmatics import SpeechmaticsService

    rooms_mgr = RoomManager()
    room = rooms_mgr.create()
    room.audio_distributors["patient"] = AudioDistributor()

    fake_client = _FakeSMClient()
    svc = SpeechmaticsService(
        client_factory=lambda api_key: fake_client,
        transcript_extractor=lambda msg: msg,  # pass-through for test
    )
    q = room.eventbus.subscribe()

    task = asyncio.create_task(svc.start(room, "patient"))
    await asyncio.sleep(0.05)

    partial_handler = fake_client.handlers["ADD_PARTIAL_TRANSCRIPT"]
    await _maybe_await(partial_handler("i'm feeling"))

    evt = await asyncio.wait_for(q.get(), timeout=1.0)
    assert evt["type"] == "transcript_partial"
    assert evt["role"] == "patient"
    assert evt["text"] == "i'm feeling"

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


async def test_publishes_final_transcript_event_and_stores_on_room():
    from app.services.speechmatics import SpeechmaticsService

    rooms_mgr = RoomManager()
    room = rooms_mgr.create()
    room.audio_distributors["patient"] = AudioDistributor()

    fake_client = _FakeSMClient()
    svc = SpeechmaticsService(
        client_factory=lambda api_key: fake_client,
        transcript_extractor=lambda msg: msg,
    )
    q = room.eventbus.subscribe()

    task = asyncio.create_task(svc.start(room, "patient"))
    await asyncio.sleep(0.05)

    final_handler = fake_client.handlers["ADD_TRANSCRIPT"]
    await _maybe_await(final_handler("i'm doing fine thanks"))

    evt = await asyncio.wait_for(q.get(), timeout=1.0)
    assert evt["type"] == "transcript_final"
    assert evt["text"] == "i'm doing fine thanks"
    assert "utterance_id" in evt
    assert evt["end_ms"] >= evt["start_ms"]

    assert len(room.transcripts) == 1
    assert room.transcripts[0]["text"] == "i'm doing fine thanks"

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
