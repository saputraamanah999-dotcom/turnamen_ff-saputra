"""Konfigurasi STIKAR AI OBSERVER (pydantic-settings).

Semua nilai bisa dioverride lewat environment variable berprefix ``OBSERVER_``
(contoh: ``OBSERVER_PORT=8077``, ``OBSERVER_FPS=2``) atau file ``.env`` di
folder proyek. Default bind ``127.0.0.1`` — service localhost-only, tidak ada
API eksternal berbayar, tidak ada akses memori game.
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

LOGGER = logging.getLogger("observer.config")

#: Akar proyek (folder ``observer-ai/``).
BASE_DIR: Path = Path(__file__).resolve().parent.parent

#: Pilihan FPS sampling yang diizinkan (hemat CPU, tanpa GPU).
ALLOWED_FPS: List[int] = [1, 2, 5]

#: Region HUD default [x, y, w, h] — koordinat pada frame hasil capture
#: (lebar dibatasi 1280px). Anggap kalibrasi awal untuk frame 1280x720.
DEFAULT_REGIONS: Dict[str, List[int]] = {
    "player_hud": [24, 88, 420, 60],
    "team_hud": [24, 152, 420, 44],
    "map_name": [24, 24, 320, 40],
    "killfeed": [920, 88, 344, 220],
    "minimap": [880, 420, 200, 200],
}


class Settings(BaseSettings):
    """Pengaturan layanan observer (semua pemrosesan lokal & gratis)."""

    model_config = SettingsConfigDict(
        env_prefix="OBSERVER_",
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    host: str = "127.0.0.1"
    port: int = 8077
    fps: int = 1                     # pilihan valid: 1 / 2 / 5
    monitor_index: int = 1           # index monitor mss (1 = monitor utama)
    regions: Dict[str, List[int]] = Field(default_factory=lambda: dict(DEFAULT_REGIONS))
    save_screenshots: bool = False   # jika True: frame saat event disimpan lokal (tidak diunggah)
    cpu_threshold: float = 85.0      # % CPU; di atas ini langkah OCR/berat dilewati (power save)

    @field_validator("fps")
    @classmethod
    def _valid_fps(cls, value: int) -> int:
        """Batasi FPS ke pilihan hemat CPU: 1, 2, atau 5."""
        if value not in ALLOWED_FPS:
            raise ValueError(f"FPS hanya boleh salah satu dari {ALLOWED_FPS}")
        return value

    @field_validator("regions")
    @classmethod
    def _valid_regions(cls, value: Dict[str, List[int]]) -> Dict[str, List[int]]:
        """Validasi tiap region berupa [x, y, w, h] dengan w/h > 0."""
        for name, rect in value.items():
            if (
                not isinstance(rect, (list, tuple))
                or len(rect) != 4
                or any(not isinstance(n, int) or n < 0 for n in rect)
                or rect[2] == 0
                or rect[3] == 0
            ):
                raise ValueError(f"Region '{name}' harus [x, y, w, h] dengan w/h > 0")
        return value


def load_calibration_file(path: Optional[Path] = None) -> Dict[str, List[int]]:
    """Baca ``calibration.json`` (jika ada) menjadi dict region -> [x, y, w, h].

    Menerima bentuk region objek ``{"x":..,"y":..,"w":..,"h":..}`` maupun
    list ``[x, y, w, h]``. File rusak/absen dikembalikan kosong (aman).
    """
    target = path or (BASE_DIR / "calibration.json")
    if not target.exists():
        return {}
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        LOGGER.warning("calibration.json tidak dapat dibaca: %s", target)
        return {}
    raw = data.get("regions", data) if isinstance(data, dict) else {}
    out: Dict[str, List[int]] = {}
    for name, rect in (raw or {}).items():
        if isinstance(rect, dict):
            rect = [rect.get("x", 0), rect.get("y", 0), rect.get("w", 0), rect.get("h", 0)]
        if isinstance(rect, (list, tuple)) and len(rect) == 4:
            try:
                out[str(name)] = [max(0, int(n)) for n in rect]
            except (TypeError, ValueError):
                continue
    return out


def apply_calibration(settings: Settings, path: Optional[Path] = None) -> int:
    """Muat calibration.json ke settings runtime; kembalikan jumlah region."""
    merged = load_calibration_file(path)
    if merged:
        settings.regions.update(merged)
        LOGGER.info("Kalibrasi dimuat: %s region", len(merged))
    return len(merged)


@lru_cache
def get_settings() -> Settings:
    """Singleton settings (cache proses)."""
    return Settings()
