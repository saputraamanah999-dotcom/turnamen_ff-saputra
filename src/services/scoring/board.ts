// ============================================================
// STIKAR ESPORTS — Board builder terintegrasi disiplin.
// SATU-satunya fungsi yang menulis publicLeaderboards/{tid}.
// Selalu dihitung dari: hasil mentah + sanksi APPLIED + status tim
// -> menghapus poin TIDAK PERNAH dobel, dan publish hasil match
// otomatis sudah memperhitungkan sanksi (spec §E, §M).
// ============================================================
"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { SCORING_VERSION } from "@/lib/constants";
import { applyMovement } from "@/lib/scoring";
import type { DisciplineStatus, Penalty } from "@/lib/disciplinary";
import type { Match, MatchResult, StandingsRow, Team } from "@/lib/types";
import { computeFinalStandings, type FinalRow, type PenaltyLike, type RawResultLine } from "@/services/disciplinary/engine";
import { writeAuditLog } from "./audit";

/** Semua baris hasil mentah dari match yang sudah dipublikasikan. */
export async function loadRawResultLines(tournamentId: string): Promise<{
  lines: RawResultLine[];
  published: Match[];
}> {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");
  const matchesSnap = await getDocs(collection(db, `tournaments/${tournamentId}/matches`));
  const published = matchesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Match)
    .filter((m) => m.resultsPublished)
    .sort((a, b) => a.matchNumber - b.matchNumber);

  const lines: RawResultLine[] = [];
  for (const m of published) {
    const resSnap = await getDocs(collection(db, `tournaments/${tournamentId}/matches/${m.id}/results`));
    resSnap.docs.forEach((d) => {
      const r = d.data() as MatchResult;
      lines.push({
        teamId: r.teamId,
        teamName: r.teamName,
        teamTag: r.teamTag ?? "",
        teamNumber: 0,
        matchId: m.id,
        matchNumber: m.matchNumber,
        placement: r.placement,
        kills: r.kills,
      });
    });
  }
  return { lines, published };
}

/** Sanksi berstatus APPLIED (satu-satunya yang memengaruhi poin). */
export async function loadAppliedPenalties(): Promise<PenaltyLike[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, "disciplinaryPenalties"));
  return snap.docs
    .map((d) => {
      const v = d.data() as Penalty;
      return { ...v, id: d.id };
    })
    .filter((p) => p.status === "APPLIED")
    .map((p) => ({
      id: p.id,
      kind: p.kind,
      teamIds: p.teamIds ?? [],
      matchId: p.matchId ?? null,
      points: Number(p.points) || 0,
      removeKills: Boolean(p.removeKills),
    }));
}

/** Status disiplin seluruh tim (koleksi disciplinaryTeams, doc id = teamId). */
export async function loadTeamDisciplineStatus(): Promise<Record<string, DisciplineStatus>> {
  if (!db) return {};
  const snap = await getDocs(collection(db, "disciplinaryTeams"));
  const out: Record<string, DisciplineStatus> = {};
  snap.docs.forEach((d) => {
    const v = d.data() as { status?: DisciplineStatus };
    if (v.status) out[d.id] = v.status;
  });
  return out;
}

export interface BuildBoardOpts {
  /** Match yang baru saja dipublish dalam batch yang sama (agar ikut dihitung). */
  extraPublishedMatchId?: string;
  /** Override placement game terakhir (tiebreaker #3) dari pemanggil. */
  finalPlacementOverride?: Record<string, number>;
  actor?: { uid: string; email: string };
  action?: string;
}

/**
 * Hitung ulang & tulis klasemen FINAL ke publicLeaderboards/{tid}.
 * Baris hasil: totalPoints = FINAL (raw - penalti; DQ = 0),
 * lengkap dengan rawPoints + violationPenalty untuk transparansi (§M).
 */
export async function buildAndWriteBoard(
  tournamentId: string,
  opts: BuildBoardOpts = {},
): Promise<FinalRow[]> {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");

  const { lines, published } = await loadRawResultLines(tournamentId);
  const publishedIds = new Set(published.map((m) => m.id));
  if (opts.extraPublishedMatchId) publishedIds.add(opts.extraPublishedMatchId);
  const effective = published.filter((m) => publishedIds.has(m.id));

  // Hasil match yang baru dipublish sudah tertulis sebelum fungsi ini dipanggil.
  const linesEffective = opts.extraPublishedMatchId && !publishedIds.has(opts.extraPublishedMatchId)
    ? lines
    : lines.filter((l) => publishedIds.has(l.matchId));

  const penalties = await loadAppliedPenalties();
  const teamStatus = await loadTeamDisciplineStatus();

  // Nomor tim untuk urutan tie yang stabil.
  const teamsSnap = await getDocs(collection(db, `tournaments/${tournamentId}/teams`));
  const teamNumber = new Map<string, number>();
  teamsSnap.docs.forEach((d) => {
    const t = d.data() as Team;
    teamNumber.set(t.id, t.number ?? 0);
  });
  for (const l of linesEffective) l.teamNumber = teamNumber.get(l.teamId) ?? 999;

  // Placement pada game terakhir sesuai format (tiebreaker #3 juknis).
  const finalGamePlacement: Record<string, number> = {};
  for (const m of effective) {
    const isFinalGame =
      (m.format === "BO7" && m.matchNumber === 7) ||
      (m.format === "BO5" && m.matchNumber === 5) ||
      (m.format === "BO3" && m.matchNumber === 3);
    if (!isFinalGame) continue;
    const resSnap = await getDocs(collection(db, `tournaments/${tournamentId}/matches/${m.id}/results`));
    resSnap.docs.forEach((d) => {
      const r = d.data() as MatchResult;
      finalGamePlacement[r.teamId] = r.placement;
    });
  }

  const rows = computeFinalStandings(linesEffective, penalties, teamStatus, {
    ...finalGamePlacement,
    ...(opts.finalPlacementOverride ?? {}),
  });

  const prevBoard = await getDoc(doc(db, `publicLeaderboards/${tournamentId}`));
  const prevStandings = ((prevBoard.data() as { standings?: StandingsRow[] } | undefined)?.standings ?? []);
  const withMovement = applyMovement(rows as unknown as StandingsRow[], prevStandings) as unknown as FinalRow[];

  await setDoc(doc(db, `publicLeaderboards/${tournamentId}`), {
    tournamentId,
    standings: withMovement,
    publishedMatchCount: effective.length,
    totalKills: withMovement.reduce((a, r) => a + r.kills, 0),
    scoringVersion: SCORING_VERSION,
    updatedAt: serverTimestamp(),
  });

  await writeAuditLog({
    action: opts.action ?? "REBUILD_BOARD",
    actor: opts.actor,
    targetType: "tournament",
    targetId: tournamentId,
    details: {
      publishedMatchCount: effective.length,
      teams: withMovement.length,
      penaltiesApplied: penalties.length,
      disciplinedTeams: Object.keys(teamStatus).length,
    },
  });
  return withMovement;
}
