// ============================================================
// STIKAR ESPORTS — BOF · AI OCR
// Lib MURNI (tanpa import firebase/network) — dipakai server
// (route /api/ai/ocr), klien (pencocokan ulang) dan test.
// Fungsi: normalisasi nama tim, pencocokan fuzzy bertingkat,
//         memori alias tim, parser teks OCR polos.
// ============================================================

import type { OcrRow, Team } from "./types";

/** Token panggilan yang sering menempel pada nama tim — diabaikan saat membandingkan. */
const NOISE_TOKENS = new Set([
  "TEAM", "SQUAD", "ESPORT", "ESPORTS", "ESP", "E S", "GR", "GG", "CREW",
  "CLAN", "GUILD", "OFFICIAL", "OFFC", "GAMING", "GAME", "SQUADRA",
]);

/**
 * Normalisasi nama tim → kunci pembanding.
 * "•• TEAM REVεNGε ••" / "team-revengε" → "REVNGE"-style kunci huruf kapital.
 */
export function normalizeTeamKey(raw: string): string {
  const upper = (raw ?? "").toUpperCase();
  // Buang karakter non A-Z0-9 (simbol dekoratif FF banyak).
  let s = upper.replace(/[^A-Z0-9\s]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";
  const tokens = s.split(" ").filter(Boolean);
  const kept = tokens.filter((t) => !NOISE_TOKENS.has(t));
  const core = (kept.length ? kept : tokens).join("");
  return core;
}

/** Jarak Levenshtein (tanpa batas — input pendek, aman). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Skor kemiripan 0..1 dua string mentah (setelah normalisasi). */
export function similarity(a: string, b: string): number {
  const ka = normalizeTeamKey(a);
  const kb = normalizeTeamKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  // Satu memuat yang lain (mis. "REV" vs "REVENGE") — nilai tinggi.
  if (ka.includes(kb) || kb.includes(ka)) {
    const shorter = Math.min(ka.length, kb.length);
    return shorter >= 3 ? 0.85 : 0.6;
  }
  const dist = levenshtein(ka, kb);
  const ratio = 1 - dist / Math.max(ka.length, kb.length);
  return ratio;
}

/** Seluruh "nama" yang mewakili sebuah tim — dipakai AI & fuzzy matcher. */
export function teamNames(t: Team): string[] {
  return [
    t.name,
    t.tag ? `[${t.tag}]` : "",
    t.tag ?? "",
    t.captain ?? "",
    ...(t.roster ?? []).map((r) => r.nickname),
    ...(t.ocrAliases ?? []),
  ].filter(Boolean) as string[];
}

export interface TeamMatchResult {
  teamId: string;
  teamName: string;
  score: number;
  /** Nama sumber yang memberi skor tertinggi (nama tim / kapten / alias). */
  matchedOn: string;
}

/**
 * Cocokkan satu nama mentah dari screenshot ke daftar tim terdaftar.
 * Memakai memori: nama tim, tag, kapten, roster, dan alias OCR lampau.
 * Ambang penerimaan: 0.72 (di bawah itu dianggap tidak cocok).
 */
export function bestTeamMatch(
  raw: string,
  teams: Pick<Team, "id" | "name" | "tag" | "captain" | "roster" | "ocrAliases">[],
  minScore = 0.72,
): TeamMatchResult | null {
  const rawKey = normalizeTeamKey(raw);
  if (!rawKey) return null;
  let best: TeamMatchResult | null = null;
  for (const t of teams) {
    for (const name of teamNames(t as Team)) {
      const score = similarity(raw, name);
      if (!best || score > best.score) {
        best = { teamId: t.id, teamName: t.name, score, matchedOn: name };
      }
      // Kecocokan sempurna — berhenti lebih awal.
      if (score === 1) return best;
    }
  }
  return best && best.score >= minScore ? best : null;
}

/** Lembutkan hasil AI: pastikan tipe angka/null dan string terpotong wajar. */
export function sanitizeOcrRows(input: unknown, maxRows = 24): OcrRow[] {
  if (!Array.isArray(input)) return [];
  const rows: OcrRow[] = [];
  for (const item of input.slice(0, maxRows)) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const teamRaw = String(o.teamRaw ?? o.team ?? o.name ?? "").trim();
    if (!teamRaw) continue;
    const num = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
    };
    const conf = Number(o.confidence);
    rows.push({
      rank: num(o.rank ?? o.placement),
      teamRaw: teamRaw.slice(0, 64),
      teamId: typeof o.teamId === "string" && o.teamId ? o.teamId : null,
      teamName: typeof o.teamName === "string" ? o.teamName : null,
      kills: num(o.kills),
      points: num(o.points),
      confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.5,
    });
  }
  return rows;
}

