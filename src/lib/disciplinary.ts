// ============================================================
// STIKAR ESPORTS — Tournament Rules & Disciplinary Management
// Tipe, status, dan konfigurasi sanksi default.
// SUMBER ATURAN: "Juknis Lomba Free Fire — BOF" (Rabu, 18 November 2026)
// Nilai default TIDAK boleh bertentangan dengan juknis.
// ============================================================

import type { AdminRoleName } from "./types";

// ---------- Status ----------
export type ViolationStatus =
  | "PENDING"
  | "UNDER_REVIEW"
  | "VERIFIED"
  | "REJECTED"
  | "SANCTIONED"
  | "APPEALED"
  | "CLOSED";

export type ViolationCategory =
  | "TEAMING"
  | "CHEAT_JOKI"
  | "OUTSIDE_HELP"
  | "ROOM_SHARE"
  | "DISTURBANCE"
  | "VERBAL_ABUSE"
  | "NO_SCREENSHOT"
  | "LATE"
  | "OTHER";

export type ViolationSeverity = "RINGAN" | "SEDANG" | "BERAT";

export type PenaltyKind =
  | "VERBAL" // peringatan lisan
  | "WARNING" // peringatan tertulis
  | "KILL_REMOVAL" // kill hasil teaming dihapus
  | "POINT" // pengurangan poin
  | "ZERO_MATCH" // poin match tertentu = 0 (tidak kirim SS / terlambat >10 menit)
  | "MATCH_EJECTION" // dikeluarkan dari match
  | "SUSPENSION" // penangguhan sementara
  | "BAN" // larangan mengikuti match tertentu
  | "DISQUALIFICATION" // diskualifikasi + poin dihapus
  | "EXCLUSION"; // dikeluarkan dari lomba

export type PenaltyStatus = "PROPOSED" | "APPLIED" | "CANCELLED";

export type DisciplineStatus =
  | "REGISTERED"
  | "VERIFIED"
  | "ACTIVE"
  | "WARNING"
  | "SUSPENDED"
  | "BANNED"
  | "DISQUALIFIED"
  | "WITHDRAWN";

export type AppealStatus = "SUBMITTED" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "CLOSED";

export type EvidenceKind =
  | "SCREENSHOT"
  | "PHOTO"
  | "VIDEO"
  | "WITNESS_NOTE"
  | "DOCUMENT"
  | "PANITIA_NOTE"
  | "LINK";

// ---------- Peran (memperluas sistem role yang ada) ----------
// superadmin = Super Admin; admin = Tournament Admin; judge = Juri;
// scoring = Scoring Admin. Ketua tim & peserta TIDAK memakai akun:
// mereka dilayani lewat halaman publik /rules dan bantuan panitia.
export type StaffRole = Extract<AdminRoleName, "superadmin" | "admin" | "operator" | "judge" | "scoring">;

export function isSuperAdmin(role: string | null): boolean {
  return role === "superadmin";
}
export function canRecord(role: string | null): boolean {
  return role === "superadmin" || role === "admin" || role === "judge" || role === "operator";
}
export function canApplyPenalty(role: string | null): boolean {
  return role === "superadmin" || role === "scoring";
}
export function canDecideHeavy(role: string | null): boolean {
  // suspend / ban / diskualifikasi / pembatalan sanksi / ubah konfigurasi
  return role === "superadmin";
}

// ---------- Label ----------
export const VIOLATION_CATEGORY_LABEL: Record<ViolationCategory, string> = {
  TEAMING: "Teaming / kerja sama antar tim",
  CHEAT_JOKI: "Cheat, hack, bug, atau joki",
  OUTSIDE_HELP: "Mengintip / dibantu pihak luar",
  ROOM_SHARE: "Membagikan ID/password room",
  DISTURBANCE: "Ribut / mengganggu ketertiban",
  VERBAL_ABUSE: "Perkataan kasar / provokasi",
  NO_SCREENSHOT: "Tidak mengirim SS hasil match",
  LATE: "Terlambat lebih dari 10 menit",
  OTHER: "Lainnya (diatur panitia)",
};

export const VIOLATION_STATUS_LABEL: Record<ViolationStatus, string> = {
  PENDING: "PENDING",
  UNDER_REVIEW: "UNDER REVIEW",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
  SANCTIONED: "SANCTIONED",
  APPEALED: "APPEALED",
  CLOSED: "CLOSED",
};

