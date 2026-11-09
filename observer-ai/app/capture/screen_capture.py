"""Screen capture berbasis mss (membaca piksel layar yang terlihat).

TIDAK mengakses memori game, TIDAK menyuntik kode. Sesi ``mss`` dibuat dan
dipakai di thread yang sama (thread-affinity wajib untuk mss). Thread
background mengambil frame sesuai FPS sampling; frame resize agar hemat CPU.
"""
from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Sequence

import cv2
import mss
import numpy as np

#: Batas lebar frame hasil capture agar OCR/cv2 hemat CPU.
MAX_FRAME_WIDTH = 1280


def crop_region(frame: Optional[np.ndarray], region: Optional[Sequence[int]]) -> Optional[np.ndarray]:
    """Potong frame sesuai region [x, y, w, h]; None jika tidak valid."""
    if frame is None or region is None or len(region) != 4:
        return None
    x, y, w, h = (int(n) for n in region)
    fh, fw = frame.shape[:2]
    if w <= 0 or h <= 0 or x >= fw or y >= fh:
        return None
    crop = frame[max(0, y):min(y + h, fh), max(0, x):min(x + w, fw)]
    return crop if crop.size else None


class ScreenCapture:
    """Grab frame monitor di thread background dengan sampling sesuai FPS."""

    def __init__(self, fps: int = 1, monitor_index: int = 1, save_screenshots: bool = False) -> None:
        self.fps = max(1, int(fps))
        self.monitor_index = max(1, int(monitor_index))
        self.save_screenshots = bool(save_screenshots)
        self._interval = 1.0 / self.fps
        self._lock = threading.Lock()
        self._frame: Optional[np.ndarray] = None
        self._last_grab_ts: float = 0.0
        self._frame_count: int = 0
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._shot_dir = Path(__file__).resolve().parents[2] / "data" / "screenshots"

    # -- lifecycle ------------------------------------------------------
    def start(self) -> None:
        """Mulai thread capture (idempoten)."""
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="observer-capture", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        """Hentikan thread capture dengan rapi."""
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)
            self._thread = None

    # -- loop background -------------------------------------------------
    def _loop(self) -> None:
        # mss harus dibuat & digunakan di thread yang sama (thread-affinity).
        with mss.mss() as sct:
            while not self._stop.is_set():
                started = time.monotonic()
                try:
                    frame = self._grab(sct)
                except Exception:  # layar lock/switch monitor — coba lagi tick berikut
                    frame = None
                if frame is not None:
                    with self._lock:
                        self._frame = frame
                        self._last_grab_ts = time.time()
                        self._frame_count += 1
                # sampling sesuai fps (kompensasi durasi grab)
                delay = self._interval - (time.monotonic() - started)
                if delay > 0:
                    self._stop.wait(delay)

    def _grab(self, sct: "mss.base.MSSBase") -> Optional[np.ndarray]:
        """Grab satu frame monitor lalu resize (maks lebar 1280px)."""
        monitors = sct.monitors
        index = self.monitor_index if self.monitor_index < len(monitors) else 0
        raw = np.asarray(sct.grab(monitors[index]))  # BGRA
        frame = cv2.cvtColor(raw, cv2.COLOR_BGRA2BGR)
        height, width = frame.shape[:2]
        if width > MAX_FRAME_WIDTH:
            scale = MAX_FRAME_WIDTH / float(width)
            frame = cv2.resize(frame, (MAX_FRAME_WIDTH, int(height * scale)), interpolation=cv2.INTER_AREA)
        if self.save_screenshots:
            self._save(frame)
        return frame

    def _save(self, frame: np.ndarray) -> None:
        """Simpan frame opsional ke data/screenshots (lokal saja, tidak diunggah)."""
        try:
            self._shot_dir.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
            cv2.imwrite(str(self._shot_dir / f"frame-{stamp}.jpg"), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        except Exception:
            pass  # penyimpanan opsional — jangan ganggu loop capture

    # -- akses untuk pipeline --------------------------------------------
    def latest(self) -> Optional[np.ndarray]:
        """Frame terakhir yang berhasil diambil (None saat startup)."""
        with self._lock:
            return self._frame

    def last_frame_time(self) -> float:
        """Epoch detik frame terakhir."""
        with self._lock:
            return self._last_grab_ts

    def frame_count(self) -> int:
        """Total frame yang berhasil diambil sejak start."""
        with self._lock:
            return self._frame_count
