// ============================================================
// STIKAR ESPORTS — Tournament Rules & Disciplinary Management
// Operasi Firestore. Setiap aksi menulis disciplinaryLogs (create-only)
// + auditLogs. Poin HANYA berubah lewat buildAndWriteBoard — sehingga
// tidak ada pengurangan ganda dan tidak ada perubahan tanpa jejak.
// ============================================================
"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import {
  DEFAULT_PENALTY_CONFIG,
  canApplyPenalty,
  canDecideHeavy,
  canRecord,
  type Appeal,
  type AppealStatus,
  type DisciplineStatus,
  type EvidenceDoc,
  type EvidenceKind,
  type Penalty,
  type PenaltyConfig,
  type PenaltyKind,
  type PenaltyStatus,
  type TeamDiscipline,
  type Violation,
  type ViolationStatus,
} from "@/lib/disciplinary";
import { penaltySummary } from "./engine";
import { buildAndWriteBoard } from "@/services/scoring/board";
import { writeAuditLog } from "@/services/scoring/audit";

export interface Actor {
  uid: string;
  email: string;
  role: string | null;
}

export const MAX_INLINE_EVIDENCE_BYTES = 700_000; // base64 aman di bawah batas 1 MB Firestore

function code(): string {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return "SANKSI-" + s;
}

function assertDb() {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");
}
/** db yang sudah dinarrow — panggil di awal tiap operasi. */
function fdb() {
  assertDb();
  return db as NonNullable<typeof db>;
}

/** Tulis log disiplin (create-only menurut rules) + mirror ke auditLogs. */
async function writeDisciplinaryLog(payload: {
  action: string;
  actor: Actor;
  teamId?: string | null;
  teamName?: string;
  violationId?: string | null;
  penaltyId?: string | null;
  matchNumber?: number | null;
  pointsDelta?: number;
  before?: unknown;
  after?: unknown;
  reason?: string;
  decision?: string;
}) {
  if (!db) return;
  try {
    await setDoc(doc(collection(fdb(), "disciplinaryLogs")), {
      action: payload.action,
      actorUid: payload.actor.uid,
      actorEmail: payload.actor.email,
      actorRole: payload.actor.role ?? "(tanpa peran)",
      teamId: payload.teamId ?? null,
      teamName: payload.teamName ?? "",
      violationId: payload.violationId ?? null,
      penaltyId: payload.penaltyId ?? null,
      matchNumber: payload.matchNumber ?? null,
      pointsDelta: payload.pointsDelta ?? 0,
      before: JSON.stringify(payload.before ?? null),
      after: JSON.stringify(payload.after ?? null),
      reason: payload.reason ?? "",
      decision: payload.decision ?? "",
      createdAt: serverTimestamp(),
    });
  } catch {
    // jangan blokir operasi utama
  }
  await writeAuditLog({
    action: payload.action,
    actor: { uid: payload.actor.uid, email: payload.actor.email },
    targetType: "disciplinary",
    targetId: payload.penaltyId ?? payload.violationId ?? payload.teamId ?? "-",
    details: { reason: payload.reason ?? "", decision: payload.decision ?? "", pointsDelta: payload.pointsDelta ?? 0 },
  });
}

function requireRole(actor: Actor, ok: boolean, what: string) {
  if (!ok) throw new Error(`Peran "${actor.role ?? "?"}" tidak berwenang untuk ${what}.`);
}