export const PENALTY_KIND_LABEL: Record<PenaltyKind, string> = {
  VERBAL: "Peringatan lisan",
  WARNING: "Peringatan tertulis",
  KILL_REMOVAL: "Kill dihapus",
  POINT: "Pengurangan poin",
  ZERO_MATCH: "Poin match = 0",
  MATCH_EJECTION: "Dikeluarkan dari match",
  SUSPENSION: "Penangguhan",
  BAN: "Larangan match",
  DISQUALIFICATION: "Diskualifikasi",
  EXCLUSION: "Dikeluarkan dari lomba",
};

export const DISCIPLINE_STATUS_LABEL: Record<DisciplineStatus, string> = {
  REGISTERED: "REGISTERED",
  VERIFIED: "VERIFIED",
  ACTIVE: "ACTIVE",
  WARNING: "WARNING",
  SUSPENDED: "SUSPENDED",
  BANNED: "BANNED",
  DISQUALIFIED: "DISQUALIFIED",
  WITHDRAWN: "WITHDRAWN",
};

// ---------- Dokumen ----------
export interface Violation {
  id: string;
  tournamentId: string;
  teamIds: string[]; // >=1 tim; teaming bisa 2+ tim
  teamNames: string[];
  matchId: string | null;
  matchNumber: number | null;
  playerNames: string; // pemain yang terlibat (bebas teks)
  category: ViolationCategory;
  severity: ViolationSeverity;
  occurredAt: string; // deskripsi waktu kejadian (bebas, dari panitia)
  description: string;
  witness: string;
  reportedBy: string; // admin/panitia pencatat
  reportedByUid: string;
  status: ViolationStatus;
  evidenceCount?: number;
  createdAt?: number;
  updatedAt?: number;
  decisionNote?: string; // catatan keputusan/verifikasi
}

export interface Penalty {
  id: string;
  code: string; // kode unik, mis. SANKSI-7K2X
  tournamentId: string;
  violationId: string | null;
  kind: PenaltyKind;
  teamIds: string[];
  teamNames: string[];
  matchId: string | null; // null = berlaku total turnamen
  matchNumber: number | null;
  points: number; // nilai pengurangan (positif; engine yang menegatifkan)
  removeKills: boolean; // teaming: kill hasil teaming dihapus
  reason: string;
  ruleBase: string; // dasar peraturan (juknis §G ...)
  evidenceNote: string;
  approvedBy: string; // admin yang menyetujui/menerapkan
  proposedBy: string;
  proposedByUid: string;
  status: PenaltyStatus;
  statusNote?: string; // alasan pembatalan/penerapan
  createdAt?: number;
  appliedAt?: number | null;
  updatedAt?: number;
}

export interface TeamDiscipline {
  id: string; // = teamId
  tournamentId: string;
  teamId: string;
  teamName: string;
  status: DisciplineStatus;
  reason: string;
  ruleBase: string;
  decidedBy: string;
  relatedPenaltyId: string | null;
  since: number;
  history: { at: number; from: DisciplineStatus; to: DisciplineStatus; reason: string; by: string }[];
}

export interface EvidenceDoc {
  id: string;
  violationId: string;
  kind: EvidenceKind;
  title: string;
  mime: string;
  size: number;
  dataUrl: string | null; // file kecil (<= 900 KB) disimpan inline
  url: string | null; // bukti berukuran besar pakai tautan eksternal
  uploadedBy: string;
  uploadedByUid: string;
  note: string;
  createdAt?: number;
}

