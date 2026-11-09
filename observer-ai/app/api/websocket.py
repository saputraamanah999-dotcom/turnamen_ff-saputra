"""WebSocket /ws — broadcast event realtime ke dashboard operator lokal.

Daftar klien aktif disimpan di memori; pesan dari klien hanya dianggap
keepalive (tidak diproses). Broadcast aman dari thread loop analisis via
``asyncio.create_task`` pada event loop utama.
"""
from __future__ import annotations

from typing import Dict, List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


class ConnectionManager:
    """Kumpulan klien WS lokal + broadcast JSON."""

    def __init__(self) -> None:
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        """Terima koneksi baru (accept + daftarkan)."""
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        """Buang klien dari daftar aktif."""
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, payload: Dict) -> None:
        """Kirim payload JSON ke semua klien; klien mati dibersihkan."""
        dead: List[WebSocket] = []
        for ws in list(self.active):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


#: Singleton manajer koneksi (dipakai routes & pipeline analisis).
manager = ConnectionManager()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    """Endpoint WS: client terima broadcast event realtime."""
    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()  # keepalive; pesan klien diabaikan
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(ws)
