"""Monitor minimap (EKSPERIMENTAL).

Deteksi marker sederhana via contour OpenCV pada region minimap yang
dikalibrasi. Path yang dihasilkan SELALU APPROXIMATE dengan confidence
rendah + lastUpdate. Bila region belum dikalibrasi atau marker tidak dapat
diidentifikasi -> "MINIMAP TIDAK DAPAT DITAFSIRKAN". Tidak reliable untuk
keputusan resmi — hanya bantu visual operator.
"""
from __future__ import annotations

import time
from collections import deque
from datetime import datetime, timezone
from typing import Deque, Dict, List, Optional

import cv2
import numpy as np

from app.capture.screen_capture import crop_region

UNKNOWN_STATUS = "MINIMAP TIDAK DAPAT DITAFSIRKAN"
MAX_PATH_POINTS = 30          # riwayat titik jalur APPROXIMATE
MIN_MARKER_AREA_RATIO = 0.0008   # filter noise kecil (fraksi area region)
MAX_MARKER_AREA_RATIO = 0.05     # buang blob besar (bukan marker)
MIN_CONFIDENCE_CAP = 0.60       # confidence maksimal tetap rendah (eksperimental)


class MinimapMonitor:
    """Perkiraan posisi marker minimap (piksel) — bukan data posisi resmi."""

    def __init__(self) -> None:
        self._path: Deque[Dict[str, float]] = deque(maxlen=MAX_PATH_POINTS)
        self._last_update: float = 0.0
        self._last_confidence: float = 0.0

    # -- helper -------------------------------------------------------------
    @staticmethod
    def _detect_markers(crop: np.ndarray) -> List[Dict[str, float]]:
        """Deteksi kontur menyerupai marker (bulat, area sedang) -> titik ternormalisasi."""
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blur, 60, 160)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        region_area = float(gray.shape[0] * gray.shape[1])
        height, width = gray.shape[:2]
        markers: List[Dict[str, float]] = []
        for contour in contours:
            area = float(cv2.contourArea(contour))
            if area < region_area * MIN_MARKER_AREA_RATIO or area > region_area * MAX_MARKER_AREA_RATIO:
                continue
            perimeter = cv2.arcLength(contour, True)
            circularity = (4.0 * np.pi * area / (perimeter * perimeter)) if perimeter > 0 else 0.0
            if not 0.35 <= circularity <= 1.30:
                continue  # marker diasumsikan menyerupai lingkaran
            moments = cv2.moments(contour)
            if moments["m00"] == 0:
                continue
            markers.append({
                "x": round(moments["m10"] / moments["m00"] / width, 3),   # normalisasi 0..1
                "y": round(moments["m01"] / moments["m00"] / height, 3),
            })
        return markers

    def _base_result(self) -> Dict:
        """Kerangka hasil (dipakai untuk jalur gagal & sukses)."""
        return {
            "status": UNKNOWN_STATUS,
            "approximate": True,   # semua hasil selalu perkiraan
            "path": list(self._path),
            "confidence": round(self._last_confidence, 3),
            "lastUpdate": (
                datetime.fromtimestamp(self._last_update, timezone.utc).isoformat()
                if self._last_update else ""
            ),
        }

    # -- API utama ------------------------------------------------------------
    def analyze(self, frame: Optional[np.ndarray], region) -> Dict:
        """Analisis frame -> status minimap (APPROXIMATE / tidak dapat ditafsirkan)."""
        crop = crop_region(frame, region)
        if crop is None:
            return {**self._base_result(), "reason": "region minimap belum dikalibrasi"}

        try:
            markers = self._detect_markers(crop)
        except Exception:
            markers = []  # kegagalan cv2 tidak boleh menggagalkan pipeline

        if not markers:
            self._last_confidence = 0.0
            return {
                **self._base_result(),
                "reason": "tidak ada marker yang dapat diidentifikasi secara stabil",
            }

        # pilih marker terdekat dengan titik jalur terakhir agar jalur kontinu
        if self._path:
            last = self._path[-1]
            markers.sort(key=lambda m: (m["x"] - last["x"]) ** 2 + (m["y"] - last["y"]) ** 2)
        self._path.append(markers[0])
        self._last_update = time.time()
        # confidence sengaja rendah: modul eksperimental, tidak reliable
        self._last_confidence = min(MIN_CONFIDENCE_CAP, 0.25 + 0.05 * len(markers))
        return {
            "status": "APPROXIMATE",
            "approximate": True,
            "path": list(self._path),
            "confidence": round(self._last_confidence, 3),
            "lastUpdate": datetime.fromtimestamp(self._last_update, timezone.utc).isoformat(),
            "markers": len(markers),
            "reason": "posisi adalah perkiraan kontur marker piksel; tidak untuk keputusan resmi",
        }
