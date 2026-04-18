import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings
from app.rooms import rooms as rooms_mgr
from app.services.concordance import ConcordanceEngine
from app.services.distributor import AudioDistributor
from app.services.speechmatics import SpeechmaticsService
from app.services.thymia import ThymiaService

logger = logging.getLogger("truevoice.audio")

FRAME_BYTES = 1280  # 640 samples * 2 bytes PCM16 (40ms @ 16kHz)
_VALID_ROLES = frozenset({"patient", "clinician"})
_THYMIA_TASK_KEY = "_thymia"

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

    # Spawn a Speechmatics task for this (room, role) if not already running.
    existing = room.speechmatics_tasks.get(role)
    if existing is None or existing.done():
        svc = SpeechmaticsService(
            api_key=settings.speechmatics_api_key.get_secret_value()
        )
        task = asyncio.create_task(svc.start(room, role))
        room.speechmatics_tasks[role] = task
        logger.info("[audio] %s@%s SM task spawned", role, room_id)

    # Thymia: patient audio only (biomarker pollution risk from clinician voice).
    if role == "patient":
        existing_th = room.speechmatics_tasks.get(_THYMIA_TASK_KEY)
        if room.thymia_service is None and (existing_th is None or existing_th.done()):
            th_svc = ThymiaService(
                api_key=settings.thymia_api_key.get_secret_value()
            )
            room.thymia_service = th_svc
            th_task = asyncio.create_task(th_svc.start(room))
            room.speechmatics_tasks[_THYMIA_TASK_KEY] = th_task
            logger.info("[audio] thymia task spawned for %s", room_id)

        if room.concordance_engine is None:
            room.concordance_engine = ConcordanceEngine(room)
            room.concordance_engine.start()
            logger.info("[audio] concordance engine started for %s", room_id)

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
                break
            distributor.publish(data)
            n_frames += 1
            if n_frames % 100 == 0:
                logger.info(
                    "[audio] %s@%s %dms ingested", role, room_id, n_frames * 40,
                )
    except WebSocketDisconnect:
        pass
    finally:
        logger.info(
            "[audio] %s@%s disconnected after %d frames (%dms)",
            role, room_id, n_frames, n_frames * 40,
        )
        task = room.speechmatics_tasks.get(role)
        if task and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
            room.speechmatics_tasks.pop(role, None)
            logger.info("[audio] %s@%s SM task cancelled", role, room_id)

        if role == "patient":
            th_task = room.speechmatics_tasks.get(_THYMIA_TASK_KEY)
            if th_task and not th_task.done():
                th_task.cancel()
                try:
                    await th_task
                except (asyncio.CancelledError, Exception):
                    pass
            room.speechmatics_tasks.pop(_THYMIA_TASK_KEY, None)
            room.thymia_service = None
            logger.info("[audio] thymia task cancelled for %s", room_id)

            if room.concordance_engine is not None:
                room.concordance_engine.stop()
                try:
                    await room.concordance_engine._task  # best-effort await
                except (asyncio.CancelledError, Exception):
                    pass
                room.concordance_engine = None
                logger.info("[audio] concordance engine stopped for %s", room_id)
