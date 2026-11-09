"use client";
// ============================================================
// STIKAR ESPORTS — Alur admin: entri hasil, publish, audit log
// Karena proyek memakai Firebase Spark (tanpa Cloud Functions),
// seluruh perhitungan resmi dilakukan di aplikasi admin yang
// TERAUTENTIKASI, dan keamanan ditegakkan oleh Firestore Rules.
// ============================================================

import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { SCORING_VERSION } from "@/lib/constants";
import { applyMovement, calcMatchResult, computeStandings, validateResultEntries } from "@/lib/scoring";
import type {
  BroadcastEvent,
  BroadcastEventType,
  BroadcastLiveState,
  BroadcastEmergency,
  Match,
  MatchResult,
  OverlaySceneConfig,
  PresentationState,
  StandingsRow,
  Team,
} from "@/lib/types";

export interface ResultEntryInput {
  teamId: string;
  teamName: string;
  teamTag?: string;
  placement: number | null;
  kills: number | null;
}

/** Simpan draft hasil (belum dipublikasikan). */
export async function saveDraftResults(
  tournamentId: string,
  match: Match,
  entries: ResultEntryInput[],
  actor: { uid: string; email: string },
): Promise<void> {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");
  const validEntries = entries.filter((e) => e.placement != null && e.kills != null);
  const errors = validateResultEntries(
    validEntries as { teamId: string; teamName: string; placement: number | null; kills: number | null }[],
  );
  if (errors.length) throw new Error(errors.map((e) => e.message).join("\n"));

  const batch = writeBatch(db);
  for (const e of validEntries) {
    const res = calcMatchResult(e.teamId, e.teamName, e.placement!, e.kills!, e.teamTag);
    const ref = doc(db, `tournaments/${tournamentId}/matches/${match.id}/results/${e.teamId}`);
    batch.set(ref, res, { merge: true });
  }
  batch.update(doc(db, `tournaments/${tournamentId}/matches/${match.id}`), {
    updatedAt: serverTimestamp(),
    scoringVersion: SCORING_VERSION,
  });
  await batch.commit();
  await writeAuditLog({
    action: "SAVE_DRAFT_RESULTS",
    actor,
    targetType: "match",
    targetId: match.id,
    details: { matchNumber: match.matchNumber, teams: validEntries.length },
  });
}

/**
 * Publish hasil: validasi → hitung ulang seluruh klasemen dari
 * SEMUA match yang sudah dipublikasikan → tulis dokumen
 * publicLeaderboards → update status match → audit log.
 */
