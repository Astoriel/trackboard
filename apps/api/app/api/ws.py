"""
WebSocket endpoint — streams live validation events to dashboards.
"""
from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.ws_manager import ws_manager

ws_router = APIRouter()


@ws_router.websocket("/ws/live/{plan_id}")
async def live_validation_feed(plan_id: str, websocket: WebSocket):
    """
    Connect to real-time validation results for a plan.

    Client receives JSON messages:
    {
      "event": "signup_completed",
      "valid": true,
      "errors": [],
      "validated_at": "2026-03-19T..."
    }
    """
    await ws_manager.connect(plan_id, websocket)
    try:
        # Keep connection alive — client can send pings
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(plan_id, websocket)
