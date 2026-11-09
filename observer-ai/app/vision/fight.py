"""Aturan konservatif: sinyal visual -> kandidat event pertarungan.

Hanya menganalisis piksel hasil screen capture — tanpa akses memori game.
Semua keluaran bersifat "kemungkinan" dan dilengkapi confidence (0-1) serta
reason. Event berstatus ``pending`` dan tidak pernah mengubah skor resmi.

Tipe kandidat (per spesifikasi):
- POSSIBLE_ENGAGEMENT      : 1 perubahan kill feed (kontak kemungkinan)
- ELIMINATION_DETECTED     : kill feed berubah + target spectator baru berganti
- MULTIPLE_ELIMINATIONS    : >= 3 perubahan kill feed dalam jendela 10s
- POSSIBLE_TEAM_FIGHT      : 2+ perubahan cepat + perpindahan target
- QUIET_PERIOD             : tidak ada sinyal selama 20 detik (informatif)
"""
from __future__ import annotations

import time
from collections import deque
from typing import Deque, Optional, Tuple

WINDOW_S = 10.0         # jendela analisis eliminasi
QUIET_AFTER_S = 20.0    # tanpa sinyal selama ini -> QUIET_PERIOD
QUIET_COOLDOWN_S = 20.0 # jeda minimum antar QUIET_PERIOD
SIGNAL_MAX_AGE_S = 30.0 # sinyal lebih tua dari ini dibuang


class FightAnalyzer:
    """Gabungkan sinyal kill feed + perpindahan target menjadi kandidat event."""

    def __init__(self) -> None:
        self._kill_ts: Deque[float] = deque(maxlen=64)
        self._target_ts: Deque[float] = deque(maxlen=64)
        self._last_signal_ts: float = 0.0
        self._last_quiet_ts: float = 0.0

    # -- input sinyal ------------------------------------------------------
    def note_elimination(self, ts: Optional[float] = None) -> None:
        """Catat sinyal perubahan kill feed (kandidat eliminasi)."""
        stamp = time.time() if ts is None else ts
        self._kill_ts.append(stamp)
        self._last_signal_ts = stamp

    def note_target_change(self, ts: Optional[float] = None) -> None:
        """Catat sinyal perpindahan target spectator."""
        stamp = time.time() if ts is None else ts
        self._target_ts.append(stamp)
        self._last_signal_ts = stamp

    # -- analisis per tick -------------------------------------------------
    def _count_recent(self, stamps: Deque[float], now: float, window_s: float) -> int:
        return sum(1 for t in stamps if now - t <= window_s)

    def analyze(self) -> Optional[Tuple[str, float, str]]:
        """Kembalikan (type, confidence, reason) kandidat atau None.

        Urutan aturan sengaja dari yang paling spesifik (multi eliminasi)
        ke yang paling umum (tenang), agar tidak saling menutupi.
        """
        now = time.time()
        while self._kill_ts and now - self._kill_ts[0] > SIGNAL_MAX_AGE_S:
            self._kill_ts.popleft()
        while self._target_ts and now - self._target_ts[0] > SIGNAL_MAX_AGE_S:
            self._target_ts.popleft()

        kills10 = self._count_recent(self._kill_ts, now, WINDOW_S)
        kills6 = self._count_recent(self._kill_ts, now, 6.0)
        targets10 = self._count_recent(self._target_ts, now, WINDOW_S)

        if kills10 >= 3:
            return (
                "MULTIPLE_ELIMINATIONS",
                0.70,
                f"{kills10} perubahan kill feed dalam {WINDOW_S:.0f} detik; indikasi beberapa eliminasi berdekatan",
            )
        if kills6 >= 2 and targets10 >= 1:
            return (
                "POSSIBLE_TEAM_FIGHT",
                0.65,
                "2+ perubahan kill feed cepat disertai perpindahan target spectator; indikasi pertarungan tim",
            )
        if kills10 >= 1:
            if targets10 >= 1:
                return (
                    "ELIMINATION_DETECTED",
                    0.60,
                    "perubahan kill feed terdeteksi dan target spectator baru berganti; kemungkinan eliminasi",
                )
            return (
                "POSSIBLE_ENGAGEMENT",
                0.50,
                "perubahan kill feed terdeteksi; isi feed tidak terbaca sehingga hanya dianggap kemungkinan kontak",
            )
        if (
            now - self._last_signal_ts >= QUIET_AFTER_S
            and now - self._last_quiet_ts >= QUIET_COOLDOWN_S
        ):
            self._last_quiet_ts = now
            return (
                "QUIET_PERIOD",
                0.90,
                f"tidak ada sinyal visual pertarungan selama {QUIET_AFTER_S:.0f} detik terakhir",
            )
        return None
