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

/**
 * Ambang kemiripan nama PEMAIN sedikit lebih longgar daripada nama tim:
 * ID Free Fire sering memakai simbol/angka ganda ("RBL Graceeᴮ", "17Sezyyyqt").
 */
export const PLAYER_MATCH_MIN_SCORE = 0.7;

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

/**
 * Lembutkan hasil AI: pastikan tipe angka/null dan string terpotong wajar.
 *
 * ATURAN INTI BOF: satu baris = SATU blok placement (top #). Layar Free Fire
 * menampilkan sampai 4 PEMAIN per blok (nama + "N Kill"). Kill tim = JUMLAH
 * kill semua anggota blok (dihitung total, bukan 1 orang). Penjumlahan
 * dilakukan ulang DI SERVER dari memberKills — angka kills dari AI hanya
 * pembanding; bila beda, dipakai hasil penjumlahan rincian.
 */
export function sanitizeOcrRows(input: unknown, maxRows = 60): OcrRow[] {
  if (!Array.isArray(input)) return [];
  const rows: OcrRow[] = [];
  for (const item of input.slice(0, maxRows)) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const num = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
    };

    // --- Rincian pemain: [{name, kills}] | {name: kills} | ["nama", ...] ---
    const memberKills: { name: string; kills: number | null }[] = [];
    const playerNames: string[] = [];
    const members = o.memberKills ?? o.members ?? o.players_detail ?? o.playersDetail ?? null;
    if (Array.isArray(members)) {
      for (const m of members) {
        if (typeof m === "string") {
          const nm = m.trim().slice(0, 48);
          if (nm) { playerNames.push(nm); memberKills.push({ name: nm, kills: null }); }
        } else if (m && typeof m === "object") {
          const mo = m as Record<string, unknown>;
          const nm = String(mo.name ?? mo.player ?? mo.nama ?? "").trim().slice(0, 48);
          const k = num(mo.kills ?? mo.kill ?? mo.poin_kill);
          if (nm) {
            playerNames.push(nm);
            memberKills.push({ name: nm, kills: k });
          }
        }
      }
    } else if (members && typeof members === "object") {
      for (const [nm, k] of Object.entries(members as Record<string, unknown>)) {
        const name = nm.trim().slice(0, 48);
        const kNum = num(k);
        if (name) { playerNames.push(name); memberKills.push({ name, kills: kNum }); }
      }
    } else if (Array.isArray(o.players)) {
      for (const p of o.players) {
        if (typeof p === "string") {
          const nm = p.trim().slice(0, 48);
          if (nm) { playerNames.push(nm); memberKills.push({ name: nm, kills: null }); }
        } else if (p && typeof p === "object") {
          const po = p as Record<string, unknown>;
          const nm = String(po.name ?? po.player ?? po.nama ?? "").trim().slice(0, 48);
          const k = num(po.kills ?? po.kill);
          if (nm) { playerNames.push(nm); memberKills.push({ name: nm, kills: k }); }
        }
      }
    }

    // --- Nama di layar: bisa nama tim ATAU gabungan nama pemain ---
    let teamRaw = String(o.teamRaw ?? o.team ?? o.screenTeam ?? o.name ?? o.screen ?? o.diLayar ?? "").trim();
    if (!teamRaw && playerNames.length) teamRaw = playerNames.join(", ");
    if (!teamRaw) continue;

    // --- KILLS = penjumlahan rincian (otoritatif) | angka AI sebagai cadangan ---
    let kills = num(o.kills);
    if (memberKills.length) {
      const sum = memberKills.reduce((acc, m) => acc + (Number.isFinite(m.kills) ? (m.kills as number) : 0), 0);
      kills = sum;
    }

    const conf = Number(o.confidence);
    rows.push({
      rank: num(o.rank ?? o.placement),
      teamRaw: teamRaw.slice(0, 120),
      teamId: typeof o.teamId === "string" && o.teamId ? o.teamId : null,
      teamName: typeof o.teamName === "string" ? o.teamName : null,
      kills,
      points: num(o.points),
      confidence: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.5,
      players: playerNames.length ? playerNames.slice(0, 8) : undefined,
      memberKills: memberKills.length ? memberKills.slice(0, 8) : undefined,
    });
  }
  return rows;
}

/**
 * Cocokkan SATU BARIS hasil OCR (satu blok placement) ke tim terdaftar
 * dengan PEMUNGUTAN SUARA: setiap nama pemain di blok dicocokkan ke memori
 * tim (nama, tag, kapten, roster, alias). Blok milik tim yang paling banyak
 * pemainnya cocok. Cocok dipakai bila:
 *   - ≥ 2 pemain berbeda menunjuk tim yang sama, ATAU
 *   - 1 pemain cocok SEMPURNA (skor 1) / nama tim di layar cocok.
 * Ini kunci pencocokan untuk layar hasil FF yang TIDAK menampilkan nama tim.
 */
export function matchOcrRowToTeam(
  row: OcrRow,
  teams: Pick<Team, "id" | "name" | "tag" | "captain" | "roster" | "ocrAliases">[],
): { teamId: string; teamName: string; score: number; votes: number; matchedOn: string[] } | null {
  const candidates = [
    row.teamRaw,
    ...(row.players ?? []),
    ...(row.memberKills ?? []).map((m) => m.name),
  ].map((s) => (s ?? "").trim()).filter(Boolean);

  if (!candidates.length) return null;

  // (1) Coba nama lengkap baris (nama tim bila layar menampilkannya).
  if (row.teamRaw && !(row.players?.length && row.teamRaw.includes(","))) {
    const m = bestTeamMatch(row.teamRaw, teams, 0.72);
    if (m && m.score >= 0.9) {
      return { teamId: m.teamId, teamName: m.teamName, score: m.score, votes: 1, matchedOn: [m.matchedOn] };
    }
  }

  // (2) Voting per pemain.
  const votes = new Map<string, { teamName: string; count: number; score: number; matchedOn: string[] }>();
  for (const cand of candidates) {
    const m = bestTeamMatch(cand, teams, 0.72);
    if (!m) continue;
    const cur = votes.get(m.teamId) ?? { teamName: m.teamName, count: 0, score: 0, matchedOn: [] };
    cur.count += 1;
    cur.score = Math.max(cur.score, m.score);
    if (!cur.matchedOn.includes(m.matchedOn)) cur.matchedOn.push(m.matchedOn);
    votes.set(m.teamId, cur);
  }
  let best: { teamId: string; teamName: string; score: number; votes: number; matchedOn: string[] } | null = null;
  for (const [teamId, v] of votes) {
    const ok = v.count >= 2 || v.score === 1;
    if (!ok) continue;
    if (!best || v.count > best.votes || (v.count === best.votes && v.score > best.score)) {
      best = { teamId, teamName: v.teamName, score: v.score, votes: v.count, matchedOn: v.matchedOn };
    }
  }
  return best;
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
