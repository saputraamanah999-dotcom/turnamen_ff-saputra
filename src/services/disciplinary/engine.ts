// ============================================================
// STIKAR ESPORTS — Point Penalty Engine (murni, tanpa Firebase)
// Prinsip WAJIB (spec §E, §N):
//  - Selalu dihitung dari DATA MENTAH hasil match + daftar sanksi
//    berstatus APPLIED -> penalti tidak mungkin diterapkan dua kali,
//    karena tidak pernah menimpa data mentah dan tidak pernah
//    dijumlahkan ke snapshot lama.
//  - Sanksi ZERO_MATCH: hanya match yang bersangkutan yang jadi 0.
//  - DISQUALIFICATION: seluruh poin tim = 0 (juknis §G), tetap tampil
//    di leaderboard dengan label DISQUALIFIED.
//  - Setiap sanksi punya ID unik (doc id + code) dan status penerapan.
// ============================================================

import { killPointsFor, placementPointsFor } from "@/lib/scoring";
import type { DisciplineStatus, Penalty } from "@/lib/disciplinary";

export interface RawResultLine {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamNumber: number;
  matchId: string;
  matchNumber: number;
  placement: number;
  kills: number;
}

export interface PenaltyLike {
  id: string;
  kind: Penalty["kind"];
  teamIds: string[];
  matchId: string | null;
  points: number;
  removeKills: boolean;
  statusOk?: boolean; // hanya APPLIED yang dipakai; default true (filter oleh pemanggil)
}

export interface TeamPenaltySummary {
  rawPoints: number; // placement + kill dari data mentah (tanpa sanksi)
  penaltyPoints: number; // total pengurangan (>= 0)
  finalPoints: number; // rawPoints - penaltyPoints (DQ = 0)
  matchesPlayed: number;
  zeroedMatches: number[]; // nomor match yang di-0-kan
  killsRemovedMatches: number[];
  disciplineStatus: DisciplineStatus | null;
}

/** Penalti yang berlaku untuk satu baris hasil (team+match). Hanya yang sah (bukan CANCELLED). */
function penaltiesForLine(line: RawResultLine, penalties: PenaltyLike[]): PenaltyLike[] {
  return penalties.filter(
    (p) =>
      p.statusOk !== false &&
      p.teamIds.includes(line.teamId) &&
      (p.matchId == null || p.matchId === line.matchId),
  );
}

/**
 * Terapkan seluruh sanksi ke baris hasil mentah.
 * Return: baris hasil yang SUDAH disesuaikan (feed klasemen)
 * + ringkasan penalti per tim + daftar tim didiskualifikasi/banned.
 */
export function applyPenalties(
  lines: RawResultLine[],
  penalties: PenaltyLike[],
  teamStatus: Record<string, DisciplineStatus> = {},
): {
  adjusted: RawResultLine[];
  summary: Map<string, TeamPenaltySummary>;
  disqualified: Set<string>;
} {
  const summary = new Map<string, TeamPenaltySummary>();
  const ensure = (teamId: string): TeamPenaltySummary => {
    let s = summary.get(teamId);
    if (!s) {
      s = { rawPoints: 0, penaltyPoints: 0, finalPoints: 0, matchesPlayed: 0, zeroedMatches: [], killsRemovedMatches: [], disciplineStatus: teamStatus[teamId] ?? null };
      summary.set(teamId, s);
    }
    return s;
  };

  const adjusted: RawResultLine[] = lines.map((line) => {
    const s = ensure(line.teamId);
    s.matchesPlayed += 1;
    s.rawPoints += placementPointsFor(line.placement) + killPointsFor(line.kills);

    const ps = penaltiesForLine(line, penalties);
    let zeroMatch = false;
    let killRemoved = false;
    for (const p of ps) {
      if (p.kind === "ZERO_MATCH" || p.kind === "MATCH_EJECTION") {
        zeroMatch = true;
        if (p.matchId != null && !s.zeroedMatches.includes(line.matchNumber)) s.zeroedMatches.push(line.matchNumber);
      }
      if (p.kind === "KILL_REMOVAL") {
        killRemoved = true;
        if (p.matchId != null && !s.killsRemovedMatches.includes(line.matchNumber)) s.killsRemovedMatches.push(line.matchNumber);
      }
      if (p.kind === "POINT" && p.matchId != null) {
        // Penalti poin TERIKAT MATCH: sekali per match (juknis: -20 per match).
        s.penaltyPoints += Math.max(0, p.points);
      }
      if (p.kind === "KILL_REMOVAL") {
        // Teaming: kill dihapus + potongan poin per match (juknis §G).
        s.penaltyPoints += Math.max(0, p.points);
      }
    }
    if (zeroMatch) {
      // Juknis: poin match tersebut 0 — placement & kill match itu tidak dihitung.
      return { ...line, placement: 12, kills: 0 }; // placement 12 = 0 poin (kapasitas 12)
    }
    if (killRemoved) return { ...line, kills: 0 };
    return line;
  });

  // Penalti POINT tanpa matchId = sekali, berlaku ke total turnamen.
  for (const p of penalties) {
    if (p.statusOk === false || p.kind !== "POINT" || p.matchId != null) continue;
    for (const tid of p.teamIds) ensure(tid).penaltyPoints += Math.max(0, p.points);
  }

  const disqualified = new Set<string>();
  // Base poin dari baris yang SUDAH disesuaikan (ZERO_MATCH/KILL_REMOVAL terwakili di sini).
  const adjustedBase = new Map<string, number>();
  for (const l of adjusted) {
    adjustedBase.set(l.teamId, (adjustedBase.get(l.teamId) ?? 0) + placementPointsFor(l.placement) + killPointsFor(l.kills));
  }
  for (const [tid, s] of summary) {
    const st = teamStatus[tid];
    if (st === "DISQUALIFIED" || st === "BANNED") {
      // Juknis §G: diskualifikasi dan poin dihapus (raw tetap dicatat untuk transparansi).
      disqualified.add(tid);
    }
    const base = adjustedBase.get(tid) ?? 0;
    s.finalPoints = disqualified.has(tid) ? 0 : Math.max(0, base - s.penaltyPoints);
  }
  return { adjusted, summary, disqualified };
}

