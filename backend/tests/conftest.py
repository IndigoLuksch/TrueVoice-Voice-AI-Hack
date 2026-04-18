import os

os.environ.setdefault("SPEECHMATICS_API_KEY", "test-sm")
os.environ.setdefault("THYMIA_API_KEY", "test-th")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-an")

import pytest


@pytest.fixture(autouse=True)
def _stub_speechmatics(monkeypatch, request):
    """Stub Speechmatics client in unit tests to avoid network calls.

    Live-server integration tests (marked `integration`) opt out so they
    can still exercise the real Speechmatics path if a real key is present.
    """
    if "integration" in request.node.keywords:
        return
    from app.services import speechmatics as sm_module

    class _StubClient:
        default_transcription_config = None
        default_audio_format = None

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return None

        def on(self, _name):
            return lambda fn: fn

        async def start_session(self, transcription_config=None, audio_format=None):
            return None

        async def send_audio(self, _chunk):
            return None

        async def stop_session(self):
            return None

    monkeypatch.setattr(
        sm_module, "_default_client_factory", lambda api_key: _StubClient()
    )


@pytest.fixture(autouse=True)
def _stub_thymia(monkeypatch, request):
    """Stub Thymia Sentinel client in unit tests to avoid network calls."""
    if "integration" in request.node.keywords:
        return
    from app.services import thymia as thymia_module

    class _StubClient:
        def on_progress(self, fn):
            return fn

        def on_policy_result(self, fn):
            return fn

        async def connect(self):
            return None

        async def send_user_audio(self, _chunk):
            return None

        async def send_user_transcript(self, _text, is_final=True):
            return None

        async def close(self):
            return None

    monkeypatch.setattr(
        thymia_module,
        "_default_client_factory",
        lambda api_key, room_id: _StubClient(),
    )


@pytest.fixture(autouse=True)
def _stub_claude(monkeypatch, request):
    if "integration" in request.node.keywords:
        return
    from app.services import claude as claude_module

    class _StubResponse:
        content = [type("T", (), {"type": "text", "text": "stubbed gloss"})()]

    class _StubMessages:
        async def create(self, **_):
            return _StubResponse()

    class _StubAnthropic:
        def __init__(self, *a, **kw):
            self.messages = _StubMessages()

    monkeypatch.setattr(claude_module, "AsyncAnthropic", _StubAnthropic)
