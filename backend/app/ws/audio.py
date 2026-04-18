import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.rooms import rooms as rooms_mgr
from app.services.distributor import AudioDistributor

logger = logging.getLogger("truevoice.audio")

FRAME_BYTES = 1280  # 640 samples * 2 bytes PCM16 (40ms @ 16kHz)
_VALID_ROLES = frozenset({"patient", "clinician"})

router = APIRouter()


@router.websocket("/ws/audio/{role}/{room_id}")
async def audio_ingress(ws: WebSocket, role: str, room_id: str) -> None:
    await ws.accept()

    if role not in _VALID_ROLES:
        await ws.close(code=4404, reason=f"invalid role: {role}")
        return

    room = rooms_mgr.get(room_id)
    if room is None:
        await ws.close(code=4404, reason=f"unknown room: {room_id}")
        return

    if role not in room.audio_distributors:
        room.audio_distributors[role] = AudioDistributor()
    distributor = room.audio_distributors[role]

    logger.info("[audio] %s@%s connected", role, room_id)
    n_frames = 0
    try:
        while True:
            data = await ws.receive_bytes()
            if len(data) != FRAME_BYTES:
                logger.warning(
                    "[audio] %s@%s bad frame size: %d (expected %d)",
                    role, room_id, len(data), FRAME_BYTES,
                )
                await ws.close(code=4400, reason="bad frame size")
                return
            distributor.publish(data)
            n_frames += 1
            if n_frames % 100 == 0:
                logger.info(
                    "[audio] %s@%s %dms ingested", role, room_id, n_frames * 40,
                )
    except WebSocketDisconnect:
        logger.info(
            "[audio] %s@%s disconnected after %d frames (%dms)",
            role, room_id, n_frames, n_frames * 40,
        )