export interface FinalRow {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamNumber: number;
  matchesPlayed: number;
  kills: number;
  placementPoints: number;
  killPoints: number;
  totalPoints: number; // FINAL (setelah penalti) — dipakai seluruh display
  rawPoints: number; // sebelum penalti
  violationPenalty: number;
  lastPlacement: number | null;
  rank: number;
  needsManualReview?: boolean;
  disciplineStatus: DisciplineStatus | null;
}

/**
 * Susun klasemen FINAL dari data mentah + sanksi.
 * Tiebreaker sesuai juknis §D: total -> placement point -> placement game terakhir.
 */
export function computeFinalStandings(
  lines: RawResultLine[],
  penalties: PenaltyLike[],
  teamStatus: Record<string, DisciplineStatus> = {},
  finalGamePlacement: Record<string, number> = {},
): FinalRow[] {
  const { adjusted, summary, disqualified } = applyPenalties(lines, penalties, teamStatus);

  const map = new Map<string, Omit<FinalRow, "rank" | "totalPoints" | "violationPenalty" | "rawPoints"> & { raw?: number }>();
  for (const r of adjusted) {
    const cur = map.get(r.teamId) ?? {
      teamId: r.teamId, teamName: r.teamName, teamTag: r.teamTag, teamNumber: r.teamNumber,
      matchesPlayed: 0, kills: 0, placementPoints: 0, killPoints: 0, lastPlacement: null,
      disciplineStatus: teamStatus[r.teamId] ?? null,
    };
    cur.matchesPlayed += 1;
    cur.kills += r.kills;
    cur.placementPoints += placementPointsFor(r.placement);
    cur.killPoints += killPointsFor(r.kills);
    cur.lastPlacement = r.placement;
    map.set(r.teamId, cur);
  }

  const rows: FinalRow[] = [];
  for (const [tid, c] of map) {
    const s = summary.get(tid);
    const rawPoints = s?.rawPoints ?? c.placementPoints + c.killPoints;
    const violationPenalty = s?.penaltyPoints ?? 0;
    const base = c.placementPoints + c.killPoints; // dari baris yang SUDAH disesuaikan
    rows.push({
      ...c,
      rank: 0,
      rawPoints,
      violationPenalty,
      totalPoints: disqualified.has(tid) ? 0 : Math.max(0, base - violationPenalty),
    });
  }

  const fp = (teamId: string) => finalGamePlacement[teamId] ?? null;
  rows.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.placementPoints !== a.placementPoints) return b.placementPoints - a.placementPoints;
    const fa = fp(a.teamId);
    const fb = fp(b.teamId);
    if (fa != null && fb != null && fa !== fb) return fa - fb;
    return a.teamNumber - b.teamNumber;
  });
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];
    if (
      cur.totalPoints === prev.totalPoints &&
      cur.placementPoints === prev.placementPoints &&
      (fp(cur.teamId) == null || fp(prev.teamId) == null || fp(cur.teamId) === fp(prev.teamId))
    ) {
      cur.needsManualReview = true;
      prev.needsManualReview = true;
    }
  }
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

/** Ringkas sanksi menjadi baris teks untuk audit/appeal. */
export function penaltySummary(p: Pick<Penalty, "code" | "kind" | "matchNumber" | "points">): string {
  const scope = p.matchNumber ? `Match ${p.matchNumber}` : "Total turnamen";
  const pts =
    p.kind === "ZERO_MATCH" ? "poin match = 0"
      : p.kind === "VERBAL" || p.kind === "WARNING" ? "peringatan"
        : `-${p.points} poin`;
  return `${p.code} · ${scope} · ${pts}`;
}
