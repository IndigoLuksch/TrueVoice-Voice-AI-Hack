import os
import socket
import subprocess
import sys
import time
from contextlib import closing

import httpx
import pytest


def _free_port() -> int:
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait_for_ready(base_url: str, timeout_s: float = 10.0) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            r = httpx.get(f"{base_url}/health", timeout=0.5)
            if r.status_code == 200:
                return
        except httpx.TransportError:
            pass
        time.sleep(0.1)
    raise RuntimeError(f"server at {base_url} did not become ready within {timeout_s}s")


@pytest.fixture(scope="session")
def live_server():
    """Spawn a real uvicorn process for the whole test session. Yields its base URL."""
    port = _free_port()
    base_url = f"http://127.0.0.1:{port}"
    env = os.environ.copy()
    env.setdefault("SPEECHMATICS_API_KEY", "integration-sm")
    env.setdefault("THYMIA_API_KEY", "integration-th")
    env.setdefault("ANTHROPIC_API_KEY", "integration-an")
    env.setdefault("TRUEVOICE_TEST_MODE", "1")
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        env=env,
        cwd=os.path.join(os.path.dirname(__file__), "..", ".."),
    )
    try:
        _wait_for_ready(base_url)
        yield base_url
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)


@pytest.fixture(scope="session")
def ws_base(live_server):
    return live_server.replace("http://", "ws://")
