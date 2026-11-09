"""Event bus lokal: pembuatan event, dedup 10 detik, ring buffer 500.

ATURAN: semua event berstatus ``pending`` dan TIDAK pernah mengubah skor
resmi pertandingan — konfirmasi/false-positive hanya penanda operator.
Semua data hidup di memori proses (tidak dikirim ke internet).
"""
from __future__ import annotations

import time
import uuid
from collections import deque
from datetime import datetime, timezone
from typing import Deque, Dict, List, Optional

#: Ukuran ring buffer (event terlama otomatis dibuang).
BUFFER_SIZE = 500
#: Jeda dedup: event tipe+target sama dalam jendela ini diabaikan.
DEDUP_WINDOW_S = 10.0
#: Umur maksimum entri dedup sebelum dibersihkan.
DEDUP_GC_S = 600.0

STATUS_PENDING = "pending"
STATUS_CONFIRMED = "confirmed"
STATUS_FALSE_POSITIVE = "false_positive"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class EventEngine:
    """Buffer event in-memory + dedup + riwayat status."""

    def __init__(self, buffer_size: int = BUFFER_SIZE, dedup_window_s: float = DEDUP_WINDOW_S) -> None:
        self._events: Deque[Dict] = deque(maxlen=buffer_size)
        self._last_emitted: Dict[str, float] = {}  # kunci dedup -> epoch detik
        self._dedup = float(dedup_window_s)

    # -- pembuatan ---------------------------------------------------------
    def create_event(
        self,
        event_type: str,
        match_id: str = "",
        confidence: float = 0.0,
        reason: str = "",
        player_name: Optional[str] = None,
        team_name: Optional[str] = None,
        extra: Optional[Dict] = None,
    ) -> Optional[Dict]:
        """Buat event {eventId, type, timestamp, ...} status ``pending``.

        Return None bila event serupa (tipe + pemain) muncul dalam jendela
        dedup 10 detik — mencegah spam di ring buffer.
        """
        now = time.time()
        key = f"{event_type}|{player_name or ''}"
        last = self._last_emitted.get(key)
        if last is not None and (now - last) < self._dedup:
            return None
        self._last_emitted[key] = now

        event: Dict = {
            "eventId": uuid.uuid4().hex[:12],
            "type": event_type,
            "timestamp": _now_iso(),
            "matchId": match_id,
            "confidence": round(min(max(float(confidence), 0.0), 1.0), 3),
            "reason": reason,
            "status": STATUS_PENDING,
        }
        if player_name:
            event["playerName"] = player_name
        if team_name:
            event["teamName"] = team_name
        if extra:
            event.update(extra)
        self._events.append(event)

        # GC ringan entri dedup yang sudah tua agar dict tumbuh terkendali
        for stale in [k for k, t in self._last_emitted.items() if now - t > DEDUP_GC_S]:
            self._last_emitted.pop(stale, None)
        return event

    # -- akses & status ------------------------------------------------------
    def get(self, event_id: str) -> Optional[Dict]:
        """Cari event berdasarkan eventId."""
        for event in self._events:
            if event["eventId"] == event_id:
                return event
        return None

    def set_status(self, event_id: str, status: str) -> Optional[Dict]:
        """Ubah status event (pending/confirmed/false_positive)."""
        event = self.get(event_id)
        if event is None:
            return None
        event["status"] = status
        if status == STATUS_CONFIRMED:
            event["confirmedAt"] = _now_iso()
        elif status == STATUS_FALSE_POSITIVE:
            event["falsePositiveAt"] = _now_iso()
        return event

    def confirm(self, event_id: str) -> Optional[Dict]:
        """Operator menandai event valid."""
        return self.set_status(event_id, STATUS_CONFIRMED)

    def mark_false_positive(self, event_id: str) -> Optional[Dict]:
        """Operator menandai event salah deteksi."""
        return self.set_status(event_id, STATUS_FALSE_POSITIVE)

    # -- history ---------------------------------------------------------------
    def history(self, limit: int = 100) -> List[Dict]:
        """Event terbaru -> terlama (default 100 terakhir dari ring buffer)."""
        items = list(self._events)
        if limit <= 0:
            limit = len(items) or 1
        return list(reversed(items[-limit:]))

    def count(self) -> int:
        """Jumlah event tersimpan saat ini."""
        return len(self._events)
