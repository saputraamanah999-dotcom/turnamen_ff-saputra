// ============================================================
// ZEROID ESPORTS — Konstanta resmi BOF
// ============================================================

import type { MatchFormat } from "./types";

/** Poin placement resmi BOF — JANGAN diubah (index 0 = Juara 1). */
export const OFFICIAL_PLACEMENT_POINTS: number[] = [
  20, 17, 15, 13, 12, 10, 6, 4, 3, 2, 1, 0,
];

/** Poin per kill resmi BOF. */
export const OFFICIAL_KILL_POINT = 2;

/** Versi aturan skor yang dicatat pada setiap pertandingan. */
export const SCORING_VERSION = "BOF-OFFICIAL-v1";

/** Kapasitas default turnamen. */
export const DEFAULT_TEAM_CAPACITY = 12;

export const TOURNAMENT_ID_DEFAULT = "bof-main";

export const MAP_CATALOG = [
  "BERMUDA",
  "PURGATORY",
  "KALAHARI",
  "ALPINE",
  "NEXTERRA",
] as const;

export const MATCH_FORMATS: { value: MatchFormat; label: string; games: number }[] = [
  { value: "BO3", label: "Best of 3", games: 3 },
  { value: "BO5", label: "Best of 5", games: 5 },
  { value: "BO7", label: "Best of 7", games: 7 },
  { value: "CUSTOM", label: "Custom", games: 0 },
];

export const ORG = {
  brand: "ZEROID ESPORTS",
  tournament: "BATTLE OFF FRIENDS",
  tournamentShort: "BOF",
  institution: "SMK TI BALI GLOBAL KARANGASEM",
  developer: "SAPUTRA DEVELOPER",
} as const;

export const SCENE_LIST = [
  "Starting Soon",
  "Main Gameplay",
  "Gameplay + Compact Leaderboard",
  "Full Leaderboard",
  "Top 3 Ranking",
  "Match Results",
  "Break",
  "Winner Announcement",
  "Stream Offline",
] as const;

export type OverlayLayout =
  | "full"
  | "compact"
  | "top3"
  | "match-info"
  | "lower-third"
  | "score-bug"
  | "winner";

export const OVERLAY_LAYOUTS: { value: OverlayLayout; label: string; note: string }[] = [
  { value: "full", label: "Full Leaderboard", note: "Semua tim, sisi kanan layar" },
  { value: "compact", label: "Compact Leaderboard", note: "Tim teratas saja" },
  { value: "top3", label: "Top 3", note: "Kartu podium peringkat" },
  { value: "match-info", label: "Match Info", note: "Info pertandingan berjalan" },
  { value: "lower-third", label: "Lower Third", note: "Pengumuman di bawah layar" },
  { value: "score-bug", label: "Score Bug", note: "Info kecil di sudut layar" },
  { value: "winner", label: "Winner", note: "Pengumuman juara" },
];

export const OVERLAY_DIMENSIONS = [
  { width: 1920, height: 1080 },
  { width: 1600, height: 900 },
  { width: 1280, height: 720 },
] as const;

/** Format waktu Indonesia — toleran terhadap number, Date, string, dan Firestore Timestamp. */
export function formatDateTime(
  ts?: number | { seconds?: number } | Date | string | null,
): string {
  const d = toDate(ts);
  if (!d) return "-";
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(
  ts?: number | { seconds?: number } | Date | string | null,
): string {
  const d = toDate(ts);
  if (!d) return "-";
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function toDate(
  ts?: number | { seconds?: number } | Date | string | null,
): Date | null {
  if (ts == null) return null;
  let d: Date;
  if (typeof ts === "number") d = new Date(ts);
  else if (ts instanceof Date) d = ts;
  else if (typeof ts === "object" && typeof ts.seconds === "number")
    d = new Date(ts.seconds * 1000);
  else d = new Date(ts as string);
  return Number.isNaN(d.getTime()) ? null : d;
}
