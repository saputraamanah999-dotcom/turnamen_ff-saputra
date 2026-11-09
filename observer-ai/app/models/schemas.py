"""Skema pydantic: kontrak request/response API ZEROID AI OBSERVER."""
from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Request body
# ---------------------------------------------------------------------------
class RegionRect(BaseModel):
    """Region layar [x, y, w, h] pada frame hasil capture (maks lebar 1280px)."""

    x: int = Field(ge=0, description="offset X kiri")
    y: int = Field(ge=0, description="offset Y atas")
    w: int = Field(gt=0, description="lebar region")
    h: int = Field(gt=0, description="tinggi region")


class CalibrationUpdate(BaseModel):
    """POST /calibration — perbarui region kalibrasi + simpan calibration.json."""

    regions: Dict[str, RegionRect] = Field(..., description="nama region -> rect")


class MatchActivateRequest(BaseModel):
    """POST /match/activate — aktifkan matchId untuk tagging event/observasi."""

    matchId: str = Field(min_length=1, max_length=64)


# ---------------------------------------------------------------------------
# Struktur data (kontrak event / observasi / rekomendasi)
# ---------------------------------------------------------------------------
class EventModel(BaseModel):
    """Event konservatif hasil analisis frame."""

    eventId: str
    type: str
    timestamp: str
    matchId: str = ""
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str = ""
    status: str = "pending"          # pending | confirmed | false_positive
    playerName: Optional[str] = None
    teamName: Optional[str] = None


class ObservationModel(BaseModel):
    """Satu observasi OCR HUD pada tracker pemain."""

    detectedPlayerName: str = ""
    detectedTeamName: str = ""
    detectionTime: str
    confidence: float = Field(ge=0.0, le=1.0)
    matchId: str = ""
    observationStatus: str           # DETECTED | UNCERTAIN


class RecommendationModel(BaseModel):
    """Rekomendasi target tontonan berbobot dari event."""

    recommendationId: str
    eventId: str
    type: str
    target: str
    rank: str                        # HIGH | MEDIUM | LOW
    confidencePercent: int = Field(ge=0, le=100)
    reasons: List[str] = []
    action: str = "VIEW_RECOMMENDATION"  # VIEW_RECOMMENDATION | DISMISS


class HealthModel(BaseModel):
    """GET /health — indikator layanan hidup."""

    status: str = "ok"
    service: str = "ZEROID AI OBSERVER"
    time: str = ""
    activeMatchId: str = ""
