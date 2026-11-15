// ============================================================
// STIKAR ESPORTS — BOF · PARSER "KILL-ANCHORED" v3 (TANPA NAMA PEMAIN)
//
// ============================================================
// KENAPA DITULIS ULANG (kesalahan mesin lama yang diperbaiki):
//   Mesin lama mencari ANCHOR RANK (badge 1,2,3 emas) untuk menemukan
//   blok placement → badge emas sering TIDAK terbaca Tesseract → hanya
//   3 blok dari 10 tim, dan zoom piksel per sel 2x2 menghasilkan angka
//   salah (contoh nyata: top 1 terbaca "12" padahal 3+6+5+5 = 19).
//
//   Prinsip baru (diverifikasi pada screenshot asli pengguna):
//   1. Kata "Kill" hampir SELALU terbaca (font kuning di baris gelap) —
//      jadikan ANCHOR utama, bukan badge rank.
//   2. Angka kill sering SALAH BERSATU dengan "Kill" dan terbaca
//      sebagai huruf ("4Kil","TKill","gil","OKI") → teks mentah tidak
//      pernah dipercaya: SETIAP SEL angka di-zoom ulang (rescue) dan
//      dibaca ulang dengan MASK KUNING + whitelist digit 0-9.
//   3. Posisi-x angka kill SANGAT konsisten (±3 px) → GRID kolom
//      (band) × baris; sel tanpa bukti teks dibaca dari slot grid,
//      TAPI hanya diterima bila keyakinannya tinggi (tidak mengarang).
//   4. Rank = badge di strip vertikal sejajar; kalau tidak terbaca,
//      diisi OTOMATIS dari urutan (kolom kiri mulai 1). Jadi 10 tim
//      tetap 10 baris walau badge emas tak terbaca.
//   5. TOTAL KILL TIM = penjumlahan kill dalam satu blok placement
//      (sampai 4 pemain). NAMA PEMAIN SENGAJA DIABAIKAN — hasil hanya
//      { rank, total kill }; admin memilih tim terdaftarnya sendiri.
// ============================================================

export interface OcrWord {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  conf: number;
}

