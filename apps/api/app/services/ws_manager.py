from __future__ import annotations

import json
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class WebSocketManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def start_pubsub(self) -> None:
        return None

    async def stop_pubsub(self) -> None:
        self._connections.clear()

    async def connect(self, plan_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[str(plan_id)].add(websocket)

    def disconnect(self, plan_id: str, websocket: WebSocket) -> None:
        connections = self._connections.get(str(plan_id))
        if not connections:
            return
        connections.discard(websocket)
        if not connections:
            self._connections.pop(str(plan_id), None)

    async def broadcast(self, plan_id: str, message: dict[str, Any]) -> None:
        stale: list[WebSocket] = []
        for websocket in list(self._connections.get(str(plan_id), set())):
            try:
                await websocket.send_json(message)
            except RuntimeError:
                stale.append(websocket)
        for websocket in stale:
            self.disconnect(str(plan_id), websocket)

    async def broadcast_text(self, plan_id: str, message: str) -> None:
        try:
            payload = json.loads(message)
        except json.JSONDecodeError:
            payload = {"message": message}
        await self.broadcast(plan_id, payload)


ws_manager = WebSocketManager()