/**
 * Parser teks OCR polos (fallback ocr.space).
 * Menangani dua pola umum layar skor Free Fire:
 *   a) satu baris lengkap: "1 TEAM REVENGE 12 36" / "2. ALPHA WOLF 8"
 *   b) angka pecah ke baris sendiri (kolom terpisah) — angka tanpa huruf
 *      digabungkan ke baris tim terdekat: baris tim → kills → poin.
 */
export function parseOcrSpaceText(text: string, maxRows = 24): OcrRow[] {
  const rows: OcrRow[] = [];
  let lastRow: OcrRow | null = null;
  let nextRank: number | null = null; // angka sisa → rank baris tim berikutnya
  const lines = (text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Baris angka murni (OCR kolom terpisah) → pasangkan ke baris tim terdekat.
    if (/^\d{1,3}$/.test(line)) {
      const n = Number(line);
      if (lastRow && lastRow.kills == null) lastRow.kills = n;
      else if (lastRow && lastRow.points == null) lastRow.points = n;
      else nextRank = n;
      continue;
    }
    // Baris harus memuat minimal satu huruf (bukan angka/teks UI).
    if (!/[A-Z]/i.test(line)) continue;
    if (/^(booyah|total|match|survival|time|waktu|mode|ping|spectat|player|pemain|kills|kill|points?|pts|poin)\b/i.test(line)) continue;

    let s = line;
    // 1) Rank di depan: "1", "1.", "1)", "1 -" ...
    let rank: number | null = null;
    const head = s.match(/^(\d{1,2})\s*[.)\-–—:|]?\s+(.*)$/);
    if (head && head[2]) {
      rank = Number(head[1]);
      s = head[2];
    }
    // 2) Kata kunci trailing: "12 kills", "30 pts" — pisahkan sebelum angka ekor.
    s = s.replace(/\s*[•\-–—:|]*\s*(?:kills?|poin|poin\s*tim|points?|pts)\s*$/i, "");
    // 3) Ambil MAKSIMAL 2 angka dari EKOR baris (pertama = kills, terakhir = poin).
    const tails: number[] = [];
    for (let i = 0; i < 2; i++) {
      const t = s.match(/(?:^|\s)(\d{1,3})\s*[•\-–—:|]*$/);
      if (!t) break;
      tails.unshift(Number(t[1]));
      s = s.slice(0, t.index ?? undefined).trimEnd();
    }
    // 4) Nama tim = sisa; bersihkan pemisah di ujung.
    let teamRaw = s.replace(/[\s•\-–—:|]+$/g, "").trim();
    if (!teamRaw || !/[A-Z]/i.test(teamRaw) || teamRaw.length > 40) {
      if (rank == null) continue;
      // Baris mungkin "12 REVENGEE" — angka tunggal di depan adalah kills.
      const rev = teamRaw.match(/^(\d{1,3})\s+(.+)$/);
      if (!rev) continue;
      teamRaw = rev[2].trim();
      if (!tails.length) tails.push(Number(rev[1]));
    }
    // tails terurut dari depan: [angka-pertama-ekor, angka-terakhir].
    const kills = tails.length >= 1 ? tails[0] : null;
    const points = tails.length >= 2 ? tails[1] : null;
    if (rank == null && nextRank != null) {
      rank = nextRank;
      nextRank = null;
    }
    const row: OcrRow = {
      rank: rank != null && rank >= 1 && rank <= 60 ? rank : null,
      teamRaw: teamRaw.slice(0, 64),
      teamId: null,
      kills: kills != null && kills >= 0 && kills <= 99 ? kills : null,
      points: points != null && points >= 0 ? points : null,
      confidence: 0.35,
    };
    rows.push(row);
    lastRow = row;
    if (rows.length >= maxRows) break;
  }
  return rows;
}