/** Persegi zona angka (koordinat gambar) untuk rescue zoom-digit. */
export interface DigitZone {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Satu sel angka kill (1 pemain) — menempel pada kata "Kill". */
export interface KillPair {
  /** Nilai kill terbaca (0..30 wajar; di luar itu tetap dipakai tapi ditandai). */
  value: number;
  /** Titik tengah token angka (koordinat gambar). */
  cx: number;
  /** Titik tengah baris (gabungan angka + kata Kill). */
  cy: number;
  /** Tinggi baris perkiraan. */
  h: number;
  /** Keyakinan sumber (0..100, gaya Tesseract). */
  conf: number;
  /** true bila nilai dipulihkan lewat rescue zoom-digit. */
  rescued?: boolean;
}

/** Blok placement = satu tim (satu top #) berisi 0..4 sel kill. */
export interface KillBlock {
  /** Nilai rank dari badge yang TERBACA; null bila diisi otomatis. */
  rankRead: number | null;
  /** Rank final (badge terbaca atau hasil urutan otomatis). */
  rank: number;
  pairs: KillPair[];
  /** x-strip badge rank blok ini (pengelompokan kolom). */
  stripX: number | null;
  /** Catatan masalah pembacaan baris ini (untuk UI admin). */
  flags: string[];
  /** y urutan blok (cy sel pertama / y badge) — basis urutan final.
   *  v4: blok tanpa badge TIDAK boleh jadi "kolom sendiri" yang mulai
   *  dari rank 1 lagi (bug nyata: top 6 jadi "rank 1" kedua). */
  ordY?: number;
  /** Indeks paruh/kolom visual (0 = kiri) — dipakai urutan kolom-major. */
  halfIdx?: number;
}

export interface RescueDigitResult {
  value: number;
  conf: number;
}

/** Callback rescue: zoom zona → baca DIGIT saja (mask kuning + whitelist
 *  0-9). Browser: canvas; Node: sharp+tesseract. Boleh balik null. */
export type RescueDigitFn = (zone: DigitZone) => Promise<RescueDigitResult | null>;

export interface ParseRowsOptions {
  /** Rescue zoom-digit (wajib untuk akurasi penuh). */
  rescueDigit?: RescueDigitFn;
  /** Diagnosa opsional (script uji). */
  onDebug?: (stage: string, data: unknown) => void;
}

/** Peta huruf → digit untuk font stylized Free Fire (HANYA pada posisi
 *  terverifikasi: token di kiri "Kill" / merged, atau kandidat badge). */
const LETTER_DIGIT: Record<string, string> = {
  O: "0", o: "0", D: "0", Q: "0",
  I: "1", i: "1", l: "1", "|": "1", "!": "1",
  Z: "2", z: "2",
  A: "4",
  S: "5", s: "5",
  G: "6", b: "6",
  T: "7",
  B: "8",
  g: "9", q: "9",
};

const DIGITISH = /^[0-9OoDdQqIiLlZzAaSsBbGgTtq|!]{1,2}$/;

/** Ubah token menjadi angka bila pantas; null bila bukan angka. */
export function tokenToNumber(text: string): number | null {
  const t = String(text ?? "").trim();
  if (!t || t.length > 2) return null;
  if (!/^[0-9]+$/.test(t)) {
    if (!DIGITISH.test(t)) return null;
    if (!/[0-9]/.test(t) && t.length > 1) return null; // huruf mirip-digit murni 2 karakter — terlalu berisiko
  }
  let out = "";
  for (const ch of t) out += /[0-9]/.test(ch) ? ch : (LETTER_DIGIT[ch] ?? "\u0000");
  if (out.includes("\u0000")) return null;
  const v = Number(out);
  return Number.isFinite(v) ? v : null;
}

function lettersOnly(text: string): string {
  return String(text ?? "").replace(/[^A-Za-z]/g, "");
}

/** "Kill" murni (boleh salah baca i/l/1): k + 2..4 dari (i,l,1,|,!). */
export function isKillAnchor(text: string): boolean {
  const t = lettersOnly(String(text ?? "").trim().replace(/^[((]+/, "").replace(/[:.,;]+$/, ""));
  return /^k[iIl1|!]{2,4}$/i.test(t) && t.length >= 3;
}

/** Token "gil"/"Gll" — K terbaca jadi g/G (font stylized). */
function isKillAnchorWeak(text: string): boolean {
  return /^[KkGg][iIl1|!]{1,3}$/.test(String(text ?? "").trim());
}

/** Token menempel "4Kil"/"TKill"/"3Kil"/"AKill"/"OKI" — angka bersatu
 *  dengan Kill, depannya boleh salah baca. */
function mergedKillToken(text: string): { value: number | null; digitFrac: number } | null {
  const m = /^(.{1,2})[Kk][iIl1|!]{1,4}$/.exec(String(text ?? "").trim());
  if (!m) return null;
  const prefix = m[1];
  const v = tokenToNumber(prefix);
  const frac = prefix.length >= 2 ? 0.45 : 0.32;
  return { value: v, digitFrac: frac };
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function unionZone(a: DigitZone, b: DigitZone): DigitZone {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

export interface ParseRowsResult {
  blocks: KillBlock[];
  /** x strip rank terdeteksi (diagnosa). */
  strips: number[];
  /** x kolom angka kill terdeteksi (diagnosa). */
  bands: number[];
  /** y baris sel terdeteksi (diagnosa). */
  rows: number[];
  /** Tinggi baris median (basis ambang relatif). */
  lineH: number;
  /** Banyaknya rescue zoom yang dijalankan. */
  rescued: number;
}

// ============================================================
// LANGKAH 1 — BUKTI AWAL: sel dari anchor "Kill" + token angka
// ============================================================
interface PrelimPair {
  value: number;
  cx: number;
  cy: number;
  h: number;
  conf: number;
  /** Kotak token angka bila ada (menyempurnakan zona rescue). */
  tokenBox: DigitZone | null;
  /** true bila angka berasal dari teks (belum rescue). */
  needRescue: boolean;
  /** true bila cx hanya perkiraan (anchor tanpa token angka). */
  noToken: boolean;
  /** "claimed" = token+anchor / merged; "unclaimed" = token angka tanpa
   *  anchor (bukti kuat tapi harus snap ke band+row); "anchor" = tanpa token. */
  kind: "claimed" | "unclaimed" | "anchor";
  /** true bila nilai berasal dari prefix huruf merged (mis. "TKill" → 7)
   *  — tidak boleh dipakai bila rescue gagal. */
  letterGuess?: boolean;
  /** Kata OCR sumber (untuk mengeluarkan token sel dari kandidat badge). */
  srcWords: OcrWord[];
}

function collectPrelimPairs(words: OcrWord[]): { pairs: PrelimPair[]; lineH: number; usedWords: Set<OcrWord> } {
  const anchorsStrict = words.filter((w) => isKillAnchor(w.text));
  const anchorsWeak = words.filter((w) => !isKillAnchor(w.text) && isKillAnchorWeak(w.text));
  // token menempel "4Kil"/"TKill"/"OKI" = angka+Kill bersatu → anchor juga
  const anchorsMerged = words.filter(
    (w) => !isKillAnchor(w.text) && !isKillAnchorWeak(w.text) && mergedKillToken(w.text) !== null,
  );
  const anchors = [...anchorsStrict, ...anchorsWeak, ...anchorsMerged];
  if (!anchors.length) return { pairs: [], lineH: 0, usedWords: new Set<OcrWord>() };

  const lineH = Math.max(8, median(anchors.map((a) => a.h).filter((h) => h > 0)));

  const numbers = words
    .filter((w) => !isKillAnchor(w.text) && !isKillAnchorWeak(w.text))
    .map((w) => ({ w, v: tokenToNumber(w.text) }))
    .filter((n): n is { w: OcrWord; v: number } => n.v !== null);

  type Cand = { anchor: OcrWord; num: { w: OcrWord; v: number } | null; gap: number; merged: boolean };
  const cands: Cand[] = [];
  for (const a of anchors) {
    const mg = mergedKillToken(a.text);
    if (mg) {
      cands.push({ anchor: a, num: { w: a, v: mg.value ?? -1 }, gap: 0, merged: true });
      continue;
    }
    const aCy = a.y + a.h / 2;
    let best: Cand | null = null;
    for (const n of numbers) {
      const nRight = n.w.x + n.w.w;
      const gap = a.x - nRight;
      if (gap < -Math.max(2, n.w.w * 0.25) || gap > 2.2 * a.h) continue;
      const nCy = n.w.y + n.w.h / 2;
      if (Math.abs(nCy - aCy) > 0.65 * Math.max(n.w.h, a.h)) continue;
      if (!best || gap < best.gap) best = { anchor: a, num: n, gap, merged: false };
    }
    if (best) cands.push(best);
  }

  const used = new Set<OcrWord>();
  const pairs: PrelimPair[] = [];
  const usedWords = new Set<OcrWord>();
  for (const c of [...cands].sort((x, y) => (x.merged === y.merged ? x.gap - y.gap : x.merged ? -1 : 1))) {
    const a = c.anchor;
    if (c.merged) {
      const mg = mergedKillToken(a.text)!;
      const digitX1 = a.x + mg.digitFrac * a.w;
      const m2 = /^(.{1,2})[Kk]/.exec(a.text.trim());
      const prefix = m2 ? m2[1] : "";
      pairs.push({
        value: mg.value !== null ? clamp(mg.value, 0, 99) : 0,
        cx: Math.round((a.x - 0.06 * a.w + digitX1) / 2),
        cy: Math.round(a.y + a.h / 2),
        h: a.h,
        conf: mg.value !== null ? Math.max(45, a.conf) : 0,
        tokenBox: { x0: a.x - 0.06 * a.w, y0: a.y - 0.2 * a.h, x1: digitX1, y1: a.y + 1.15 * a.h },
        needRescue: true, // merged selalu di-rescue (depannya sering salah baca)
        noToken: false,
        kind: "claimed",
        // prefix HURUF (mis. "TKill") = tebakan tidak bisa dipercaya —
        // bila rescue gagal, sel dibuang (slot diisi ulang dari grid).
        letterGuess: !/^\d/.test(prefix),
        srcWords: [a],
      });
      continue;
    }
    const n = c.num!.w;
    if (used.has(n)) continue;
    used.add(n);
    pairs.push({
      value: clamp(c.num!.v, 0, 99),
      cx: Math.round(n.x + n.w / 2),
      cy: Math.round((n.y + n.h / 2 + (a.y + a.h / 2)) / 2),
      h: Math.max(n.h, a.h),
      conf: Math.min(n.conf, Math.max(a.conf, 50)),
      tokenBox: { x0: n.x, y0: n.y, x1: n.x + n.w, y1: n.y + n.h },
      needRescue: n.conf < 72,
      noToken: false,
      kind: "claimed",
      srcWords: [n, a],
    });
  }

  // Token angka yang TIDAK tertambah ke sel mana pun (anchor-nya hilang
  // dari OCR) — bukti kuat sel asli: posisinya tepat di kolom angka.
  for (const n of numbers) {
    if (used.has(n.w)) continue;
    if (n.w.conf < 40) continue;
    pairs.push({
      value: clamp(n.v, 0, 99),
      cx: Math.round(n.w.x + n.w.w / 2),
      cy: Math.round(n.w.y + n.w.h / 2),
      h: n.w.h,
      conf: n.w.conf,
      tokenBox: { x0: n.w.x, y0: n.w.y, x1: n.w.x + n.w.w, y1: n.w.y + n.w.h },
      needRescue: n.w.conf < 72,
      noToken: false,
      kind: "unclaimed",
      srcWords: [n.w],
    });
  }

  // Anchor tanpa token sama sekali → sel tetap ada (nilai dari rescue
  // grid; cx perkiraan, TIDAK ikut menghitung band).
  const claimedAnchors = new Set(cands.filter((c) => !c.merged).map((c) => c.anchor));
  for (const a of anchors) {
    if (claimedAnchors.has(a) || mergedKillToken(a.text)) continue;
    pairs.push({
      value: 0,
      cx: Math.round(a.x - 1.4 * a.h),
      cy: Math.round(a.y + a.h / 2),
      h: a.h,
      conf: 0,
      tokenBox: null,
      needRescue: true,
      noToken: true,
      kind: "anchor",
      srcWords: [a],
    });
  }

  return { pairs, lineH, usedWords };
}

// ============================================================
// LANGKAH 2 — util cluster 1D + nearest
// ============================================================
function cluster1D(values: number[], gapTol: number): { center: number; members: number[] }[] {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return [];
  const groups: number[][] = [[s[0]]];
  for (const v of s.slice(1)) {
    const g = groups[groups.length - 1];
    if (v - g[g.length - 1] <= gapTol) g.push(v);
    else groups.push([v]);
  }
  return groups.map((g) => ({ center: Math.round(median(g)), members: g }));
}

function nearest(v: number, list: number[]): number {
  return list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0]);
}

// ============================================================
// LANGKAH 3 — zona slot + rescue
// ============================================================
function slotZone(bcx: number, rcy: number, lineH: number, extra?: DigitZone | null): DigitZone {
  const z: DigitZone = {
    x0: Math.round(bcx - 1.2 * lineH),
    y0: Math.round(rcy - 0.9 * lineH),
    x1: Math.round(bcx + 1.2 * lineH),
    y1: Math.round(rcy + 1.05 * lineH),
  };
  return extra ? unionZone(z, { x0: extra.x0 - 2, y0: extra.y0 - 2, x1: extra.x1 + 2, y1: extra.y1 + 2 }) : z;
}

async function rescueCell(zone: DigitZone, opts: ParseRowsOptions): Promise<{ value: number; conf: number } | null> {
  if (!opts.rescueDigit) return null;
  try {
    const r = await opts.rescueDigit(zone);
    if (r && r.value >= 0 && r.value <= 30 && r.conf >= 45) return r;
  } catch {
    // biarkan
  }
  return null;
}

// ============================================================
// LANGKAH 4 — badge rank & strip vertikal
// ============================================================
interface RankCand {
  w: OcrWord;
  v: number;
}

function collectRankCandidates(
  words: OcrWord[],
  cellWords: Set<OcrWord>,
  cellCx: number[],
  cellCy: number[],
  lineH: number,
): RankCand[] {
  if (!cellCx.length) return [];
  const cands: RankCand[] = [];
  for (const w of words) {
    if (isKillAnchor(w.text) || isKillAnchorWeak(w.text)) continue;
    if (cellWords.has(w)) continue; // token angka kill ≠ badge rank
    const v = tokenToNumber(w.text);
    if (v === null || v < 1 || v > 24) continue;
    const wRight = w.x + w.w;
    const wCy = w.y + w.h / 2;
    const adaKanan = cellCx.some((cx, i) => wRight < cx - 2 && Math.abs(cellCy[i] - wCy) <= 2.6 * lineH);
    if (!adaKanan) continue;
    if (w.h < 0.72 * lineH) continue;
    cands.push({ w, v });
  }
  return cands;
}

function findRankStrips(cands: RankCand[], lineH: number): { x: number; members: RankCand[] }[] {
  const tol = Math.max(18, 0.9 * lineH);
  const clusters: { x: number; members: RankCand[] }[] = [];
  for (const c of [...cands].sort((a, b) => a.w.x - b.w.x)) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(c.w.x - last.x) <= tol) {
      last.members.push(c);
      last.x = median(last.members.map((m) => m.w.x));
    } else {
      clusters.push({ x: c.w.x, members: [c] });
    }
  }
  // Validasi strip: berjalan per y; angka yang TURUN = salah baca badge
  // (mis. "9" terbaca "s"→5) → buang angka itu saja, jangan buang strip.
  const valid: { x: number; members: RankCand[] }[] = [];
  for (const cl of clusters) {
    const byY = [...cl.members].sort((a, b) => a.w.y - b.w.y);
    const kept: RankCand[] = [];
    for (const m of byY) {
      const lastV = kept.length ? kept[kept.length - 1].v : 0;
      if (m.v < lastV) continue; // salah baca — buang
      kept.push(m);
    }
    if (kept.length >= 2) valid.push({ x: cl.x, members: kept });
  }
  return valid;
}

// ============================================================
// API UTAMA — kata OCR → baris { rank, total kill } (async, rescue)
// ============================================================
// v4 — URUTAN RANK FINAL bebas ganda (lihat komentar pemanggil).
// Dipakai ulang oleh pipeline recovery (merge hasil per-paruh) lewat
// export ini sehingga browser & server punya aturan yang sama.
export function assignFinalRanks(allBlocks: KillBlock[], imgW: number): void {
  if (!allBlocks.length) return;
  // --- (a) kolom visual tiap blok ---
  // Prioritas: halfIdx (dari parser); jika tidak ada, kluster stripX;
  // blok tanpa keduanya diselipkan ke kolom yang x-selnya paling dekat.
  const stripOnly = allBlocks.filter((b) => b.stripX !== null).map((b) => b.stripX as number);
  const colTol = Math.max(40, 0.09 * imgW);
  const stripCols = stripOnly.length >= 2 ? cluster1D(stripOnly, colTol).map((c) => c.center) : stripOnly.length ? [median(stripOnly)] : [];

  const colOf = (b: KillBlock): number => {
    if (b.halfIdx !== undefined && b.halfIdx >= 0) return b.halfIdx;
    if (b.stripX !== null) {
      let best = 0;
      let bestD = Infinity;
      stripCols.forEach((cx, i) => {
        const d = Math.abs(b.stripX! - cx);
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    }
    // tanpa strip: pakai x sel terkiri, dibandingkan terhadap rentang
    // x kolom (strip..sel terkanan) blok ber-strip — sel SELALU di
    // KANAN strip kolomnya, jadi cari kolom dengan jarak paling kecil
    // ke (strip + lebar kolom tipikal).
    const cx = b.pairs.length ? Math.min(...b.pairs.map((p) => p.cx)) : 0;
    if (!stripCols.length) return 0;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < stripCols.length; i++) {
      const anggota = allBlocks.filter((x) => colOfStrip(x) === i && x !== b && x.pairs.length);
      const kiri = anggota.length ? Math.min(...anggota.map((x) => x.stripX ?? cx)) : stripCols[i];
      const d = Math.abs(cx - kiri);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };
  const colOfStrip = (b: KillBlock): number | null => (b.stripX !== null ? colOf(b) : null);

  const nCols = Math.max(1, stripCols.length, ...allBlocks.map((b) => (b.halfIdx !== undefined ? b.halfIdx + 1 : 1)));
  const groups: KillBlock[][] = Array.from({ length: nCols }, () => []);
  for (const b of allBlocks) groups[Math.min(nCols - 1, colOf(b))].push(b);

  // --- (b) penomoran kolom-major + aturan badge ---
  let cursor = 1;
  const seen = new Set<number>();
  for (const g of groups) {
    g.sort((a, b) => (a.ordY ?? (a.pairs.length ? a.pairs[0].cy : 1e9)) - (b.ordY ?? (b.pairs.length ? b.pairs[0].cy : 1e9)));
    for (const b of g) {
      const rd = b.rankRead;
      const bolehBadge =
        rd !== null &&
        rd >= cursor &&
        rd <= cursor + 2 && // lompatan wajar (satu blok tak terbaca)
        !seen.has(rd);
      if (bolehBadge) {
        if (rd !== cursor) b.flags.push(`badge terbaca ${rd} — urutan melompat dari ${cursor} (kemungkinan ada blok tak terbaca)`);
        b.rank = rd;
      } else {
        if (rd !== null && rd !== cursor) {
          b.flags.push(`badge terbaca ${rd} — dipakai ${cursor} dari urutan layar`);
        }
        b.rank = cursor;
      }
      seen.add(b.rank);
      cursor = b.rank + 1;
    }
  }
}

/** Merge hasil beberapa pass (utama + recovery paruh): buang blok
 *  duplikat (sel yang sama terbaca lagi) — pertahankan yang paling kaya
 *  bukti (banyak sel, lalu conf tertinggi). Koordinat HARUS sudah dalam
 *  satu ruang gambar (hasil paruh sudah digeser offset-nya). */
export function mergeBlocks(primary: KillBlock[], extra: KillBlock[], lineH: number): KillBlock[] {
  const tol = Math.max(18, 1.6 * lineH);
  const same = (a: KillBlock, b: KillBlock): boolean => {
    if (!a.pairs.length || !b.pairs.length) {
      // blok tanpa sel: sama bila rank badge sama & y dekat
      return a.rankRead !== null && a.rankRead === b.rankRead && Math.abs((a.ordY ?? 0) - (b.ordY ?? 0)) <= tol * 2;
    }
    return a.pairs.some((p) => b.pairs.some((q) => Math.abs(p.cx - q.cx) <= tol && Math.abs(p.cy - q.cy) <= tol));
  };
  const richer = (a: KillBlock, b: KillBlock): number =>
    b.pairs.length - a.pairs.length || (median(b.pairs.map((p) => p.conf)) || 0) - (median(a.pairs.map((p) => p.conf)) || 0);
  const out: KillBlock[] = [];
  for (const c of [...primary, ...extra]) {
    const dup = out.find((o) => same(o, c));
    if (!dup) { out.push(c); continue; }
    if (richer(dup, c) > 0) {
      // ganti dengan yang lebih kaya, warisi flag
      c.flags = [...new Set([...c.flags, ...dup.flags])];
      out[out.indexOf(dup)] = c;
    } else {
      dup.flags = [...new Set([...dup.flags, ...c.flags])];
    }
  }
  return out;
}

export async function parseKillAnchoredRows(words: OcrWord[], imgW: number, opts: ParseRowsOptions = {}): Promise<ParseRowsResult> {
  const prelim = collectPrelimPairs(words);
  if (!prelim.pairs.length) return { blocks: [], strips: [], bands: [], rows: [], lineH: prelim.lineH, rescued: 0 };
  const lineH = prelim.lineH;

  // (1) BAND hanya dari pasangan "claimed" (token+anchor / merged) —
  // badge rank & token liar TIDAK ikut mengotori kolom.
  const bandTol = Math.max(60, 0.055 * imgW);
  const bandClusters = cluster1D(
    prelim.pairs.filter((p) => p.kind === "claimed").map((p) => p.cx),
    bandTol,
  );
  const bands = bandClusters.map((b) => b.center);

  // (2) sel awal: claimed langsung; unclaimed HANYA bila menempel band &
  // baris bukti; anchor tanpa token ikut band terdekat (cx perkiraan).
  interface Cell {
    value: number;
    conf: number;
    rescued: boolean;
    bandIdx: number;
    cy: number;
    tokenBox: DigitZone | null;
    letterGuess: boolean;
    noToken: boolean;
  }
  const claimedCys = prelim.pairs.filter((p) => p.kind !== "unclaimed").map((p) => p.cy);
  const cells: Cell[] = [];
  const cellWords = new Set<OcrWord>();
  for (const p0 of prelim.pairs) {
    let p = p0;
    if (p.kind === "unclaimed") {
      const bi = bands.findIndex((b) => Math.abs(b - p.cx) <= 1.4 * lineH);
      if (bi < 0) continue;
      const rcy = claimedCys.find((c) => Math.abs(c - p.cy) <= 1.1 * lineH);
      if (rcy === undefined) continue;
      p = { ...p, cx: bands[bi], cy: rcy };
    }
    const bi = bands.length ? bands.indexOf(nearest(p.cx, bands)) : -1;
    if (bi < 0) continue;
    cells.push({
      value: p.value,
      conf: p.conf,
      rescued: false,
      bandIdx: bi,
      cy: p.cy,
      tokenBox: p.tokenBox,
      letterGuess: Boolean(p.letterGuess),
      noToken: p.noToken,
    });
    for (const w of p.srcWords ?? []) cellWords.add(w);
  }
  opts.onDebug?.("cells0", cells.map((c) => ({ b: c.bandIdx, y: c.cy, v: c.value, tb: !!c.tokenBox })));

  // (3) paruh (half): band berpasangan 2 per blok → pisah di celah terbesar
  const halves: number[][] = [];
  if (bands.length <= 2) {
    halves.push(bands.map((_, i) => i));
  } else {
    const gaps: { i: number; d: number }[] = [];
    for (let i = 1; i < bands.length; i++) gaps.push({ i, d: bands[i] - bands[i - 1] });
    gaps.sort((a, b) => b.d - a.d);
    const nHalves = Math.max(2, Math.round(bands.length / 2));
    const splits = new Set<number>();
    for (const g of gaps.slice(0, nHalves - 1)) splits.add(g.i);
    let cur: number[] = [0];
    for (let i = 1; i < bands.length; i++) {
      if (splits.has(i)) {
        halves.push(cur);
        cur = [];
      }
      cur.push(i);
    }
    if (cur.length) halves.push(cur);
  }

  // (4) badge rank strips (untuk nilai rank & validasi)
  const rankStrips = findRankStrips(
    collectRankCandidates(
      words,
      cellWords,
      cells.map((c) => (c.bandIdx >= 0 ? bands[c.bandIdx] : -999)),
      cells.map((c) => c.cy),
      lineH,
    ),
    lineH,
  );

  // (5) per paruh: baris di-cluster LOKAL (kolom kanan punya pitch sendiri!),
  // blok = 1-2 baris berurutan, badge rank dipasangkan lewat y.
  let rescuedCount = 0;
  const allBlocks: KillBlock[] = [];
  const isiKosong: { bcx: number; rcy: number; block: KillBlock }[] = [];
  for (let halfIdx = 0; halfIdx < halves.length; halfIdx++) {
    const half = halves[halfIdx];
    const hCells = cells
      .filter((c) => half.includes(c.bandIdx))
      .sort((a, b) => a.cy - b.cy || a.bandIdx - b.bandIdx);
    // dedupe (band,row) lokal: yang punya tokenBox menang, lalu conf tertinggi
    const hRows: Map<number, Cell>[] = [];
    for (const c of hCells) {
      const last = hRows[hRows.length - 1];
      if (last) {
        const lastCy = median([...last.values()].map((x) => x.cy));
        if (Math.abs(c.cy - lastCy) <= 0.95 * lineH) {
          const old = last.get(c.bandIdx);
          const oldPunyaToken = Boolean(old?.tokenBox);
          const cPunyaToken = Boolean(c.tokenBox);
          if (!old || (cPunyaToken && !oldPunyaToken) || (cPunyaToken === oldPunyaToken && c.conf > (old?.conf ?? -1))) {
            last.set(c.bandIdx, c);
          }
          continue;
        }
      }
      hRows.push(new Map([[c.bandIdx, c]]));
    }
    // baris tengah
    const rowCy = hRows.map((m) => median([...m.values()].map((x) => x.cy)));
    // pecah jadi blok: selisih ≤ 2.9 lineH = masih satu blok (maks 2 baris).
    // v4: 2.45 terlalu ketat — kartu dengan "Kill" kecil (lineH pendek)
    // dan jarak baris sel 2.5-2.8× lineH terpotong jadi 2 blok (bug nyata:
    // 1 tim terhitung 2 "tim"). Pitch antar-kartu ≈ 8-12× lineH sehingga
    // 2.9 masih jauh dari risiko menggabungkan dua kartu berbeda.
    const halfBlocks: { rows: Map<number, Cell>[] }[] = [];
    for (let ri = 0; ri < hRows.length; ri++) {
      const last = halfBlocks[halfBlocks.length - 1];
      if (last && last.rows.length < 2 && rowCy[ri] - rowCy[ri - 1] <= 2.9 * lineH) {
        last.rows.push(hRows[ri]);
        continue;
      }
      halfBlocks.push({ rows: [hRows[ri]] });
    }

    // strip milik paruh = strip PALING KANAN yang masih di KIRI seluruh band
    const minBand = Math.min(...half.map((i) => bands[i]));
    const stripXs = rankStrips.map((s) => s.x).sort((a, b) => a - b);
    const kiri = stripXs.filter((x) => x < minBand - 0.5 * lineH);
    const halfStrip = kiri.length ? kiri[kiri.length - 1] : null;
    const stripMembers = halfStrip !== null ? (rankStrips.find((s) => Math.abs(s.x - halfStrip) < 2)?.members ?? []) : [];

    for (const hb of halfBlocks) {
      const rowTop = median([...hb.rows[0].values()].map((x) => x.cy));
      const rowBottom = median([...hb.rows[hb.rows.length - 1].values()].map((x) => x.cy));
      const badge =
        stripMembers
          .filter((m) => {
            const mCy = m.w.y + m.w.h / 2;
            // v4: badge boleh di ATAS baris sel pertama (di baris header
            // kartu) sampai 2.6× lineH — dulu 1.0× sehingga badge header
            // tidak cocok → blok phantom "kill tak terbaca" mendapat rank
            // ganjil & blok asli salah nomor.
            return mCy >= rowTop - 2.6 * lineH && mCy <= rowBottom + 1.0 * lineH;
          })
          .sort((a, b) => a.w.y - b.w.y)[0] ?? null;
      // RESCUE tiap sel (slot = band center + row center + tokenBox)
      const pairs: KillPair[] = [];
      const slots = new Set<string>();
      for (const row of hb.rows) {
        const rcy = median([...row.values()].map((x) => x.cy));
        for (const [bi, c] of row) {
          const bcx = bands[bi];
          const zone = slotZone(bcx, rcy, lineH, c.tokenBox);
          const r = await rescueCell(zone, opts);
          if (r) {
            rescuedCount++;
            c.value = r.value;
            c.conf = Math.max(c.conf, r.conf);
            c.rescued = true;
          }
          opts.onDebug?.("rescue", { x: zone.x0, y: zone.y0, r });
          // Nilai tebakan (prefix huruf merged / anchor tanpa token) yang
          // gagal di-rescue TIDAK BOLEH dipakai — sel dibuang dan slotnya
          // diisi ulang dari grid (strict conf).
          if ((c.letterGuess || c.noToken) && !c.rescued) continue;
          pairs.push({ value: c.value, cx: bcx, cy: rcy, h: lineH, conf: c.conf, rescued: c.rescued });
          slots.add(`${bi}@${Math.round(rcy)}`);
        }
      }
      const block: KillBlock = {
        rankRead: badge ? badge.v : null,
        rank: badge ? badge.v : 0,
        pairs,
        stripX: halfStrip !== null ? Math.round(halfStrip) : null,
        flags: badge ? [] : ["rank tidak terbaca — diisi otomatis dari urutan"],
        ordY: pairs.length
          ? Math.round(Math.min(...pairs.map((p) => p.cy)))
          : badge
            ? Math.round(badge.w.y)
            : Math.round(rowTop),
        halfIdx: halfIdx,
      };
      allBlocks.push(block);
      // (6) catat slot kosong blok ini → diisi dari grid (STRICT conf)
      // v4: seluruh band paruh ini (bukan cuma 2 pertama) — blok bisa
      // punya sel di 2-4 kolom angka tergantung layout.
      const halfBands: number[] = [];
      for (const bi of half) {
        const bx = bands[bi];
        if (bx !== undefined && !halfBands.includes(bx)) halfBands.push(bx);
      }
      const wantRows = hb.rows.map((row) => median([...row.values()].map((x) => x.cy)));
      if (hb.rows.length === 1) {
        const pitches: number[] = [];
        for (let i = 1; i < rowCy.length; i++) {
          const d = rowCy[i] - rowCy[i - 1];
          if (d > 1.2 * lineH && d <= 3.0 * lineH) pitches.push(d);
        }
        const pitch = pitches.length ? median(pitches) : 2.2 * lineH;
        wantRows.push(Math.round(wantRows[0] + pitch));
      }
      for (const bx of halfBands) {
        for (const ry of wantRows) {
          const sudah = pairs.some((p) => Math.abs(p.cx - bx) <= 1.2 * lineH && Math.abs(p.cy - ry) <= 1.0 * lineH);
          if (!sudah) isiKosong.push({ bcx: bx, rcy: ry, block });
        }
      }
    }
  }

  // (7) isi slot kosong dari grid — HANYA bila rescue sangat yakin
  for (const slot of isiKosong) {
    if (slot.block.pairs.length >= 4) continue;
    const zone = slotZone(slot.bcx, slot.rcy, lineH, null);
    const r = await rescueCell(zone, opts);
    if (r && r.conf >= 65) {
      rescuedCount++;
      slot.block.pairs.push({ value: r.value, cx: slot.bcx, cy: slot.rcy, h: lineH, conf: r.conf, rescued: true });
    }
  }

  opts.onDebug?.("blocks", allBlocks.map((b) => ({ rank: b.rank, read: b.rankRead, n: b.pairs.length, vals: b.pairs.map((p) => p.value), strip: b.stripX })));

  // (9) badge tanpa sel → blok "kill tak terbaca"
  // v4 FIX: usedBadges diperbarui SETIAP penambahan — dulu snapshot awal,
  // dua badge yang salah-baca sama-sama "1" menghasilkan 2 blok rank 1.
  const usedBadges = new Set(allBlocks.map((b) => b.rankRead));
  for (const s of rankStrips) {
    for (const m of s.members) {
      if (usedBadges.has(m.v)) continue;
      const adaTetangga = allBlocks.some(
        (b) => b.stripX !== null && Math.abs(b.stripX - s.x) <= Math.max(18, 0.9 * lineH) && b.pairs.length > 0,
      );
      if (!adaTetangga) continue;
      usedBadges.add(m.v);
      allBlocks.push({
        rankRead: m.v,
        rank: m.v,
        pairs: [],
        stripX: Math.round(s.x),
        flags: ["angka kill blok ini tidak terbaca — isi manual"],
        ordY: Math.round(m.w.y),
      });
    }
  }

  // (10) URUTAN RANK FINAL v4 — bebas ganda.
  // Bug lama (nyata): blok yang badge-nya tidak terbaca mendapat stripX
  // null → dianggap "kolom sendiri" (key -1, paling kiri) → penomoran
  // otomatis MULAI DARI 1 LAGI → top 6 menjadi "rank 1" kedua.
  // Aturan baru:
  //   a. Urutan = kolom-major (paruh kiri dulu, atas → bawah), pakai
  //      halfIdx; blok tanpa halfIdx (hasil merge recovery) dikelompokkan
  //      lewat stripX/x-sel — BUKAN kolom terpisah.
  //   b. Badge dipercaya HANYA bila tidak ganda, >= cursor, dan lompatan
  //      wajar (≤ cursor+2) — selain itu pakai cursor urutan + flag.
  //   c. Tidak ada dua blok dengan rank sama — selalu.
  assignFinalRanks(allBlocks, imgW);

  // (11) flag kualitas
  for (const b of allBlocks) {
    for (const p of b.pairs) {
      if (p.value > 30) b.flags.push(`ada kill ${p.value} (>30) — kemungkinan salah baca`);
      else if (!p.rescued && p.conf > 0 && p.conf < 60) b.flags.push("ada angka keyakinan rendah");
    }
    if (b.pairs.length && b.pairs.length < 3 && !b.flags.some((f) => f.includes("tidak terbaca"))) {
      b.flags.push(`hanya ${b.pairs.length}/4 angka terbaca — blok mungkin terpotong`);
    }
  }

  allBlocks.sort((a, b) => a.rank - b.rank || (a.stripX ?? 0) - (b.stripX ?? 0));
  const rowSemua = cluster1D(
    allBlocks.flatMap((b) => b.pairs.map((p) => p.cy)),
    Math.max(8, 0.9 * lineH),
  ).map((r) => r.center);
  return {
    blocks: allBlocks,
    strips: rankStrips.map((s) => Math.round(s.x)),
    bands,
    rows: rowSemua,
    lineH: Math.round(lineH),
    rescued: rescuedCount,
  };
}

/** DEBUG: expose pasangan awal (dipakai script uji/diagnosa). */
export function debugPrelimPairs(words: OcrWord[]): { pairs: (PrelimPairPublic)[]; lineH: number } {
  const prelim = collectPrelimPairs(words);
  return { pairs: prelim.pairs, lineH: prelim.lineH };
}
export interface PrelimPairPublic {
  value: number;
  cx: number;
  cy: number;
  conf: number;
  tokenBox: DigitZone | null;
  noToken: boolean;
}
