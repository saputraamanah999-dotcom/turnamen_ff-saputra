"""Aplikasi FastAPI STIKAR AI OBSERVER + pipeline analisis frame.

Arsitektur:
- thread capture (mss) mengambil frame sesuai FPS;
- asyncio background task (lifespan) menjalankan pipeline per tick:
  OCR HUD -> tracker -> kill feed hash -> aturan pertarungan -> minimap,
  event masuk ring buffer (dedup 10s) lalu broadcast WS + rekomendasi.

Semua pemrosesan lokal & gratis — tanpa GPU, tanpa API berbayar, tanpa
mengunggah frame ke internet.
"""
from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

import cv2
import psutil
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import routes, websocket
from app.capture.screen_capture import ScreenCapture
from app.config import apply_calibration, get_settings
from app.events.engine import EventEngine
from app.maps.recognizer import MapRecognizer
from app.minimap.monitor import MinimapMonitor
from app.ocr.reader import OCRReader, PLAYER_UNKNOWN
from app.recommendations.engine import RecommendationEngine
from app.tracking.player_tracker import EVENT_TYPE, PlayerTracker
from app.vision.fight import FightAnalyzer
from app.vision.killfeed import KillFeedWatcher

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
LOGGER = logging.getLogger("observer")


# ---------------------------------------------------------------------------
# Pipeline analisis (dipanggil per tick oleh asyncio task)
# ---------------------------------------------------------------------------
def _emit(app: FastAPI, event: Dict) -> None:
    """Teruskan event: rekomendasi + broadcast WS (+ screenshot opsional)."""
    state = app.state
    rec = state.recommendations.ingest(event)
    if rec:
        event["recommendationId"] = rec["recommendationId"]
    if state.settings.save_screenshots:
        try:
            state.screenshot_dir.mkdir(parents=True, exist_ok=True)
            frame = state.capture.latest()
            if frame is not None:
                stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
                path = state.screenshot_dir / f"event-{event['eventId']}-{stamp}.jpg"
                # bukti lokal saja — tidak pernah diunggah ke internet
                cv2.imwrite(str(path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        except Exception:
            LOGGER.exception("Gagal menyimpan screenshot event (diabaikan)")
    # broadcast async dari konteks sinkron (kita berada di event loop utama)
    asyncio.get_running_loop().create_task(websocket.manager.broadcast(event))


def _analyze_once(app: FastAPI) -> None:
    """Satu tick analisis: frame terakhir -> OCR/tracker/killfeed/fight/minimap."""
    state = app.state
    frame = state.capture.latest()
    if frame is None:
        return  # capture thread belum menghasilkan frame
    state.frames_analyzed += 1
    state.last_frame_time = datetime.now(timezone.utc).isoformat()

    settings = state.settings
    # power save: bila CPU di atas threshold, lewati langkah OCR/vision berat
    power_save = psutil.cpu_percent(interval=None) >= settings.cpu_threshold
    regions = settings.regions
    match_id = state.active_match_id

    # 1) OCR nama pemain + tim, lalu tracker (deteksi transisi target)
    player_name, player_conf = PLAYER_UNKNOWN, 0.0
    team_name = ""
    if not power_save:
        player_region = regions.get("player_hud")
        if player_region:
            player_name, player_conf = state.ocr.read_text(frame, player_region)
        team_region = regions.get("team_hud")
        if team_region:
            team_name, _ = state.ocr.read_text(frame, team_region, fallback="")

    transition = state.tracker.update(player_name, player_conf, team_name=team_name, match_id=match_id)
    if transition:
        event = state.events.create_event(
            event_type=EVENT_TYPE,
            match_id=match_id,
            confidence=transition["confidence"],
            reason=(
                f"target spectator berganti: "
                f"'{transition['previousTarget'] or 'TIDAK DIKENAL'}' -> '{transition['newTarget']}'"
            ),
            player_name=transition["newTarget"],
            team_name=team_name or None,
            extra={"previousTarget": transition["previousTarget"], "newTarget": transition["newTarget"]},
        )
        if event:
            state.fight.note_target_change()
            _emit(app, event)

    # 2) Pengenalan map (status saja, bukan event)
    map_region = regions.get("map_name")
    if not power_save and map_region:
        state.map_status = state.maps.recognize(frame, map_region)

    # 3) Kill feed hash -> sinyal kandidat eliminasi
    feed_change = state.killfeed.update(frame, regions.get("killfeed"))
    if feed_change:
        state.fight.note_elimination()

    # 4) Aturan pertarungan konservatif -> event kandidat
    candidate: Optional[tuple] = state.fight.analyze()
    if candidate:
        event_type, confidence, reason = candidate
        event = state.events.create_event(
            event_type=event_type, match_id=match_id, confidence=confidence, reason=reason
        )
        if event:
            _emit(app, event)

    # 5) Minimap eksperimental (status saja)
    if not power_save:
        state.minimap_status = state.minimap.analyze(frame, regions.get("minimap"))


async def _analysis_loop(app: FastAPI) -> None:
    """Background task: jalankan pipeline sesuai FPS sampai shutdown."""
    state = app.state
    settings = state.settings
    interval = 1.0 / float(settings.fps)
    LOGGER.info(
        "Loop analisis dimulai (fps=%s, power-save di cpu>=%s%%)",
        settings.fps, settings.cpu_threshold,
    )
    try:
        while state.running:
            started = time.monotonic()
            try:
                _analyze_once(app)
            except Exception:
                LOGGER.exception("Pipeline analisis gagal pada satu tick (diabaikan)")
            state.latency_ms = (time.monotonic() - started) * 1000.0
            elapsed = time.monotonic() - started
            await asyncio.sleep(max(0.05, interval - elapsed))
    except asyncio.CancelledError:
        LOGGER.info("Loop analisis dihentikan")
        raise


# ---------------------------------------------------------------------------
# Lifespan & aplikasi
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: muat konfigurasi, mulai capture + loop analisis; shutdown rapi."""
    settings = get_settings()
    apply_calibration(settings)  # muat calibration.json bila ada

    state = app.state
    state.settings = settings
    state.ocr = OCRReader()
    state.capture = ScreenCapture(
        fps=settings.fps,
        monitor_index=settings.monitor_index,
        save_screenshots=False,  # screenshot per-frame dinonaktifkan; event opsional
    )
    state.tracker = PlayerTracker()
    state.killfeed = KillFeedWatcher()
    state.fight = FightAnalyzer()
    state.maps = MapRecognizer(state.ocr)
    state.minimap = MinimapMonitor()
    state.events = EventEngine()
    state.recommendations = RecommendationEngine(state.events)
    state.active_match_id = ""
    state.activated_at = ""
    state.map_status = {"status": "Unknown", "message": "belum ada analisis"}
    state.minimap_status = {"status": "belum ada analisis"}
    state.last_frame_time = ""
    state.latency_ms = 0.0
    state.frames_analyzed = 0
    state.started_at = time.time()
    state.running = True
    state.screenshot_dir = Path(__file__).resolve().parent.parent / "data" / "screenshots"

    if not state.ocr.available:
        LOGGER.warning("OCR tidak tersedia — observer jalan dengan mode terbatas")
    state.capture.start()
    task = asyncio.create_task(_analysis_loop(app))
    LOGGER.info("STIKAR AI OBSERVER aktif di http://%s:%s (docs: /docs)", settings.host, settings.port)
    try:
        yield
    finally:
        state.running = False
        task.cancel()
        state.capture.stop()
        LOGGER.info("Observer dimatikan dengan rapi")


def create_app() -> FastAPI:
    """Rakit aplikasi FastAPI + middleware + router."""
    app = FastAPI(
        title="STIKAR AI OBSERVER",
        version="1.0.0",
        description="Observer AI lokal (screen capture + OCR offline) untuk turnamen Free Fire.",
        lifespan=lifespan,
    )
    # CORS terbatas ke origin localhost agar dashboard lokal tetap bisa konsumsi API
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(routes.router)
    app.include_router(websocket.router)
    return app


app = create_app()