export async function publishResults(
  tournamentId: string,
  match: Match,
  entries: ResultEntryInput[],
  finalGamePlacement: Record<string, number> = {},
  actor?: { uid: string; email: string },
): Promise<void> {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");

  const filled = entries.filter((e) => e.placement != null && e.kills != null);
  const errors = validateResultEntries(
    filled as { teamId: string; teamName: string; placement: number | null; kills: number | null }[],
  );
  if (errors.length) throw new Error(errors.map((e) => e.message).join("\n"));

  // 1. Tulis hasil resmi match ini.
  const batch = writeBatch(db);
  const results: MatchResult[] = filled.map((e) =>
    calcMatchResult(e.teamId, e.teamName, e.placement!, e.kills!, e.teamTag),
  );
  for (const res of results) {
    const ref = doc(db, `tournaments/${tournamentId}/matches/${match.id}/results/${res.teamId}`);
    batch.set(ref, res, { merge: true });
  }

  // 2. Update status match.
  batch.update(doc(db, `tournaments/${tournamentId}/matches/${match.id}`), {
    status: "completed",
    resultsPublished: true,
    isCurrent: false,
    scoringVersion: SCORING_VERSION,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();

  // 3. Hitung ulang akumulasi seluruh match yang sudah dipublikasikan.
  const matchesSnap = await getDocs(
    collection(db, `tournaments/${tournamentId}/matches`),
  );
  const published = matchesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Match)
    .filter((m) => m.resultsPublished || m.id === match.id);

  const accum: {
    teamId: string; teamName: string; teamTag: string; teamNumber: number; placement: number; kills: number;
  }[] = [];
  for (const m of published) {
    const resSnap = await getDocs(
      collection(db, `tournaments/${tournamentId}/matches/${m.id}/results`),
    );
    resSnap.docs.forEach((d) => {
      const r = d.data() as MatchResult;
      accum.push({
        teamId: r.teamId,
        teamName: r.teamName,
        teamTag: r.teamTag ?? "",
        teamNumber: 0,
        placement: r.placement,
        kills: r.kills,
      });
    });
  }

  // Nomor tim untuk tie order stabil.
  const teamsSnap = await getDocs(collection(db, `tournaments/${tournamentId}/teams`));
  const teamNumber = new Map<string, number>();
  teamsSnap.docs.forEach((d) => {
    const t = d.data() as Team;
    teamNumber.set(t.id, t.number ?? 0);
  });
  accum.forEach((a) => {
    a.teamNumber = teamNumber.get(a.teamId) ?? 999;
  });

  // 4. Susun klasemen + tiebreaker. Ambil klasemen SEBELUMNYA dulu agar
  // pergerakan peringkat (↑ naik / ↓ turun / = tetap) bisa ditampilkan
  // realtime di leaderboard — indikator ini sebelumnya mati data.
  const prevBoard = await getDoc(doc(db, `publicLeaderboards/${tournamentId}`));
  const prevStandings = ((prevBoard.data() as { standings?: StandingsRow[] } | undefined)?.standings ?? []);
  const standings = applyMovement(computeStandings(accum, finalGamePlacement), prevStandings);
  await setDoc(doc(db, `publicLeaderboards/${tournamentId}`), {
    tournamentId,
    standings,
    publishedMatchCount: published.length,
    totalKills: standings.reduce((a, r) => a + r.kills, 0),
    scoringVersion: SCORING_VERSION,
    updatedAt: serverTimestamp(),
  });

  await writeAuditLog({
    action: "PUBLISH_RESULTS",
    actor,
    targetType: "match",
    targetId: match.id,
    details: { matchNumber: match.matchNumber, publishedMatchCount: published.length },
  });
}

/**
 * Hitung ulang & publikasikan ulang klasemen dari SEMUA hasil resmi yang
 * sudah dipublish — tanpa mengubah hasil match mana pun. Dipakai menu
 * Admin → Leaderboard bila panitia mengoreksi hasil lewat Entri Hasil.
 */
export async function recomputeStandings(
  tournamentId: string,
  actor?: { uid: string; email: string },
): Promise<void> {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");

  const matchesSnap = await getDocs(collection(db, `tournaments/${tournamentId}/matches`));
  const published = matchesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Match)
    .filter((m) => m.resultsPublished)
    .sort((a, b) => a.matchNumber - b.matchNumber);

  const accum: {
    teamId: string; teamName: string; teamTag: string; teamNumber: number; placement: number; kills: number;
  }[] = [];
  const finalPlacement: Record<string, number> = {};
  for (const m of published) {
    const resSnap = await getDocs(collection(db, `tournaments/${tournamentId}/matches/${m.id}/results`));
    resSnap.docs.forEach((d) => {
      const r = d.data() as MatchResult;
      accum.push({
        teamId: r.teamId, teamName: r.teamName, teamTag: r.teamTag ?? "",
        teamNumber: 0, placement: r.placement, kills: r.kills,
      });
    });
    // Placement pada game terakhir sesuai format (tiebreaker #3).
    const isFinalGame =
      (m.format === "BO7" && m.matchNumber === 7) ||
      (m.format === "BO5" && m.matchNumber === 5) ||
      (m.format === "BO3" && m.matchNumber === 3);
    if (isFinalGame) {
      resSnap.docs.forEach((d) => {
        const r = d.data() as MatchResult;
        finalPlacement[r.teamId] = r.placement;
      });
    }
  }

  const teamsSnap = await getDocs(collection(db, `tournaments/${tournamentId}/teams`));
  const teamNumber = new Map<string, number>();
  teamsSnap.docs.forEach((d) => {
    const t = d.data() as Team;
    teamNumber.set(t.id, t.number ?? 0);
  });
  accum.forEach((a) => { a.teamNumber = teamNumber.get(a.teamId) ?? 999; });

  const prevBoard = await getDoc(doc(db, `publicLeaderboards/${tournamentId}`));
  const prevStandings = ((prevBoard.data() as { standings?: StandingsRow[] } | undefined)?.standings ?? []);
  const standings = applyMovement(computeStandings(accum, finalPlacement), prevStandings);

  await setDoc(doc(db, `publicLeaderboards/${tournamentId}`), {
    tournamentId,
    standings,
    publishedMatchCount: published.length,
    totalKills: standings.reduce((a, r) => a + r.kills, 0),
    scoringVersion: SCORING_VERSION,
    updatedAt: serverTimestamp(),
  });

  await writeAuditLog({
    action: "RECOMPUTE_STANDINGS",
    actor,
    targetType: "tournament",
    targetId: tournamentId,
    details: { publishedMatchCount: published.length, teams: standings.length },
  });
}

