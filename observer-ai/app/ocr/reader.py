"""OCR lokal & gratis via rapidocr-onnxruntime (offline, tanpa API berbayar).

Import engine dibungkus try/except: bila paket tidak terpasang, observer
tetap berjalan dengan status "OCR tidak tersedia". Prinsip penting: OCR
TIDAK PERNAH mengarang nama — teks yang tidak jelas menjadi label
"PEMAIN TIDAK DIKENAL".
"""
from __future__ import annotations

import logging
from typing import Optional, Sequence, Tuple

import cv2
import numpy as np

from app.capture.screen_capture import crop_region

LOGGER = logging.getLogger("observer.ocr")

#: Fallback saat paket OCR gagal diimport / gagal init.
try:
    from rapidocr_onnxruntime import RapidOCR
    _RapidOCRCls: Optional[type] = RapidOCR
except Exception as exc:  # pragma: no cover - tergantung lingkungan
    _RapidOCRCls = None
    LOGGER.warning("rapidocr-onnxruntime tidak tersedia, OCR dimatikan: %s", exc)

PLAYER_UNKNOWN = "PEMAIN TIDAK DIKENAL"
DEFAULT_MIN_CONFIDENCE = 0.55


class OCRReader:
    """Pembungkus RapidOCR; fungsi utama ``read_text(frame, region)``."""

    def __init__(self) -> None:
        self._engine = _RapidOCRCls() if _RapidOCRCls is not None else None

    @property
    def available(self) -> bool:
        """True bila engine OCR siap dipakai."""
        return self._engine is not None

    # -- pra-proses ------------------------------------------------------
    @staticmethod
    def _preprocess(crop: np.ndarray) -> np.ndarray:
        """Perbesar crop kecil agar huruf HUD lebih mudah dibaca."""
        height, width = crop.shape[:2]
        if height < 32 or width < 64:
            scale = max(2.0, 32.0 / max(1, height))
            crop = cv2.resize(crop, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_CUBIC)
        return crop

    # -- OCR mentah ------------------------------------------------------
    def read_raw(self, frame: Optional[np.ndarray], region: Optional[Sequence[int]] = None) -> Tuple[str, float]:
        """OCR tanpa fallback label; kembalikan (teks gabungan, confidence rata-rata)."""
        if self._engine is None or frame is None:
            return "", 0.0
        crop = frame if region is None else crop_region(frame, region)
        if crop is None:
            return "", 0.0
        try:
            output = self._engine(self._preprocess(crop))
            # rapidocr 1.x mengembalikan (result, elapse); versi lain bisa list saja.
            result = output[0] if isinstance(output, tuple) else output
        except Exception as exc:
            LOGGER.debug("OCR gagal memproses frame: %s", exc)
            return "", 0.0
        if not result:
            return "", 0.0
        texts, scores = [], []
        for item in result:
            # format item RapidOCR: [box, text, score]
            try:
                text = str(item[1]).strip()
                score = float(item[2])
            except (IndexError, TypeError, ValueError):
                continue
            if text:
                texts.append(text)
                scores.append(score)
        if not texts:
            return "", 0.0
        confidence = sum(scores) / len(scores) if scores else 0.0
        return " ".join(texts), round(min(max(confidence, 0.0), 1.0), 3)

    # -- API utama -------------------------------------------------------
    def read_text(
        self,
        frame: Optional[np.ndarray],
        region: Optional[Sequence[int]] = None,
        *,
        min_confidence: float = DEFAULT_MIN_CONFIDENCE,
        fallback: str = PLAYER_UNKNOWN,
    ) -> Tuple[str, float]:
        """OCR region -> (text, confidence); tidak jelas -> ``fallback``.

        Default fallback adalah "PEMAIN TIDAK DIKENAL" (sesuai spesifikasi).
        Pemanggil lain (mis. recognizer map) bisa memberi fallback berbeda.
        """
        text, confidence = self.read_raw(frame, region)
        if not text or confidence < min_confidence:
            return (fallback, confidence if text else 0.0)
        return text, confidence