// ============================================================
// A. VIOLATIONS
// ============================================================
export async function createViolation(
  tournamentId: string,
  input: {
    teamIds: string[];
    teamNames: string[];
    matchId: string | null;
    matchNumber: number | null;
    playerNames: string;
    category: Violation["category"];
    severity: Violation["severity"];
    occurredAt: string;
    description: string;
    witness: string;
  },
  actor: Actor,
): Promise<string> {
  assertDb();
  requireRole(actor, canRecord(actor.role), "mencatat pelanggaran");
  const ref = await addDoc(collection(fdb(), "disciplinaryViolations"), {
    tournamentId,
    ...input,
    status: "PENDING" as ViolationStatus,
    reportedBy: actor.email,
    reportedByUid: actor.uid,
    evidenceCount: 0,
    decisionNote: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await writeDisciplinaryLog({
    action: "VIOLATION_CREATE", actor, teamId: input.teamIds[0] ?? null,
    teamName: input.teamNames.join(" & "), violationId: ref.id,
    matchNumber: input.matchNumber, decision: "PENDING",
    after: input, reason: input.description.slice(0, 200),
  });
  return ref.id;
}

export async function setViolationStatus(
  violation: Violation,
  status: ViolationStatus,
  actor: Actor,
  note = "",
): Promise<void> {
  assertDb();
  requireRole(actor, canRecord(actor.role), "mengubah status pelanggaran");
  await updateDoc(doc(fdb(), `disciplinaryViolations/${violation.id}`), {
    status, decisionNote: note || violation.decisionNote || "", updatedAt: serverTimestamp(),
  });
  await writeDisciplinaryLog({
    action: "VIOLATION_STATUS", actor, teamId: violation.teamIds[0] ?? null,
    teamName: violation.teamNames.join(" & "), violationId: violation.id,
    matchNumber: violation.matchNumber, before: violation.status, after: status,
    reason: note, decision: status,
  });
}

// ============================================================
// B. PENALTIES (+ pemicu hitung ulang leaderboard)
// ============================================================
export interface PenaltyInput {
  violationId: string | null;
  kind: PenaltyKind;
  teamIds: string[];
  teamNames: string[];
  matchId: string | null;
  matchNumber: number | null;
  points: number;
  removeKills: boolean;
  reason: string;
  ruleBase: string;
  evidenceNote: string;
}

/**
 * Buat sanksi. Bila actor berwenang menerapkan (scoring admin / superadmin)
 * langsung APPLIED + leaderboard dihitung ulang; selain itu PROPOSED
 * (menunggu validasi) — sesuai pembagian peran §L.
 */
export async function createPenalty(
  tournamentId: string,
  input: PenaltyInput,
  actor: Actor,
): Promise<{ id: string; status: PenaltyStatus }> {
  assertDb();
  requireRole(actor, canRecord(actor.role), "mengusulkan sanksi");
  const applyNow = canApplyPenalty(actor.role);
  const status: PenaltyStatus = applyNow ? "APPLIED" : "PROPOSED";
  const payload = {
    code: code(),
    tournamentId,
    violationId: input.violationId,
    kind: input.kind,
    teamIds: input.teamIds,
    teamNames: input.teamNames,
    matchId: input.matchId,
    matchNumber: input.matchNumber,
    points: Math.max(0, Math.round(input.points)),
    removeKills: Boolean(input.removeKills),
    reason: input.reason,
    ruleBase: input.ruleBase,
    evidenceNote: input.evidenceNote,
    approvedBy: applyNow ? actor.email : "",
    proposedBy: actor.email,
    proposedByUid: actor.uid,
    status,
    statusNote: "",
    createdAt: serverTimestamp(),
    appliedAt: applyNow ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(fdb(), "disciplinaryPenalties"), payload);
  if (applyNow) {
    await buildAndWriteBoard(tournamentId, { actor: { uid: actor.uid, email: actor.email }, action: "PENALTY_APPLIED" });
  }
  await writeDisciplinaryLog({
    action: applyNow ? "PENALTY_APPLY" : "PENALTY_PROPOSE",
    actor,
    teamId: input.teamIds[0] ?? null,
    teamName: input.teamNames.join(" & "),
    violationId: input.violationId,
    penaltyId: ref.id,
    matchNumber: input.matchNumber,
    pointsDelta: applyNow ? -Math.max(0, Math.round(input.points)) : 0,
    before: null,
    after: { kind: input.kind, points: input.points, teams: input.teamNames, status },
    reason: input.reason,
    decision: status,
  });
  if (input.violationId && applyNow) {
    await updateDoc(doc(fdb(), `disciplinaryViolations/${input.violationId}`), {
      status: "SANCTIONED" as ViolationStatus, updatedAt: serverTimestamp(),
    }).catch(() => undefined);
  }
  return { id: ref.id, status };
}

export async function applyPenalty(
  penalty: Penalty,
  tournamentId: string,
  actor: Actor,
): Promise<void> {
  assertDb();
  requireRole(actor, canApplyPenalty(actor.role), "menerapkan sanksi (Scoring Admin/Super Admin)");
  if (penalty.status === "APPLIED") throw new Error("Sanksi sudah diterapkan — tidak bisa dobel (anti dobel-potong).");
  if (penalty.status === "CANCELLED") throw new Error("Sanksi sudah dibatalkan; buat sanksi baru bila perlu.");
  await updateDoc(doc(fdb(), `disciplinaryPenalties/${penalty.id}`), {
    status: "APPLIED", approvedBy: actor.email, appliedAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  await buildAndWriteBoard(tournamentId, { actor: { uid: actor.uid, email: actor.email }, action: "PENALTY_APPLIED" });
  await writeDisciplinaryLog({
    action: "PENALTY_APPLY", actor, teamId: penalty.teamIds[0] ?? null,
    teamName: penalty.teamNames.join(" & "), violationId: penalty.violationId,
    penaltyId: penalty.id, matchNumber: penalty.matchNumber,
    pointsDelta: -Math.max(0, penalty.points),
    before: penalty.status, after: "APPLIED", reason: penalty.reason, decision: "APPLIED",
  });
}

/** Batalkan sanksi (Super Admin, spec §L) → hitung ulang. Riwayat TIDAK dihapus. */
export async function cancelPenalty(
  penalty: Penalty,
  tournamentId: string,
  actor: Actor,
  reason: string,
): Promise<void> {
  assertDb();
  requireRole(actor, canDecideHeavy(actor.role), "membatalkan sanksi (Super Admin)");
  if (!reason.trim()) throw new Error("Pembatalan sanksi wajib menyertakan alasan (prinsip §N).");
  await updateDoc(doc(fdb(), `disciplinaryPenalties/${penalty.id}`), {
    status: "CANCELLED", statusNote: reason, updatedAt: serverTimestamp(),
  });
  await buildAndWriteBoard(tournamentId, { actor: { uid: actor.uid, email: actor.email }, action: "PENALTY_CANCELLED" });
  await writeDisciplinaryLog({
    action: "PENALTY_CANCEL", actor, teamId: penalty.teamIds[0] ?? null,
    teamName: penalty.teamNames.join(" & "), violationId: penalty.violationId,
    penaltyId: penalty.id, matchNumber: penalty.matchNumber,
    pointsDelta: penalty.status === "APPLIED" ? Math.max(0, penalty.points) : 0,
    before: penalty.status, after: "CANCELLED", reason, decision: "CANCELLED",
  });
}

// ============================================================
// C. TEAM STATUS (Warning/Suspend/Ban/DQ/Withdrawn/aktif kembali)
// ============================================================
export async function setTeamDisciplineStatus(
  team: { id: string; tournamentId: string; name: string },
  status: DisciplineStatus,
  input: { reason: string; ruleBase: string; relatedPenaltyId: string | null },
  actor: Actor,
): Promise<void> {
  assertDb();
  const heavy = status === "SUSPENDED" || status === "BANNED" || status === "DISQUALIFIED" || status === "WITHDRAWN";
  requireRole(actor, heavy ? canDecideHeavy(actor.role) : canRecord(actor.role), `mengubah status tim menjadi ${status}`);
  if (!input.reason.trim()) throw new Error("Tidak ada sanksi tanpa alasan (prinsip §N).");

  const ref = doc(fdb(), `disciplinaryTeams/${team.id}`);
  const prevSnap = await getDoc(ref);
  const prev = prevSnap.data() as TeamDiscipline | undefined;
  const entry = {
    at: Date.now(),
    from: (prev?.status ?? "REGISTERED") as DisciplineStatus,
    to: status,
    reason: input.reason,
    by: actor.email,
  };
  await setDoc(ref, {
    id: team.id,
    tournamentId: team.tournamentId,
    teamId: team.id,
    teamName: team.name,
    status,
    reason: input.reason,
    ruleBase: input.ruleBase,
    decidedBy: actor.email,
    relatedPenaltyId: input.relatedPenaltyId,
    since: Date.now(),
    history: [...(prev?.history ?? []), entry],
    updatedAt: serverTimestamp(),
  }, { merge: true });

  // Status yang menghapus poin (DQ/Ban) perlu hitung ulang board.
  if (heavy) {
    await buildAndWriteBoard(team.tournamentId, { actor: { uid: actor.uid, email: actor.email }, action: "TEAM_STATUS_" + status });
  }
  await writeDisciplinaryLog({
    action: "TEAM_STATUS_" + status, actor, teamId: team.id, teamName: team.name,
    penaltyId: input.relatedPenaltyId,
    pointsDelta: heavy ? 0 : 0,
    before: prev?.status ?? "REGISTERED", after: status,
    reason: input.reason, decision: status,
  });
}

// ============================================================
// D. ZERO MATCH (tidak kirim SS / terlambat > 10 menit)
// ============================================================
export async function markZeroMatch(
  tournamentId: string,
  match: { id: string; matchNumber: number },
  team: { id: string; name: string },
  cause: "NO_SCREENSHOT" | "LATE",
  info: { arrivalTime?: string; scheduledAt?: string; description: string },
  actor: Actor,
): Promise<{ id: string; code: string }> {
  assertDb();
  requireRole(actor, canApplyPenalty(actor.role), "memberi sanksi poin match 0 (Scoring Admin/Super Admin)");
  const ruleBase = cause === "NO_SCREENSHOT"
    ? "Juknis §E.6 — tim tidak mengirim SS hasil match: poin match tersebut 0."
    : "Juknis §E.1 — terlambat lebih dari 10 menit: poin match tersebut 0.";
  const payload = {
    code: code(),
    tournamentId,
    violationId: null,
    kind: "ZERO_MATCH",
    teamIds: [team.id],
    teamNames: [team.name],
    matchId: match.id,
    matchNumber: match.matchNumber,
    points: 0,
    removeKills: false,
    reason: info.description || (cause === "NO_SCREENSHOT" ? "Tidak mengirim screenshot hasil match." : "Terlambat lebih dari 10 menit."),
    ruleBase,
    evidenceNote: cause === "LATE" ? `Datang: ${info.arrivalTime ?? "-"} · Jadwal: ${info.scheduledAt ?? "-"}` : "",
    approvedBy: actor.email,
    proposedBy: actor.email,
    proposedByUid: actor.uid,
    status: "APPLIED",
    statusNote: "",
    createdAt: serverTimestamp(),
    appliedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(fdb(), "disciplinaryPenalties"), payload);
  await buildAndWriteBoard(tournamentId, { actor: { uid: actor.uid, email: actor.email }, action: "ZERO_MATCH_" + cause });
  await writeDisciplinaryLog({
    action: "ZERO_MATCH_" + cause, actor, teamId: team.id, teamName: team.name,
    penaltyId: ref.id, matchNumber: match.matchNumber,
    before: "poin match mengikuti hasil", after: "poin match = 0",
    reason: payload.reason, decision: "APPLIED",
  });
  return { id: ref.id, code: (payload as { code: string }).code };
}

/** Penghitung peringatan per tim (spec §D.5) — VERBAL + WARNING yang APPLIED. */
export async function countAppliedWarnings(teamId: string): Promise<number> {
  assertDb();
  const snap = await getDocs(query(
    collection(fdb(), "disciplinaryPenalties"),
    where("teamIds", "array-contains", teamId),
    where("status", "==", "APPLIED"),
  ));
  return snap.docs.filter((d) => {
    const k = (d.data() as Penalty).kind;
    return k === "VERBAL" || k === "WARNING";
  }).length;
}

// ============================================================
// E. EVIDENCE
// ============================================================
const EVIDENCE_MIME_OK = [
  "image/png", "image/jpeg", "image/webp", "image/gif",
  "video/mp4", "video/webm",
  "application/pdf", "text/plain",
];

export async function addEvidence(
  input: {
    violationId: string;
    kind: EvidenceKind;
    title: string;
    note: string;
    url?: string;
  },
  file: { mime: string; size: number; dataUrl: string; name: string } | null,
  actor: Actor,
): Promise<string> {
  assertDb();
  requireRole(actor, canRecord(actor.role), "mengunggah bukti");
  if (file) {
    if (!EVIDENCE_MIME_OK.includes(file.mime)) {
      throw new Error("Format file bukti tidak didukung (boleh: PNG/JPEG/WEBP/GIF, MP4/WEBM, PDF, TXT).");
    }
    if (file.size > MAX_INLINE_EVIDENCE_BYTES) {
      throw new Error(`Ukuran file ${(file.size / 1000).toFixed(0)} KB melebihi ${(MAX_INLINE_EVIDENCE_BYTES / 1000).toFixed(0)} KB. Simpan di Drive/lainnya lalu tempel tautannya (jenis bukti: LINK).`);
    }
  } else if (input.kind !== "LINK" && input.kind !== "WITNESS_NOTE" && input.kind !== "PANITIA_NOTE") {
    throw new Error("Pilih file atau gunakan jenis bukti LINK / catatan.");
  }
  const ref = await addDoc(collection(fdb(), "disciplinaryEvidence"), {
    violationId: input.violationId,
    kind: input.kind,
    title: input.title || file?.name || "Bukti",
    mime: file?.mime ?? "text/uri-list",
    size: file?.size ?? 0,
    dataUrl: file?.dataUrl ?? null,
    url: input.url ?? null,
    uploadedBy: actor.email,
    uploadedByUid: actor.uid,
    note: input.note,
    createdAt: serverTimestamp(),
  });
  const vSnap = await getDoc(doc(fdb(), `disciplinaryViolations/${input.violationId}`));
  const prevCount = ((vSnap.data() as Violation | undefined)?.evidenceCount) ?? 0;
  await updateDoc(doc(fdb(), `disciplinaryViolations/${input.violationId}`), {
    evidenceCount: prevCount + 1,
    updatedAt: serverTimestamp(),
  }).catch(() => undefined);
  await writeDisciplinaryLog({
    action: "EVIDENCE_ADD", actor, violationId: input.violationId,
    after: { kind: input.kind, title: input.title, size: file?.size ?? 0 },
    decision: "EVIDENCE",
  });
  return ref.id;
}

/** Bukti tidak boleh dihapus sembarangan setelah keputusan sanksi (spec §G). */
export async function deleteEvidence(
  evidence: EvidenceDoc,
  violationStatus: ViolationStatus,
  actor: Actor,
): Promise<void> {
  assertDb();
  const locked = violationStatus === "SANCTIONED" || violationStatus === "CLOSED";
  if (locked && !canDecideHeavy(actor.role)) {
    throw new Error("Bukti terkunci: laporan sudah SANCTIONED/CLOSED. Hanya Super Admin yang dapat, dengan alasan tercatat.");
  }
  if (locked) {
    await writeDisciplinaryLog({
      action: "EVIDENCE_DELETE_LOCKED", actor, violationId: evidence.violationId,
      before: { id: evidence.id, title: evidence.title },
      reason: "Penghapusan bukti pada laporan terkunci",
      decision: "ALLOWED_BY_SUPERADMIN",
    });
  }
  await deleteDoc(doc(fdb(), `disciplinaryEvidence/${evidence.id}`));
  await writeDisciplinaryLog({
    action: "EVIDENCE_DELETE", actor, violationId: evidence.violationId,
    before: { id: evidence.id, title: evidence.title, kind: evidence.kind },
    decision: "DELETED",
  });
}

// ============================================================
// F. APPEALS
// ============================================================
export async function createAppeal(
  tournamentId: string,
  input: {
    teamId: string;
    teamName: string;
    captainName: string;
    matchNumber: number | null;
    penaltyId: string | null;
    penaltySummary: string;
    reason: string;
    extraEvidenceNote: string;
  },
  actor: Actor,
): Promise<string> {
  assertDb();
  requireRole(actor, canRecord(actor.role), "mencatat keberatan atas nama ketua tim");
  if (!input.captainName.trim()) throw new Error("Nama ketua tim pengaju wajib diisi (juknis §E.8).");
  const ref = await addDoc(collection(fdb(), "disciplinaryAppeals"), {
    tournamentId,
    ...input,
    status: "SUBMITTED" as AppealStatus,
    submittedBy: actor.email,
    submittedByUid: actor.uid,
    reviewNote: "",
    reviewedBy: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await writeDisciplinaryLog({
    action: "APPEAL_CREATE", actor, teamId: input.teamId, teamName: input.teamName,
    penaltyId: input.penaltyId, matchNumber: input.matchNumber,
    decision: "SUBMITTED", after: { reason: input.reason.slice(0, 300) },
  });
  return ref.id;
}

/**
 * Tinjau keberatan. ACCEPTED → sanksi terkait DIBATALKAN (super admin),
 * poin dihitung ulang, riwayat sanksi tetap tersimpan.
 */
export async function reviewAppeal(
  appeal: Appeal,
  action: "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "CLOSED",
  note: string,
  actor: Actor,
): Promise<void> {
  assertDb();
  if (action === "ACCEPTED") {
    requireRole(actor, canDecideHeavy(actor.role), "menerima keberatan & membatalkan sanksi (Super Admin)");
  } else {
    requireRole(actor, canRecord(actor.role), "meninjau keberatan");
  }
  await updateDoc(doc(fdb(), `disciplinaryAppeals/${appeal.id}`), {
    status: action, reviewNote: note, reviewedBy: actor.email, updatedAt: serverTimestamp(),
  });

  if (action === "ACCEPTED" && appeal.penaltyId) {
    const pSnap = await getDoc(doc(fdb(), `disciplinaryPenalties/${appeal.penaltyId}`));
    const p = pSnap.data() as Penalty | undefined;
    if (p && p.status !== "CANCELLED") {
      await updateDoc(doc(fdb(), `disciplinaryPenalties/${appeal.penaltyId}`), {
        status: "CANCELLED", statusNote: `Keberatan ${appeal.id} diterima: ${note}`, updatedAt: serverTimestamp(),
      });
      await buildAndWriteBoard(appeal.tournamentId, { actor: { uid: actor.uid, email: actor.email }, action: "APPEAL_ACCEPTED_RECOMPUTE" });
      await writeDisciplinaryLog({
        action: "PENALTY_CANCEL", actor, teamId: appeal.teamId, teamName: appeal.teamName,
        violationId: null, penaltyId: appeal.penaltyId,
        matchNumber: appeal.matchNumber, before: p.status, after: "CANCELLED",
        reason: `Keberatan diterima: ${note}`, decision: "APPEAL_ACCEPTED",
      });
      if (p.violationId) {
        await updateDoc(doc(fdb(), `disciplinaryViolations/${p.violationId}`), {
          status: "APPEALED" as ViolationStatus, updatedAt: serverTimestamp(),
        }).catch(() => undefined);
      }
    }
  }
  await writeDisciplinaryLog({
    action: "APPEAL_REVIEW", actor, teamId: appeal.teamId, teamName: appeal.teamName,
    penaltyId: appeal.penaltyId, matchNumber: appeal.matchNumber,
    before: appeal.status, after: action, reason: note, decision: action,
  });
}

// ============================================================
// G. PENALTY CONFIG (versi + alasan + identitas, spec §J)
// ============================================================
export async function loadPenaltyConfig(): Promise<PenaltyConfig> {
  assertDb();
  const snap = await getDoc(doc(fdb(), "disciplinaryConfig/default"));
  if (!snap.exists()) return DEFAULT_PENALTY_CONFIG;
  return snap.data() as PenaltyConfig;
}

export async function savePenaltyConfig(
  next: PenaltyConfig,
  actor: Actor,
  reason: string,
): Promise<void> {
  assertDb();
  requireRole(actor, canDecideHeavy(actor.role), "mengubah konfigurasi penalti (Super Admin)");
  if (!reason.trim()) throw new Error("Perubahan aturan wajib memiliki alasan (spec §J).");
  const version = `CONFIG-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const withHistory: PenaltyConfig = {
    ...next,
    version,
    isOfficial: false,
    updatedAt: Date.now(),
    updatedBy: actor.email,
    updateReason: reason,
    history: [
      ...(next.history ?? []),
      { at: Date.now(), by: actor.email, reason, version },
    ].slice(-30),
  };
  await setDoc(doc(fdb(), "disciplinaryConfig/default"), withHistory, { merge: false });
  await writeDisciplinaryLog({
    action: "CONFIG_UPDATE", actor, before: { version: next.version }, after: { version },
    reason, decision: "CONFIG",
  });
}

// ============================================================
// H. UTILITAS
// ============================================================
export async function fetchRecentPenalties(tournamentId: string, max = 100): Promise<Penalty[]> {
  assertDb();
  const snap = await getDocs(query(
    collection(fdb(), "disciplinaryPenalties"),
    orderBy("createdAt", "desc"),
    limit(max),
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Penalty)
    .filter((p) => p.tournamentId === tournamentId);
}

export { penaltySummary };
