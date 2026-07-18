from __future__ import annotations

import json
import logging

from fastapi import WebSocket, WebSocketDisconnect

from app.models.state import state

logger = logging.getLogger(__name__)


async def broadcast(msg: dict) -> None:
    """Fan-out a JSON message to all connected WebSocket clients."""
    if not state.active_ws:
        return
    dead: set[WebSocket] = set()
    text = json.dumps(msg, default=str)
    for ws in list(state.active_ws):
        try:
            await ws.send_text(text)
        except Exception:
            dead.add(ws)
    state.active_ws -= dead


async def ws_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    state.active_ws.add(websocket)
    logger.info("WS connected — total clients: %d", len(state.active_ws))

    # Send full snapshot immediately on connect (WS_CONTRACT.md §8)
    snapshot = {
        "type": "snapshot",
        "incidents": [inc.model_dump(mode="json") for inc in state.incidents.values()],
        "stats": {
            "total_alerts": state.total_alert_count,
            "unique_alerts": state.unique_alert_count,
            "active_incidents": state.active_incident_count,
            "unclustered": state.unclustered_count,
            "compression_ratio": state.compression_ratio,
            "alerts_per_sec": round(state.current_alerts_per_sec(), 1),
            "replay": state.replay_status.model_dump(),
        },
    }
    try:
        await websocket.send_text(json.dumps(snapshot, default=str))
    except Exception:
        logger.exception("Failed to send snapshot to new WS client")
        state.active_ws.discard(websocket)
        return

    try:
        # Keep alive — client control goes through REST, not WS
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        state.active_ws.discard(websocket)
        logger.info("WS disconnected — total clients: %d", len(state.active_ws))
