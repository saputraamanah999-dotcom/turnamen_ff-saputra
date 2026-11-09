"""Pelacakan pemain yang di-spectate (konservatif, berbasis OCR HUD).

Menyimpan observasi {detectedPlayerName, detectedTeamName, detectionTime,
confidence, matchId, observationStatus} dan mendeteksi transisi target ->
kandidat event SPECTATOR_TARGET_CHANGED (previous, new, confidence).

Konservatif: transisi hanya dianggap sah setelah nama baru terbaca stabil
beberapa observasi berturut-turut dengan confidence memadai; OCR tidak
pernah mengarang nama (tidak jelas = "PEMAIN TIDAK DIKENAL").
"""
from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from typing import Deque, Dict, Optional

#: Tipe event transisi target.
EVENT_TYPE = "SPECTATOR_TARGET_CHANGED"

#: Jumlah observasi berturut-turut sebelum transisi dianggap sah.
STABLE_THRESHOLD = 2

#: Label fallback OCR untuk nama pemain.
UNKNOWN_LABEL = "PEMAIN TIDAK DIKENAL"

#: Batas memori riwayat observasi.
MAX_OBSERVATIONS = 200


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class PlayerTracker:
    """Simpan observasi HUD pemain & emisi transisi target spectator."""

    def __init__(self, min_confidence: float = 0.55) -> None:
        self.min_confidence = min_confidence
        self._observations: Deque[Dict] = deque(maxlen=MAX_OBSERVATIONS)
        self._stable_name: Optional[str] = None
        self._candidate_name: Optional[str] = None
        self._candidate_count: int = 0

    # -- status ----------------------------------------------------------
    @property
    def stable_name(self) -> Optional[str]:
        """Nama target stabil saat ini (None bila belum dikenal)."""
        return self._stable_name

    def observations(self) -> list:
        """Salinan riwayat observasi (terbaru di akhir)."""
        return list(self._observations)

    def latest_observation(self) -> Optional[Dict]:
        """Observasi terakhir (None bila kosong)."""
        return self._observations[-1] if self._observations else None

    # -- update per tick -------------------------------------------------
    def update(
        self,
        player_name: str,
        confidence: float,
        team_name: str = "",
        match_id: str = "",
    ) -> Optional[Dict]:
        """Catat satu observasi OCR; kembalikan payload transisi jika terjadi.

        Payload transisi: {previousTarget, newTarget, confidence, detectedAt}.
        Return None bila sinyal lemah (OCR tidak jelas / belum stabil).
        """
        known = (
            bool(player_name)
            and player_name != UNKNOWN_LABEL
            and confidence >= self.min_confidence
        )
        observation = {
            "detectedPlayerName": player_name if known else "",
            "detectedTeamName": team_name or "",
            "detectionTime": _now_iso(),
            "confidence": round(float(confidence), 3),
            "matchId": match_id,
            "observationStatus": "DETECTED" if known else "UNCERTAIN",
        }
        self._observations.append(observation)
        if not known:
            return None  # sinyal lemah: jangan ubah target (konservatif)

        if player_name == self._stable_name:
            self._candidate_name, self._candidate_count = None, 0
            return None
        if player_name == self._candidate_name:
            self._candidate_count += 1
        else:
            self._candidate_name, self._candidate_count = player_name, 1

        if self._candidate_count >= STABLE_THRESHOLD:
            previous = self._stable_name or ""
            self._stable_name = player_name
            self._candidate_name, self._candidate_count = None, 0
            return {
                "previousTarget": previous,
                "newTarget": player_name,
                "confidence": observation["confidence"],
                "detectedAt": observation["detectionTime"],
            }
        return None