/**
 * Simpan roster pemain sebuah tim (Admin → Pemain).
 * RosterMember[] = { nickname, role? } — tidak pernah mengubah hasil skor.
 */
export async function upsertRoster(
  tournamentId: string,
  teamId: string,
  roster: { nickname: string; role?: string }[],
  actor?: { uid: string; email: string },
): Promise<void> {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");
  await updateDoc(doc(db, `tournaments/${tournamentId}/teams/${teamId}`), {
    roster: roster.filter((r) => r.nickname.trim().length > 0),
    updatedAt: serverTimestamp(),
  });
  await writeAuditLog({
    action: "UPDATE_ROSTER",
    actor,
    targetType: "team",
    targetId: teamId,
    details: { players: roster.length },
  });
}

/** Atur pesan darurat broadcast (Admin → Emergency). Tidak pernah mengubah skor. */
export async function setEmergencyBroadcast(
  tournamentId: string,
  emergency: BroadcastEmergency | null,
  actor?: { uid: string; email: string },
): Promise<void> {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");
  await updateDoc(doc(db, `broadcastSettings/${tournamentId}`), {
    emergency: emergency ?? deleteField(),
    updatedAt: serverTimestamp(),
  });
  await writeAuditLog({
    action: emergency?.active ? "EMERGENCY_ON" : "EMERGENCY_OFF",
    actor,
    targetType: "broadcast",
    targetId: tournamentId,
    details: { preset: emergency?.preset ?? null },
  });
}

// ---------- CRUD generik admin ----------

export async function upsertTeam(
  tournamentId: string,
  team: Partial<Team> & { id?: string },
  actor?: { uid: string; email: string },
) {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");
  const ref = team.id
    ? doc(db, `tournaments/${tournamentId}/teams/${team.id}`)
    : doc(collection(db, `tournaments/${tournamentId}/teams`));
  await setDoc(ref, { ...team, id: ref.id, updatedAt: serverTimestamp() }, { merge: true });
  await writeAuditLog({
    action: team.id ? "UPDATE_TEAM" : "CREATE_TEAM",
    actor,
    targetType: "team",
    targetId: ref.id,
    details: { name: team.name },
  });
  return ref.id;
}

export async function deleteTeam(tournamentId: string, teamId: string, actor?: { uid: string; email: string }) {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");
  const { deleteDoc } = await import("firebase/firestore");
  await deleteDoc(doc(db, `tournaments/${tournamentId}/teams/${teamId}`));
  await writeAuditLog({ action: "DELETE_TEAM", actor, targetType: "team", targetId: teamId });
}

export async function deleteMatch(tournamentId: string, matchId: string, actor?: { uid: string; email: string }) {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");
  const { deleteDoc } = await import("firebase/firestore");
  await deleteDoc(doc(db, `tournaments/${tournamentId}/matches/${matchId}`));
  await writeAuditLog({ action: "DELETE_MATCH", actor, targetType: "match", targetId: matchId });
}

