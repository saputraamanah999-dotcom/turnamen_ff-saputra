"""REST API lokal STIKAR AI OBSERVER (bind 127.0.0.1 — tidak diekspos).

Semua endpoint ringan; komponen pipeline diambil dari ``request.app.state``
yang diisi lifespan di ``app/main.py``.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

import psutil
from fastapi import APIRouter, HTTPException, Request

from app.models.schemas import CalibrationUpdate, MatchActivateRequest

router = APIRouter()

#: File kalibrasi persisten di akar proyek (observer-ai/calibration.json).
CALIBRATION_FILE = Path(__file__).resolve().parents[2] / "calibration.json"


def _state(request: Request) -> Any:
    """Akses state aplikasi yang diisi lifespan."""
    return request.app.state


# ---------------------------------------------------------------------------
# Dasar
# ---------------------------------------------------------------------------
@router.get("/health")
async def health(request: Request) -> Dict[str, Any]:
    """Indikator layanan hidup."""
    st = _state(request)
    return {
        "status": "ok",
        "service": "STIKAR AI OBSERVER",
        "time": datetime.now(timezone.utc).isoformat(),
        "activeMatchId": getattr(st, "active_match_id", ""),
    }


@router.get("/status")
async def status(request: Request) -> Dict[str, Any]:
    """Status runtime: cpu, memory, fps, lastFrameTime, latency, ocrAvailable, dll."""
    st = _state(request)
    cpu = psutil.cpu_percent(interval=None)
    return {
        "cpu": cpu,
        "memory": psutil.virtual_memory().percent,
        "cpuThreshold": st.settings.cpu_threshold,
        "powerSave": cpu >= st.settings.cpu_threshold,
        "fps": st.settings.fps,
        "lastFrameTime": st.last_frame_time,
        "latencyMs": round(st.latency_ms, 1),
        "framesCaptured": st.capture.frame_count(),
        "framesAnalyzed": st.frames_analyzed,
        "ocrAvailable": st.ocr.available,
        "trackedPlayer": st.tracker.stable_name,
        "mapStatus": st.map_status,
        "minimapStatus": st.minimap_status,
        "activeMatchId": st.active_match_id,
        "uptimeSeconds": round(time.time() - st.started_at, 1),
    }


# ---------------------------------------------------------------------------
# Event
# ---------------------------------------------------------------------------
@router.get("/events")
async def list_events(request: Request, limit: int = 50) -> Dict[str, Any]:
    """Riwayat event (terbaru dulu) dari ring buffer."""
    events = _state(request).events.history(limit)
    return {"count": len(events), "events": events}


@router.post("/events/{event_id}/confirm")
async def confirm_event(request: Request, event_id: str) -> Dict[str, Any]:
    """Operator menandai event valid (pending -> confirmed)."""
    event = _state(request).events.confirm(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event tidak ditemukan")
    return event


@router.post("/events/{event_id}/false-positive")
async def false_positive_event(request: Request, event_id: str) -> Dict[str, Any]:
    """Operator menandai event salah deteksi (pending -> false_positive)."""
    event = _state(request).events.mark_false_positive(event_id)
    if event is None:
        raise HTTPException(status_code=404, detail="Event tidak ditemukan")
    return event


# ---------------------------------------------------------------------------
# Rekomendasi
# ---------------------------------------------------------------------------
@router.get("/recommendations")
async def list_recommendations(request: Request) -> Dict[str, Any]:
    """Rekomendasi target tontonan aktif, urut rank/skor tertinggi."""
    recs = _state(request).recommendations.list()
    return {"count": len(recs), "recommendations": recs}


@router.post("/recommendations/{recommendation_id}/dismiss")
async def dismiss_recommendation(request: Request, recommendation_id: str) -> Dict[str, Any]:
    """Operator menolak rekomendasi (action -> DISMISS)."""
    rec = _state(request).recommendations.dismiss(recommendation_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="Rekomendasi tidak ditemukan")
    return rec


# ---------------------------------------------------------------------------
# Match & kalibrasi
# ---------------------------------------------------------------------------
@router.post("/match/activate")
async def activate_match(request: Request, payload: MatchActivateRequest) -> Dict[str, Any]:
    """Aktifkan matchId — semua event/observasi baru ditag dengan id ini."""
    st = _state(request)
    st.active_match_id = payload.matchId.strip()
    st.activated_at = datetime.now(timezone.utc).isoformat()
    return {"activeMatchId": st.active_match_id, "activatedAt": st.activated_at}


@router.get("/calibration")
async def get_calibration(request: Request) -> Dict[str, Any]:
    """Lihat region kalibrasi aktif + status file calibration.json."""
    st = _state(request)
    regions = {
        name: {"x": rect[0], "y": rect[1], "w": rect[2], "h": rect[3]}
        for name, rect in st.settings.regions.items()
    }
    return {
        "regions": regions,
        "file": str(CALIBRATION_FILE),
        "fileExists": CALIBRATION_FILE.exists(),
        "hint": (
            "Koordinat [x, y, w, h] pada frame hasil capture (lebar maksimum 1280px). "
            "Salin calibration.example.json -> calibration.json atau POST region baru."
        ),
    }


@router.post("/calibration")
async def update_calibration(request: Request, payload: CalibrationUpdate) -> Dict[str, Any]:
    """Perbarui region kalibrasi runtime + simpan ke calibration.json."""
    st = _state(request)
    updated = {name: [r.x, r.y, r.w, r.h] for name, r in payload.regions.items()}
    st.settings.regions.update(updated)
    document = {
        "regions": {
            name: {"x": r.x, "y": r.y, "w": r.w, "h": r.h}
            for name, r in payload.regions.items()
        }
    }
    try:
        CALIBRATION_FILE.write_text(
            json.dumps(document, indent=2, ensure_ascii=False), encoding="utf-8"
        )
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Gagal menyimpan calibration.json: {exc}") from exc
    return {
        "updatedRegions": sorted(updated),
        "regions": st.settings.regions,
        "file": str(CALIBRATION_FILE),
    }
