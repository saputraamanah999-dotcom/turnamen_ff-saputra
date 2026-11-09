// ============================================================
// ZEROID ESPORTS — Mesin skor resmi BOF
// Murni TypeScript tanpa dependensi Firebase — mudah diuji.
// ============================================================

import {
  OFFICIAL_KILL_POINT,
  OFFICIAL_PLACEMENT_POINTS,
  SCORING_VERSION,
} from "./constants";
import type { ChampionState, MatchResult, StandingsRow } from "./types";

/** Poin placement untuk peringkat tertentu (1-based). */
export function placementPointsFor(placement: number, capacity = 12): number {
  if (placement < 1) return 0;
  if (placement <= OFFICIAL_PLACEMENT_POINTS.length) {
    return OFFICIAL_PLACEMENT_POINTS[placement - 1];
  }
  // Tim ke-13 dst: butuh konfigurasi tambahan dari admin.
  return 0;
}

/** Poin kill = kills x 2. */
export function killPointsFor(kills: number): number {
  return Math.max(0, Math.floor(kills)) * OFFICIAL_KILL_POINT;
}

/** Hitung satu baris hasil pertandingan. */
export function calcMatchResult(
  teamId: string,
  teamName: string,
  placement: number,
  kills: number,
  teamTag?: string,
): MatchResult {
  const placementPoints = placementPointsFor(placement);
  const killPoints = killPointsFor(kills);
  return {
    teamId,
    teamName,
    teamTag: teamTag ?? "",
    placement,
    kills,
    placementPoints,
    killPoints,
    totalPoints: placementPoints + killPoints,
  };
}

export interface ValidationError {
  field: string;
  message: string;
}

/** Validasi entri hasil: placement unik, kills >= 0, tidak kosong. */
export function validateResultEntries(
  entries: { teamId: string; teamName: string; placement: number | null; kills: number | null }[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const seenPlacement = new Map<number, string>();
  const seenTeam = new Set<string>();

  for (const e of entries) {
    if (!e.teamId) continue;
    if (seenTeam.has(e.teamId)) {
      errors.push({ field: "teamId", message: `Hasil ganda untuk tim ${e.teamName}.` });
    }
    seenTeam.add(e.teamId);

    if (e.placement == null || e.kills == null) continue;

    if (!Number.isInteger(e.placement) || e.placement < 1) {
      errors.push({
        field: "placement",
        message: `Placement tidak valid untuk ${e.teamName} (minimal 1).`,
      });
    } else if (seenPlacement.has(e.placement)) {
      errors.push({
        field: "placement",
        message: `Placement ${e.placement} dipakai dua kali: ${seenPlacement.get(e.placement)} dan ${e.teamName}.`,
      });
    } else {
      seenPlacement.set(e.placement, e.teamName);
    }

    if (!Number.isInteger(e.kills) || e.kills < 0) {
      errors.push({
        field: "kills",
        message: `Jumlah kill tidak valid untuk ${e.teamName} (boleh 0, tidak boleh negatif).`,
      });
    }
  }
  return errors;
}

export interface AccumInput {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamNumber: number;
  placement: number;
  kills: number;
}

/**
 * Susun klasemen akumulasi dari seluruh hasil match yang dipublikasikan.
 * Tiebreaker resmi:
 *  1. Total poin tertinggi
 *  2. Placement points tertinggi
 *  3. Placement lebih baik pada game terakhir sesuai format
 * Jika masih seri → tandai perlu review manual panitia.
 */
export function computeStandings(
  accum: AccumInput[],
  finalGamePlacement: Record<string, number> = {},
): StandingsRow[] {
  const map = new Map<string, StandingsRow & { _finalPlacement?: number }>();
  for (const r of accum) {
    const cur = map.get(r.teamId) ?? {
      teamId: r.teamId,
      teamName: r.teamName,
      teamTag: r.teamTag,
      teamNumber: r.teamNumber,
      matchesPlayed: 0,
      kills: 0,
      placementPoints: 0,
      killPoints: 0,
      totalPoints: 0,
      lastPlacement: null,
      rank: 0,
      movement: "new" as const,
    };
    cur.matchesPlayed += 1;
    cur.kills += r.kills;
    cur.placementPoints += placementPointsFor(r.placement);
    cur.killPoints += killPointsFor(r.kills);
    cur.totalPoints = cur.placementPoints + cur.killPoints;
    cur.lastPlacement = r.placement;
    map.set(r.teamId, cur);
  }

  const rows = [...map.values()];
  for (const row of rows) {
    row._finalPlacement = finalGamePlacement[row.teamId] ?? null;
  }

  rows.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.placementPoints !== a.placementPoints) return b.placementPoints - a.placementPoints;
    const fa = a._finalPlacement;
    const fb = b._finalPlacement;
    if (fa != null && fb != null && fa !== fb) return fa - fb;
    return a.teamNumber - b.teamNumber;
  });

  // Deteksi seri yang tidak terselesaikan oleh 3 tiebreaker → review manual.
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];
    if (
      cur.totalPoints === prev.totalPoints &&
      cur.placementPoints === prev.placementPoints &&
      (cur._finalPlacement == null || prev._finalPlacement == null ||
        cur._finalPlacement === prev._finalPlacement)
    ) {
      cur.needsManualReview = true;
      prev.needsManualReview = true;
    }
  }

  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  for (const r of rows) delete (r as { _finalPlacement?: number })._finalPlacement;
  return rows as StandingsRow[];
}

/** Tandai pergerakan peringkat dibanding klasemen sebelumnya. */
export function applyMovement(rows: StandingsRow[], previous: StandingsRow[]): StandingsRow[] {
  const prevRank = new Map(previous.map((p) => [p.teamId, p.rank]));
  return rows.map((r) => {
    const old = prevRank.get(r.teamId);
    if (old == null) return { ...r, movement: "new" as const, previousRank: null };
    const movement = r.rank < old ? "up" : r.rank > old ? "down" : "same";
    return { ...r, movement, previousRank: old };
  });
}

/**
 * Champion tracking (§30 master prompt) — JUJUR:
 * juara hanya dikonfirmasi bila SEMUA match format selesai dipublikasikan
 * DAN peringkat 1 tidak seri (tidak perlu review manual).
 * Sebelum itu: CHAMPION NOT CONFIRMED (dengan kandidat + sisa match).
 */
export function computeChampion(
  standings: StandingsRow[],
  totalMatches: number,
  publishedMatchCount: number,
): ChampionState {
  const candidate = standings[0] ?? null;
  const second = standings[1] ?? null;
  const gap = candidate && second ? candidate.totalPoints - second.totalPoints : candidate ? candidate.totalPoints : 0;
  const remainingMatches = Math.max(0, totalMatches - publishedMatchCount);
  const possibleTie = Boolean(
    candidate && second &&
    candidate.totalPoints === second.totalPoints &&
    candidate.placementPoints === second.placementPoints,
  );
  const confirmed = Boolean(
    candidate &&
    remainingMatches === 0 &&
    totalMatches > 0 &&
    publishedMatchCount >= totalMatches &&
    !candidate.needsManualReview &&
    !possibleTie,
  );
  return { confirmed, candidate, gap, remainingMatches, possibleTie };
}