export async function upsertMatch(
  tournamentId: string,
  match: Partial<Match> & { id?: string },
  actor?: { uid: string; email: string },
) {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");
  const ref = match.id
    ? doc(db, `tournaments/${tournamentId}/matches/${match.id}`)
    : doc(collection(db, `tournaments/${tournamentId}/matches`));
  await setDoc(ref, { ...match, id: ref.id, updatedAt: serverTimestamp() }, { merge: true });
  await writeAuditLog({
    action: match.id ? "UPDATE_MATCH" : "CREATE_MATCH",
    actor,
    targetType: "match",
    targetId: ref.id,
    details: { matchNumber: match.matchNumber, map: match.map },
  });
  return ref.id;
}

/** Set satu match sebagai "current" (yang sedang berjalan). */
export async function setCurrentMatch(
  tournamentId: string,
  matchId: string | null,
  actor?: { uid: string; email: string },
) {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");
  const batch = writeBatch(db);
  const matchesSnap = await getDocs(collection(db, `tournaments/${tournamentId}/matches`));
  matchesSnap.docs.forEach((d) => {
    if (d.data().isCurrent === true) {
      batch.update(d.ref, { isCurrent: false, updatedAt: serverTimestamp() });
    }
  });
  if (matchId) {
    batch.update(doc(db, `tournaments/${tournamentId}/matches/${matchId}`), {
      isCurrent: true,
      status: "live",
      updatedAt: serverTimestamp(),
    });
  }
  batch.update(doc(db, `tournaments/${tournamentId}`), {
    currentMatchId: matchId,
    liveStatus: matchId ? "live" : "intermission",
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  await writeAuditLog({
    action: "SET_CURRENT_MATCH",
    actor,
    targetType: "match",
    targetId: matchId ?? "(kosong)",
  });
}

// ============================================================
// Broadcast realtime helpers (PHASE 2 — §5, §11, §13, §17, §21)
// ============================================================

/** Simpan mesin status siaran ke broadcastSettings/{tid} (realtime ke semua viewer). */
export async function setLiveState(
  tournamentId: string,
  live: BroadcastLiveState,
): Promise<void> {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");
  await setDoc(
    doc(db, `broadcastSettings/${tournamentId}`),
    { live: { ...live }, tournamentId, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Terbitkan event broadcast (LIVE NOW, MATCH PAUSED, dst.) — memicu animasi di TV. */
export async function publishBroadcastEvent(
  tournamentId: string,
  type: BroadcastEventType,
  opts?: { message?: string; matchNumber?: number | null; map?: string | null },
): Promise<void> {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");
  const event: BroadcastEvent = {
    id: crypto.randomUUID(),
    type,
    message: opts?.message ?? "",
    matchNumber: opts?.matchNumber ?? null,
    map: opts?.map ?? null,
    at: Date.now(),
  };
  await setDoc(
    doc(db, `broadcastSettings/${tournamentId}`),
    { event, tournamentId, updatedAt: serverTimestamp() },
    { merge: true },
  );
  await writeAuditLog({
    action: "BROADCAST_EVENT",
    targetType: "broadcast",
    targetId: type,
    details: { message: event.message ?? "" },
  });
}

/** Simpan konfigurasi overlay (draft atau on-air). */
export async function saveOverlayConfig(
  tournamentId: string,
  patch: {
    draft?: OverlaySceneConfig;
    onAir?: OverlaySceneConfig | null;
    /** Konfigurasi per-scene + snapshot '__prev_onair' untuk RESTORE PREVIOUS. */
    scenes?: Record<string, OverlaySceneConfig>;
    pushedAt?: number | null;
  },
): Promise<void> {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");
  await setDoc(
    doc(db, `overlayConfigs/${tournamentId}`),
    { ...patch, tournamentId, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** Setel state presentasi TV — halaman TV mengikuti secara realtime. */
export async function setPresentationState(
  tournamentId: string,
  state: Partial<PresentationState>,
): Promise<void> {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");
  await setDoc(
    doc(db, `presentationState/${tournamentId}`),
    { ...state, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function writeAuditLog(payload: {
  action: string;
  actor?: { uid: string; email: string };
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
}) {
  if (!db) return;
  try {
    await setDoc(doc(collection(db, "auditLogs")), {
      ...payload,
      actorUid: payload.actor?.uid ?? "system",
      actorEmail: payload.actor?.email ?? "system",
      createdAt: serverTimestamp(),
    });
  } catch {
    // Audit log tidak boleh memblokir operasi utama.
  }
}
