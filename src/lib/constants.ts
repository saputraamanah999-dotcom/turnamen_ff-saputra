// ============================================================
// STIKAR ESPORTS — Konstanta resmi BOF
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
  brand: "STIKAR ESPORTS",
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
  | "announcement"
  | "score-bug"
  | "winner"
  | "starting-soon"
  | "emergency";

export const OVERLAY_LAYOUTS: { value: OverlayLayout; label: string; note: string }[] = [
  { value: "full", label: "Full Leaderboard", note: "Semua tim, sisi kanan layar" },
  { value: "compact", label: "Compact Leaderboard", note: "Tim teratas saja" },
  { value: "top3", label: "Top 3", note: "Kartu podium peringkat" },
  { value: "match-info", label: "Match Info", note: "Info pertandingan berjalan" },
  { value: "lower-third", label: "Lower Third", note: "Pengumuman di bawah layar" },
  { value: "announcement", label: "Announcement Banner", note: "Banner pengumuman di atas layar" },
  { value: "score-bug", label: "Score Bug", note: "Info kecil di sudut layar" },
  { value: "winner", label: "Winner", note: "Pengumuman juara" },
  { value: "starting-soon", label: "Starting Soon", note: "Countdown sebelum match" },
  { value: "emergency", label: "Emergency", note: "Layar gangguan broadcast" },
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

/** Nilai untuk <input type="datetime-local"> memakai waktu LOKAL (bukan UTC!).
 *  Pakai toISOString() menggeser jam di zona non-UTC (mis. WITA ±8 jam) —
 *  ini penyebab "error date": jadwal 19:00 tampil 11:00 lalu bergeser saat disimpan. */
export function toDateTimeInputValue(ts?: number | null): string {
  const d = toDate(ts);
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    "T" + pad(d.getHours()) + ":" + pad(d.getMinutes())
  );
}

/** ============================================================
 *  OVERLAY LAYER REGISTRY (PHASE 2 §13) — 23 layer resmi
 *  ============================================================ */
export type OverlayPosition = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";

export interface OverlayLayerDef {
  id: string;
  label: string;
  group: "brand" | "match" | "data" | "broadcast" | "result" | "screen";
  pos: OverlayPosition;
}

export const OVERLAY_LAYERS: OverlayLayerDef[] = [
  { id: "tournament-logo", label: "Tournament Logo", group: "brand", pos: "tl" },
  { id: "stikar-branding", label: "STIKAR ESPORTS Branding", group: "brand", pos: "tl" },
  { id: "live-badge", label: "LIVE Badge", group: "brand", pos: "tr" },
  { id: "tournament-header", label: "Tournament Header", group: "match", pos: "tc" },
  { id: "match-number", label: "Match Number", group: "match", pos: "tc" },
  { id: "round-number", label: "Round Number", group: "match", pos: "tc" },
  { id: "map-name", label: "Map Name", group: "match", pos: "tc" },
  { id: "match-timer", label: "Match Timer", group: "match", pos: "tr" },
  { id: "gameplay-frame", label: "Gameplay Frame", group: "data", pos: "mc" },
  { id: "leaderboard-panel", label: "Leaderboard Panel", group: "data", pos: "mr" },
  { id: "top3-panel", label: "Top 3 Panel", group: "data", pos: "bl" },
  { id: "team-info", label: "Team Information", group: "data", pos: "ml" },
  { id: "kill-feed", label: "Kill Feed", group: "broadcast", pos: "tr" },
  { id: "lower-third", label: "Lower Third", group: "broadcast", pos: "bc" },
  { id: "broadcast-ticker", label: "Broadcast Ticker", group: "broadcast", pos: "bc" },
  { id: "announcement-banner", label: "Announcement Banner", group: "broadcast", pos: "tc" },
  { id: "match-result", label: "Match Result", group: "result", pos: "mc" },
  { id: "winner-reveal", label: "Winner Reveal", group: "result", pos: "mc" },
  { id: "mvp-display", label: "MVP Display", group: "result", pos: "ml" },
  { id: "champion-display", label: "Champion Display", group: "result", pos: "mc" },
  { id: "starting-soon", label: "Starting Soon Screen", group: "screen", pos: "mc" },
  { id: "technical-difficulties", label: "Technical Difficulties Screen", group: "screen", pos: "mc" },
  { id: "emergency-screen", label: "Emergency Screen", group: "screen", pos: "mc" },
];

export const OVERLAY_PRESETS: { id: string; name: string; layers: string[]; note: string }[] = [
  {
    id: "full-broadcast", name: "FULL BROADCAST",
    layers: ["tournament-logo", "stikar-branding", "live-badge", "tournament-header", "match-number", "round-number", "map-name", "leaderboard-panel", "broadcast-ticker"],
    note: "Gameplay + header + leaderboard + live badge",
  },
  {
    id: "clean-gameplay", name: "CLEAN GAMEPLAY",
    layers: ["tournament-logo", "live-badge"],
    note: "Gameplay dominan, info minimal",
  },
  {
    id: "full-leaderboard", name: "FULL LEADERBOARD",
    layers: ["tournament-header", "live-badge", "leaderboard-panel"],
    note: "Leaderboard tampil besar",
  },
  {
    id: "top3", name: "TOP 3",
    layers: ["tournament-header", "top3-panel"],
    note: "Tiga tim teratas",
  },
  {
    id: "match-info", name: "MATCH INFO",
    layers: ["tournament-header", "match-number", "round-number", "map-name"],
    note: "Hanya informasi pertandingan",
  },
  {
    id: "result-presentation", name: "RESULT PRESENTATION",
    layers: ["tournament-header", "match-result", "top3-panel"],
    note: "Tampilan hasil pertandingan",
  },
  {
    id: "champion-reveal", name: "CHAMPION REVEAL",
    layers: ["champion-display", "winner-reveal", "mvp-display"],
    note: "Tampilan juara turnamen",
  },
  {
    id: "emergency", name: "EMERGENCY",
    layers: ["technical-difficulties", "emergency-screen"],
    note: "Layar gangguan siaran",
  },
];

export const OVERLAY_SCENES: { id: string; label: string; preset: string }[] = [
  { id: "gameplay", label: "Scene Gameplay", preset: "full-broadcast" },
  { id: "full-leaderboard", label: "Scene Full Leaderboard", preset: "full-leaderboard" },
  { id: "top3", label: "Scene Top 3", preset: "top3" },
  { id: "champion", label: "Scene Champion", preset: "champion-reveal" },
  { id: "break", label: "Scene Break", preset: "match-info" },
  { id: "emergency", label: "Scene Emergency", preset: "emergency" },
];
