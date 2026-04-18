"""WebRTC signaling relay.

Thin JSON pipe between the two peers in a room. We only support a 1:1 call
(one patient, one clinician per room). The server never touches SDP; it just
forwards messages to the other peer.

Message envelope (JSON text frames):
    { "type": "offer" | "answer" | "ice", ...payload }

Server-originated notifications to each peer:
    { "type": "peer-joined" }   when the other peer becomes present
    { "type": "peer-left" }     when the other peer disconnects
    { "type": "ready", "peer": "patient"|"clinician"|null }
        sent on connect so the peer knows whether the other side is already
        present and who they are.
"""

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.rooms import rooms as rooms_mgr

logger = logging.getLogger("truevoice.signal")

_VALID_ROLES = frozenset({"patient", "clinician"})
_OTHER = {"patient": "clinician", "clinician": "patient"}

router = APIRouter()


async def _safe_send_json(ws: WebSocket, payload: dict) -> bool:
    try:
        await ws.send_json(payload)
        return True
    except Exception:
        return False


@router.websocket("/ws/signal/{role}/{room_id}")
async def signal_relay(ws: WebSocket, role: str, room_id: str) -> None:
    await ws.accept()

    if role not in _VALID_ROLES:
        await ws.close(code=4404, reason=f"invalid role: {role}")
        return

    room = rooms_mgr.get(room_id)
    if room is None:
        await ws.close(code=4404, reason=f"unknown room: {room_id}")
        return

    other_role = _OTHER[role]

    # If another socket is already registered for this role in this room, kick
    # it — the new tab takes over. Prevents stale zombie peers.
    stale = room.peers.get(role)
    if stale is not None and stale is not ws:
        try:
            await stale.close(code=4000, reason="replaced by new peer")
        except Exception:
            pass

    room.peers[role] = ws
    other_ws = room.peers.get(other_role)
    logger.info(
        "[signal] %s@%s connected (other=%s)",
        role, room_id, "present" if other_ws else "absent",
    )

    # Tell the joining peer the current state, and notify the other peer.
    await _safe_send_json(ws, {
        "type": "ready",
        "peer": other_role if other_ws else None,
    })
    if other_ws is not None:
        sent = await _safe_send_json(other_ws, {"type": "peer-joined"})
        if not sent:
            # Other peer died silently — drop them.
            room.peers.pop(other_role, None)
            other_ws = None
        else:
            # Also tell the new peer that their partner is here so they can
            # start negotiation if they are the impolite side.
            await _safe_send_json(ws, {"type": "peer-joined"})

    try:
        while True:
            msg = await ws.receive_json()
            target = room.peers.get(other_role)
            if target is None:
                # No peer to relay to; drop silently. Peer will reconnect.
                continue
            msg_type = msg.get("type") if isinstance(msg, dict) else None
            if msg_type not in {"offer", "answer", "ice"}:
                logger.warning("[signal] %s@%s bad type: %r", role, room_id, msg_type)
                continue
            ok = await _safe_send_json(target, msg)
            if not ok:
                room.peers.pop(other_role, None)
    except WebSocketDisconnect:
        pass
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.warning("[signal] %s@%s relay error: %s", role, room_id, exc)
    finally:
        # Only clear if we're still the registered socket (handles kick races).
        if room.peers.get(role) is ws:
            room.peers.pop(role, None)
        other_ws = room.peers.get(other_role)
        if other_ws is not None:
            await _safe_send_json(other_ws, {"type": "peer-left"})
        logger.info("[signal] %s@%s disconnected", role, room_id)