export interface Appeal {
  id: string;
  tournamentId: string;
  teamId: string;
  teamName: string;
  captainName: string; // ketua tim pengaju
  matchNumber: number | null;
  penaltyId: string | null;
  penaltySummary: string;
  reason: string;
  extraEvidenceNote: string;
  submittedBy: string; // dicatat panitia atas nama ketua tim
  submittedByUid: string;
  status: AppealStatus;
  reviewNote: string;
  reviewedBy: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface DisciplinaryLog {
  id: string;
  action: string;
  actorUid: string;
  actorEmail: string;
  actorRole: string;
  teamId: string | null;
  teamName: string;
  violationId: string | null;
  penaltyId: string | null;
  matchNumber: number | null;
  pointsDelta: number; // perubahan poin akibat aksi
  before: string; // JSON snapshot ringkas
  after: string;
  reason: string;
  decision: string;
  createdAt?: number;
}

// ---------- Konfigurasi penalti (default = juknis §G) ----------
export interface PenaltyConfig {
  version: string;
  isOfficial: boolean;
  effectiveFrom: number | null; // bila diubah saat turnamen berjalan
  teaming: {
    killRemoval: boolean;
    firstPerMatch: number; // -20 poin per match
    repeatPerMatch: number; // -40 poin
    severeAction: "DISQUALIFICATION" | "EXCLUSION";
    affectsBothTeams: boolean;
  };
  cheatJoki: { action: "DISQUALIFICATION"; wipePoints: boolean };
  outsideHelp: { perIncident: number }; // -10 per kejadian
  roomShare: { first: number; severeAction: "EXCLUSION" }; // -10, berat keluar lomba
  disturbance: { levels: number[]; escalate: "MATCH_EJECTION" }; // [0 lisan, 5, 10]
  verbalAbuse: { first: number; second: number; repeat: number }; // 0, 5, 10
  noScreenshot: { zeroMatch: boolean };
  late: { zeroMatch: boolean; arriveBeforeMinutes: number; toleranceMinutes: number };
  disabled: ViolationCategory[]; // aturan dinonaktifkan oleh keputusan resmi
  updatedAt?: number;
  updatedBy?: string;
  updateReason?: string;
  history: { at: number; by: string; reason: string; version: string }[];
}

export const DEFAULT_PENALTY_CONFIG: PenaltyConfig = {
  version: "JUKNIS-BOF-2026",
  isOfficial: true,
  effectiveFrom: null,
  teaming: { killRemoval: true, firstPerMatch: 20, repeatPerMatch: 40, severeAction: "DISQUALIFICATION", affectsBothTeams: true },
  cheatJoki: { action: "DISQUALIFICATION", wipePoints: true },
  outsideHelp: { perIncident: 10 },
  roomShare: { first: 10, severeAction: "EXCLUSION" },
  disturbance: { levels: [0, 5, 10], escalate: "MATCH_EJECTION" },
  verbalAbuse: { first: 0, second: 5, repeat: 10 },
  noScreenshot: { zeroMatch: true },
  late: { zeroMatch: true, arriveBeforeMinutes: 15, toleranceMinutes: 10 },
  disabled: [],
  history: [],
};

// Rekomendasi sanksi per kategori (dipakai form agar konsisten juknis).
export const SANCTION_MATRIX: Record<ViolationCategory, { points: number | "CONFIG"; kind: PenaltyKind; note: string }[]> = {
  TEAMING: [
    { points: "CONFIG", kind: "KILL_REMOVAL", note: "Kill hasil teaming dihapus + -20 poin per match (ulang: -40)" },
    { points: "CONFIG", kind: "POINT", note: "Pengurangan poin per match" },
    { points: "CONFIG", kind: "DISQUALIFICATION", note: "Pelanggaran berat atau berulang" },
  ],
  CHEAT_JOKI: [{ points: "CONFIG", kind: "DISQUALIFICATION", note: "Diskualifikasi dan poin dihapus" }],
  OUTSIDE_HELP: [{ points: "CONFIG", kind: "POINT", note: "-10 poin per kejadian" }],
  ROOM_SHARE: [
    { points: "CONFIG", kind: "POINT", note: "-10 poin" },
    { points: "CONFIG", kind: "EXCLUSION", note: "Pelanggaran berat: dikeluarkan dari lomba" },
  ],
  DISTURBANCE: [
    { points: 0, kind: "VERBAL", note: "Peringatan pertama (lisan)" },
    { points: "CONFIG", kind: "POINT", note: "Peringatan kedua: -5 poin" },
    { points: "CONFIG", kind: "POINT", note: "Peringatan ketiga: -10 poin" },
    { points: 0, kind: "MATCH_EJECTION", note: "Pelanggaran berlanjut: dikeluarkan dari match" },
  ],
  VERBAL_ABUSE: [
    { points: 0, kind: "VERBAL", note: "Peringatan pertama" },
    { points: "CONFIG", kind: "POINT", note: "Berikutnya: -5 poin" },
    { points: "CONFIG", kind: "POINT", note: "Berulang: -10 poin" },
  ],
  NO_SCREENSHOT: [{ points: "CONFIG", kind: "ZERO_MATCH", note: "Poin match tersebut 0" }],
  LATE: [{ points: "CONFIG", kind: "ZERO_MATCH", note: "Poin match tersebut 0 (terlambat >10 menit)" }],
  OTHER: [{ points: "CONFIG", kind: "POINT", note: "Sesuai keputusan panitia (diatur juknis §I)" }],
};

// ---------- Tipe ringan untuk form (hindari impor berat) ----------
export interface TeamLike { id: string; name: string; tag?: string }
export interface MatchLike { id: string; matchNumber: number; map?: string | null }

// ---------- Konten statis peraturan (halaman rules) ----------
export interface RulesGroup {
  id: string;
  title: string;
  items: { text: string; sub?: string[][] }[];
}

export const TOURNAMENT_RULES: RulesGroup[] = [
  {
    id: "umum",
    title: "A. Ketentuan Umum",
    items: [
      { text: "Mode Battle Royale Squad Custom Room, dilaksanakan Rabu, 18 November 2026." },
      { text: "Setiap tim terdiri dari 4 pemain (tanpa pemain cadangan, kecuali ditentukan panitia)." },
      { text: "Satu pemain hanya boleh terdaftar di satu tim." },
      { text: "Pemain wajib menggunakan akun sendiri — joki dilarang." },
      { text: "Pertandingan dimainkan lewat HP. Emulator, script, dan aplikasi tambahan dilarang." },
      { text: "Setiap tim menunjuk satu ketua tim sebagai penghubung panitia." },
    ],
  },
  {
    id: "pendaftaran",
    title: "B. Pendaftaran",
    items: [
      { text: "Biaya pendaftaran Rp20.000 per tim." },
      { text: "Batas akhir pendaftaran: Minggu, 15 November 2026." },
      { text: "Data tim dan empat pemain (nama lengkap, kelas, ID Free Fire) wajib lengkap." },
      { text: "Satu room maksimal 12 tim — pembagian room diatur ketua panitia." },
    ],
  },
  {
    id: "sistem",
    title: "C. Sistem Pertandingan",
    items: [
      { text: "Pertandingan dimainkan sebanyak 4 match; poin setiap match diakumulasi." },
      { text: "Map dipilih/diatur oleh panitia dan sama untuk semua tim." },
      { text: "Semua tim wajib mengikuti ketentuan room (ID & password) yang diberikan panitia." },
    ],
  },
  {
    id: "poin",
    title: "D. Sistem Poin",
    items: [
      {
        text: "Placement point per match:",
        sub: [["1st (Booyah!) 20", "2nd 17", "3rd 15", "4th 13"], ["5th 12", "6th 10", "7th 6", "8th 4"], ["9th 3", "10th 2", "11th 1", "12th 0"]],
      },
      { text: "Kill point: setiap kill = 2 poin." },
      { text: "TOTAL MATCH POINT = PLACEMENT POINT + KILL POINT - VIOLATION PENALTY." },
      { text: "Total turnamen = akumulasi poin seluruh match." },
      { text: "Poin seri: (1) bandingkan placement point; (2) jika masih seri, urutan placement pada game terakhir." },
    ],
  },
  {
    id: "peraturan-match",
    title: "E. Peraturan Pertandingan",
    items: [
      { text: "Tim wajib hadir dan siap 15 menit sebelum jadwal." },
      { text: "Terlambat lebih dari 10 menit = tidak ikut match tersebut (poin 0)." },
      { text: "Dilarang membagikan ID/password room kepada pihak lain." },
      { text: "Dilarang teaming (kerja sama antar tim, termasuk tim satu kelas)." },
      { text: "Dilarang cheat, hack, bug, atau kecurangan lainnya." },
      { text: "Dilarang mengintip/melihat layar tim lain atau minta bantuan pihak luar." },
      { text: "Ketua tim wajib mengirim screenshot hasil match (peringkat + kill) ke grup." },
      { text: "Tim yang tidak mengirim screenshot mendapat 0 poin pada match tersebut." },
      { text: "Koneksi terputus: match tetap berjalan dan tidak diulang, kecuali gangguan dari server/panitia." },
    ],
  },
  {
    id: "ketertiban",
    title: "F. Ketertiban",
    items: [
      { text: "Suara game dikecilkan atau pakai headset/earphone." },
      { text: "Tidak berteriak, tidak bersorak berlebihan saat bermain." },
      { text: "Suporter duduk tenang di area yang ditentukan." },
      { text: "Dilarang berkata kasar, mengejek, atau memprovokasi tim lain." },
      { text: "Peserta yang tidak bertanding tidak boleh mengganggu jalannya lomba." },
    ],
  },
];
