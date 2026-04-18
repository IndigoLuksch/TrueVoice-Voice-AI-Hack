import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.rooms import rooms as rooms_mgr

logger = logging.getLogger("truevoice.dashboard")

REPLAY_LIMIT = 100

router = APIRouter()


@router.websocket("/ws/dashboard/{room_id}")
async def dashboard_stream(ws: WebSocket, room_id: str) -> None:
    await ws.accept()

    room = rooms_mgr.get(room_id)
    if room is None:
        await ws.close(code=4404, reason=f"unknown room: {room_id}")
        return

    # Subscribe FIRST so we don't miss events that arrive during replay.
    # Cost: a new event during replay may appear twice (once via replay,
    # once via the live queue). Clinical UIs should accept dup events.
    queue = room.eventbus.subscribe()
    logger.info("[dashboard] %s subscribed", room_id)

    replay = list(room.eventbus.recent)[-REPLAY_LIMIT:]
    for evt in replay:
        await ws.send_text(json.dumps(evt))

    reader_task = asyncio.create_task(_drain_client_sends(ws))

    try:
        while True:
            evt = await queue.get()
            try:
                await ws.send_text(json.dumps(evt))
            except (WebSocketDisconnect, RuntimeError):
                # Client gone mid-send — stop cleanly.
                return
    except WebSocketDisconnect:
        pass
    finally:
        room.eventbus.unsubscribe(queue)
        reader_task.cancel()
        logger.info("[dashboard] %s unsubscribed", room_id)


async def _drain_client_sends(ws: WebSocket) -> None:
    """Consume and discard anything the client sends; the channel is one-way."""
    try:
        while True:
            await ws.receive()
    except WebSocketDisconnect:
        return
