"""Rekomendasi target observasi: rank HIGH/MEDIUM/LOW dari event stream.

Rekomendasi hanyalah SARAN untuk operator broadcast (action
VIEW_RECOMMENDATION / DISMISS) — tidak pernah mengubah skor resmi.
Skor = bobot tipe event x confidence event.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.events.engine import EventEngine

#: Bobot kepentingan broadcast per tipe event.
WEIGHTS: Dict[str, float] = {
    "MULTIPLE_ELIMINATIONS": 1.00,
    "ELIMINATION_DETECTED": 0.90,
    "POSSIBLE_TEAM_FIGHT": 0.85,
    "POSSIBLE_ENGAGEMENT": 0.60,
    "SPECTATOR_TARGET_CHANGED": 0.50,
    "QUIET_PERIOD": 0.00,  # informatif, tidak jadi rekomendasi
}

#: Confidence event minimum agar menjadi rekomendasi.
MIN_CONFIDENCE = 0.40
#: Ambang skor per rank.
RANK_HIGH = 0.65
RANK_MEDIUM = 0.45
#: Batas jumlah rekomendasi tersimpan.
MAX_RECS = 200


class RecommendationEngine:
    """Ingest event -> susun ranking target tontonan."""

    def __init__(self, events: EventEngine) -> None:
        self._events = events  # dipakai bila perlu konteks event terkait
        self._recs: Dict[str, Dict] = {}
        self._by_event: Dict[str, str] = {}  # eventId -> recommendationId

    # -- ingest -----------------------------------------------------------------
    def ingest(self, event: Dict) -> Optional[Dict]:
        """Buat rekomendasi dari event baru (jika tipe & confidence layak)."""
        event_type = str(event.get("type", ""))
        weight = WEIGHTS.get(event_type, 0.0)
        confidence = float(event.get("confidence", 0.0))
        if weight <= 0.0 or confidence < MIN_CONFIDENCE:
            return None
        event_id = str(event.get("eventId", ""))
        if not event_id or event_id in self._by_event:
            return None  # satu event satu rekomendasi

        score = weight * confidence
        rank = "HIGH" if score >= RANK_HIGH else ("MEDIUM" if score >= RANK_MEDIUM else "LOW")
        percent = int(round(confidence * 100))
        target = event.get("playerName") or event.get("newTarget") or "AREA AKTIF"
        rec = {
            "recommendationId": uuid.uuid4().hex[:12],
            "eventId": event_id,
            "type": event_type,
            "target": target,
            "teamName": event.get("teamName", ""),
            "matchId": event.get("matchId", ""),
            "rank": rank,
            "score": round(score, 3),
            "confidencePercent": percent,
            "reasons": [
                str(event.get("reason", "")),
                f"confidence {percent}% pada event {event_type}",
            ],
            "action": "VIEW_RECOMMENDATION",
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        self._recs[rec["recommendationId"]] = rec
        self._by_event[event_id] = rec["recommendationId"]

        # buang rekomendasi tertua bila melewati batas memori
        if len(self._recs) > MAX_RECS:
            oldest = min(self._recs.values(), key=lambda r: r["createdAt"])
            self._by_event.pop(oldest["eventId"], None)
            self._recs.pop(oldest["recommendationId"], None)
        return rec

    # -- akses --------------------------------------------------------------------
    def list(self) -> List[Dict]:
        """Rekomendasi aktif (belum di-dismiss), urut skor tertinggi."""
        active = [r for r in self._recs.values() if r["action"] == "VIEW_RECOMMENDATION"]
        return sorted(active, key=lambda r: (r["score"], r["confidencePercent"]), reverse=True)

    def dismiss(self, recommendation_id: str) -> Optional[Dict]:
        """Tandai rekomendasi diabaikan operator (action -> DISMISS)."""
        rec = self._recs.get(recommendation_id)
        if rec is None:
            return None
        rec["action"] = "DISMISS"
        rec["dismissedAt"] = datetime.now(timezone.utc).isoformat()
        return rec
