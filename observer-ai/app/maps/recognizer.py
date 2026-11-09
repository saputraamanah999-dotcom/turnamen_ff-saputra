"""Pengenalan nama map: OCR region map_name + katalog lokal catalog.json.

Status hasil: Confirmed / Probable / Unknown (fuzzy match lokal via difflib,
tanpa API eksternal). Bila tidak yakin -> label "MAP TIDAK DIKENAL DENGAN
YAKIN" — tidak menebak-nebak.
"""
from __future__ import annotations

import difflib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from app.capture.screen_capture import crop_region
from app.ocr.reader import OCRReader

LOGGER = logging.getLogger("observer.maps")

CATALOG_PATH = Path(__file__).resolve().parents[2] / "catalog.json"
CONFIRMED_THRESHOLD = 0.85   # rasio kemiripan minimum untuk status Confirmed
PROBABLE_THRESHOLD = 0.60    # di bawah ini dianggap Unknown
MAP_UNKNOWN = "MAP TIDAK DIKENAL DENGAN YAKIN"
OCR_MIN_CONFIDENCE = 0.50


def _load_catalog(path: Path) -> List[Dict]:
    """Muat katalog map dari JSON lokal; katalog kosong aman untuk runtime."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return list(data.get("maps", []))
    except (OSError, json.JSONDecodeError) as exc:
        LOGGER.warning("catalog.json tidak dapat dimuat (%s): %s", path, exc)
        return []


class MapRecognizer:
    """OCR nama map -> cocokkan ke katalog -> status kepercayaan."""

    def __init__(self, ocr: OCRReader, catalog_path: Path = CATALOG_PATH) -> None:
        self._ocr = ocr
        self.catalog = _load_catalog(catalog_path)
        self._entries: List[Dict] = [
            {
                "name": str(item.get("name", "")).upper(),
                "regionHint": str(item.get("regionHint", "")),
                "aliases": [str(a).upper() for a in item.get("aliases", [])],
            }
            for item in self.catalog
            if item.get("name")
        ]

    # -- pencocokan ------------------------------------------------------
    def _best_match(self, text: str) -> tuple:
        """Cari kandidat katalog paling mirip; kembalikan (nama, rasio 0-1)."""
        best_name, best_ratio = None, 0.0
        for entry in self._entries:
            for candidate in [entry["name"], *entry["aliases"]]:
                if not candidate:
                    continue
                ratio = difflib.SequenceMatcher(None, text, candidate).ratio()
                if candidate in text:
                    # bonus substring: HUD sering menghias nama map dengan ikon/simbol
                    ratio = max(ratio, 0.92)
                if ratio > best_ratio:
                    best_name, best_ratio = entry["name"], ratio
        return best_name, best_ratio

    def _entry(self, name: str) -> Dict:
        for entry in self._entries:
            if entry["name"] == name:
                return entry
        return {"name": name, "regionHint": "", "aliases": []}

    # -- API utama ---------------------------------------------------------
    def recognize(self, frame, region) -> Dict:
        """Analisis frame -> status map {matchedName, status, confidence, ...}."""
        now = datetime.now(timezone.utc).isoformat()
        base: Dict = {
            "matchedName": None,
            "status": "Unknown",
            "confidence": 0.0,
            "regionHint": "",
            "checkedAt": now,
            "message": MAP_UNKNOWN,
            "reason": "",
        }
        if region is None:
            return {**base, "reason": "region map_name belum dikalibrasi"}
        if not self._entries:
            return {**base, "reason": "katalog map kosong (catalog.json tidak terbaca)"}

        text, ocr_conf = self._ocr.read_text(
            frame, region, min_confidence=OCR_MIN_CONFIDENCE, fallback=""
        )
        clean = "".join(ch for ch in text.upper() if ch.isalnum() or ch.isspace()).strip()
        if not clean:
            return {**base, "reason": "nama map tidak terbaca dari HUD (OCR kosong/lemas)"}

        best_name, ratio = self._best_match(clean)
        if best_name is None or ratio < PROBABLE_THRESHOLD:
            return {**base, "reason": f"teks '{clean}' tidak cocok dengan katalog map"}

        status = "Confirmed" if ratio >= CONFIRMED_THRESHOLD else "Probable"
        message = ""
        if status == "Probable":
            message = f"kemungkinan besar {best_name} (cocok sebagian, mohon verifikasi manual)"
        return {
            "matchedName": best_name,
            "status": status,
            "confidence": round(min(ratio, 1.0) * min(max(ocr_conf, 0.6), 1.0), 3),
            "regionHint": self._entry(best_name)["regionHint"],
            "checkedAt": now,
            "message": message,
            "reason": f"OCR '{clean}' cocok dengan katalog (rasio {ratio:.2f})",
        }
