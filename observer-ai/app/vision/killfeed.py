"""Deteksi perubahan kill feed via hash visual (dhash) antar frame.

Region kill feed dikalibrasi admin. Hash 64-bit dibandingkan antar frame;
selisih hamming >= ambang dianggap "kill feed berubah" = kandidat sinyal
eliminasi. Pendekatan konservatif: hash hanya tahu ada PERUBAHAN visual,
bukan siapa yang tereliminasi — pengambilan keputusan ada di FightAnalyzer.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Dict, Optional

import cv2
import numpy as np

from app.capture.screen_capture import crop_region

HASH_SIZE = 8            # dhash 9x8 -> 64 bit
HASH_BITS = HASH_SIZE * HASH_SIZE
CHANGE_BITS = 6          # ambang hamming: >= 6/64 bit berubah
MIN_INTERVAL_S = 1.0     # debounce antar deteksi perubahan


def _dhash(gray: np.ndarray) -> int:
    """DHash sederhana: bandingkan intensitas piksel horizontal."""
    small = cv2.resize(gray, (HASH_SIZE + 1, HASH_SIZE), interpolation=cv2.INTER_AREA)
    diff = small[:, 1:] > small[:, :-1]
    bits = 0
    for row in diff:
        for value in row:
            bits = (bits << 1) | int(bool(value))
    return bits


def _hamming(a: int, b: int) -> int:
    """Jarak hamming dua hash 64-bit."""
    return bin(a ^ b).count("1")


class KillFeedWatcher:
    """Bandingkan hash region kill feed antar frame berurutan."""

    def __init__(self) -> None:
        self._last_hash: Optional[int] = None
        self._last_change_ts: float = 0.0

    def update(self, frame: Optional[np.ndarray], region) -> Optional[Dict]:
        """Kembalikan dict perubahan jika kill feed tampak berubah, selain itu None.

        Dict: {changedAt, hammingBits, similarity}. None bila region tidak
        valid atau tidak ada perubahan di atas ambang.
        """
        crop = crop_region(frame, region)
        if crop is None:
            return None
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        digest = _dhash(gray)
        changed: Optional[Dict] = None
        if self._last_hash is not None:
            bits = _hamming(digest, self._last_hash)
            now = time.time()
            if bits >= CHANGE_BITS and (now - self._last_change_ts) >= MIN_INTERVAL_S:
                self._last_change_ts = now
                changed = {
                    "changedAt": datetime.now(timezone.utc).isoformat(),
                    "hammingBits": bits,
                    "similarity": round(1.0 - bits / float(HASH_BITS), 3),
                }
        self._last_hash = digest
        return changed
