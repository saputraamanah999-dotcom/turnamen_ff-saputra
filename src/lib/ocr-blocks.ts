// ============================================================
// STIKAR ESPORTS — BOF · PARSER GEOMETRIS LAYAR HASIL FREE FIRE
//
// Menerjemahkan kata-kata hasil OCR (Tesseract.js — word boxes) menjadi
// blok placement: rank + daftar pemain + kill per pemain.
//
// TATA LETAK LAYAR YANG DITANGANI:
//   [rank N] [NAMA  nKill] [NAMA  nKill]     ← 2 kolom pemain per blok
//            [NAMA  nKill] [NAMA  nKill]     ← maksimal 4 pemain
//   Dua blok per baris layar (kolom kiri & kanan).
//
// Prinsip deteksi:
//   1. ANCHOR RANK: angka berdiri sendiri (1..60) yang membentuk barisan
//      naik 1,2,3,... pada pita-x yang sama — itulah kolom nomor placement.
//   2. Blok i membentang vertikal dari rank i sampai rank i+1 (kolom sama).
//   3. Dalam blok, baris pemain di-cluster per-y; tiap baris dibelah dua
//      sub-kolom; kill = angka (atau digit yang menempel pada kata Kill)
//      di ujung kanan sub-kolom; nama = token teks lainnya.
//   4. Digit yang salah baca (stylized font) dinormalisasi: S→5, B→8, T→7,
//      Z→2, O/D→0, A→4, G→6, I/l→1, g/q→9 — HANYA pada konteks kill.
// ============================================================

export interface OcrWord {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  conf: number;
}

export interface ParsedMember {
  name: string;
  kills: number | null;
  /** true bila angka kill dipulihkan lewat re-OCR terarah (kurang pasti —
   *  ditandai di UI supaya admin memeriksanya). */
  recovered?: boolean;
  /** Area perkiraan posisi angka kill bila kill gagal terbaca — untuk
   *  re-OCR terarah (zoom + whitelist digit). Koordinat gambar asli.
   *  kind "token" = ada teks kill yang salah baca (akurat);
   *  kind "zone" = area kosong setelah nama (wajib hasil persis digit). */
  killHint?: { x: number; y: number; w: number; h: number; kind: "token" | "zone" };
}

export interface ParsedBlock {
  rank: number;
  members: ParsedMember[];
}

/** Baca dimensi gambar dari header PNG/JPEG (tanpa dependensi). */
export function imageDimensions(bytes: Buffer): { width: number; height: number } {
  // PNG: IHDR pada byte 16..24
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  // JPEG: cari marker SOF0..SOF15 (kecuali DHT C4/C8/CC)
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let off = 2;
    while (off + 9 < bytes.length) {
      if (bytes[off] !== 0xff) { off++; continue; }
      const marker = bytes[off + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue; }
      const len = bytes.readUInt16BE(off + 2);
      if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: bytes.readUInt16BE(off + 5), width: bytes.readUInt16BE(off + 7) };
      }
      off += 2 + len;
    }
  }
  return { width: 0, height: 0 };
}

/** Huruf yang mirip digit — dinormalisasi hanya pada konteks angka kill.
 *  Hati-hati: hanya pemetaan yang SANGAT khas (G/U/J ambigu → dibiarkan null
 *  supaya admin mengisi manual, bukan memberi angka salah). */
const LETTER_TO_DIGIT: Record<string, string> = {
  O: "0", o: "0", D: "0", Q: "0",
  I: "1", l: "1", i: "1", "|": "1", L: "1",
  Z: "2", z: "2",
  A: "4",
  S: "5", s: "5",
  b: "6",
  B: "8",
  g: "9", q: "9",
};

/** "4Kill" / "7Kil" / "TKill" / "AKill" / "5K" / "OKill" / "OKI" → digit kill atau null. */
function killDigitFromMerged(raw: string): number | null {
  // Struktur: [0-2 simbol] + SATU karakter digit/digit-mirip-huruf + ekor kata
  // Kill (K/k/G/g diikuti 0-4 huruf, boleh berhenti di K). Group1 TIDAK boleh
  // menelan angka (bug lama: "5K" terbaca group1="5").
  const m = raw.match(/^([^A-Za-z0-9]{0,2})([0-9A-Za-z?&|])(?:[KkGg][A-Za-z|]{0,4})?$/);
  if (!m) return null;
  let d = m[2];
  if (!/^[0-9]$/.test(d)) {
    if (LETTER_TO_DIGIT[d] !== undefined) d = LETTER_TO_DIGIT[d];
    else return null;
  }
  const n = Number(d);
  return Number.isFinite(n) && n >= 0 && n <= 99 ? n : null;
}

/** Angka berdiri sendiri → number (dengan normalisasi ringan). */
function standaloneDigit(raw: string): number | null {
  if (/^[0-9]{1,2}$/.test(raw)) return Number(raw);
  if (/^[0-9][.,]$/.test(raw)) return Number(raw.slice(0, -1));
  return null;
}

/** Kata mirip "Kill" dalam bahasa apa pun bentuknya (termasuk salah baca). */
function isKillWord(raw: string): boolean {
  const s = raw.toLowerCase().replace(/[^a-zа-яё]/g, "");
  return (
    s === "kill" || s === "kil" || s === "kil1" || s === "kii1" || s === "k1" ||
    s === "kal" || s === "kell" || s === "kiil" || s === "kll" || s === "kit" ||
    s === "кил" || s === "кш" || s === "ка" || s === "kg" || s === "кии" ||
    s === "krill" || s === "khill" || s.length === 0
  );
}

/** Bersihkan nama pemain dari sisa token UI/kill. */
function cleanNameToken(raw: string): string {
  return raw.replace(/^[|"'`^~•·°*_\-+=<>[\]{}()\\/.,;:!?]+/, "")
            .replace(/[|"'`^~•·°*_\-+=<>[\]{}()\\/.,;:!?]+$/, "");
}

/** Teks UI layar yang selalu diabaikan. */
const UI_WORDS = new Set([
  "KEMBALI", "FREEFIRE", "FREE", "FIRE", "GARENA", "BOOYAH", "SURVIVAL",
  "TIME", "MATCH", "SPECTATE", "SPECTATOR", "CONTINUE", "OK", "DONE",
]);

interface XCluster {
  x0: number;
  x1: number;
  words: OcrWord[];
}

/** Kelompokkan kata berdasarkan posisi x (gap > threshold → cluster baru). */
function clusterByX(words: OcrWord[], gapPx: number): XCluster[] {
  const sorted = [...words].sort((a, b) => a.x - b.x);
  const clusters: XCluster[] = [];
  for (const w of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && w.x - last.x1 <= gapPx) {
      last.words.push(w);
      last.x1 = Math.max(last.x1, w.x + w.w);
    } else {
      clusters.push({ x0: w.x, x1: w.x + w.w, words: [w] });
    }
  }
  return clusters;
}

/** Cari ANCHOR RANK — digantikan oleh detectRankColumns (lihat bawah). */

/** Baris pemain: cluster kata per-y di dalam sebuah blok. */
function clusterRows(words: OcrWord[], tolerance: number): OcrWord[][] {
  const sorted = [...words].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows: OcrWord[][] = [];
  for (const w of sorted) {
    const cy = w.y + w.h / 2;
    const last = rows[rows.length - 1];
    if (last) {
      const lastCy = last.reduce((a, x) => a + x.y + x.h / 2, 0) / last.length;
      if (Math.abs(cy - lastCy) <= tolerance) { last.push(w); continue; }
    }
    rows.push([w]);
  }
  return rows;
}

interface RankAnchor {
  rank: number;
  y: number;
  interpolated: boolean;
}

interface RankColumn {
  x0: number;
  x1: number;
  blockHeight: number;
  anchors: RankAnchor[];
  words: OcrWord[];
}

/**
 * Deteksi KOLOM RANK — inti parser.
 * Angka placement Free Fire membentuk grid vertikal teratur pada tepi kiri
 * setiap blok. Pembeda dari angka KILL (yang juga angka berdiri sendiri):
 *   1. Kill 0 SANGAT sering muncul; rank TIDAK PERNAH 0 → cluster berisi
 *      angka 0 langsung ditolak.
 *   2. Nilai rank naik teratur mengikuti posisi-y (1,2,3,…) — angka kill acak.
 *   3. Jarak vertikal antar-rank konsisten (tinggi blok ±0.05H..0.5H).
 *   4. Rank berada di tepi kiri bloknya (tidak ada teks di kirinya dalam satu
 *      baris) — sedangkan kill selalu didahului nama pemain.
 * Angka yang tak terbaca (font emas besar) dilengkapi interpolasi; angka
 * salah nilai (mis. "11" terbaca "1") mengikuti POSISI, bukan nilai.
 */
function detectRankColumns(digitWords: OcrWord[], usable: OcrWord[], imgWidth: number, imgHeight: number): RankColumn[] {
  const clusters = clusterByX(digitWords, imgWidth * 0.04);
  const cols: { col: RankColumn; score: number }[] = [];
  for (const c of clusters) {
    if (c.words.length < 3) continue;
    // Rank tidak pernah 0 — satu saja angka 0 → bukan kolom rank.
    if (c.words.some((w) => standaloneDigit(w.text.trim()) === 0)) continue;

    const pts = [...c.words].sort((a, b) => a.y - b.y);
    // Buang token y kembar (mis. "11" terpecah "1"+"1" berdampingan).
    const dedup: OcrWord[] = [];
    for (const p of pts) {
      const prev = dedup[dedup.length - 1];
      if (!prev || p.y - prev.y > imgHeight * 0.045) dedup.push(p);
    }
    if (dedup.length < 3) continue;

    const allGaps: number[] = [];
    for (let i = 1; i < dedup.length; i++) allGaps.push(dedup[i].y - dedup[i - 1].y);
    const validGaps = allGaps.filter((d) => d >= imgHeight * 0.05 && d <= imgHeight * 0.5);
    if (validGaps.length < 2) continue;
    // Tinggi blok = gap valid terkecil (paling murni satu blok; gap besar = blok terlewati).
    const bh = Math.min(...validGaps);
    const consistent = validGaps.filter((g) => Math.abs(g - bh) <= bh * 0.45).length;

    // Susun barisan rank: nilai OCR dipakai bila naik wajar; posisi menang bila konflik.
    const anchors: RankAnchor[] = [];
    let stepOk = 0;
    let stepTotal = 0;
    for (let i = 0; i < dedup.length; i++) {
      const v = standaloneDigit(dedup[i].text.trim());
      const prev = anchors[anchors.length - 1];
      let rank: number;
      if (i === 0) {
        rank = v != null && v >= 1 && v <= 60 ? v : 1;
      } else {
        const expected = prev.rank + 1;
        const dy = dedup[i].y - dedup[i - 1].y;
        const yOk = dy <= bh * 3.5; // boleh melompati maks. ±2 blok yang tak terbaca
        if (!yOk) continue;
        stepTotal++;
        if (v != null && v > prev.rank && v - prev.rank <= 3) {
          rank = v;
          stepOk++;
        } else {
          rank = expected; // posisi menang (nilai salah baca / tak terbaca)
          if (v == null) stepOk++;
        }
      }
      anchors.push({ rank, y: dedup[i].y, interpolated: false });
    }
    if (anchors.length < 3) continue;

    // Skor kepercayaan kolom rank.
    let score = 0;
    if (stepTotal > 0 && stepOk / stepTotal >= 0.6) score += 3;
    if (standaloneDigit(dedup[0].text.trim()) === 1) score += 2;
    if (consistent >= 2) score += 2;
    // Tepi kiri: minimal separuh token tidak punya teks di kirinya (±22px satu baris).
    let edgeCount = 0;
    for (const t of dedup) {
      const adaTeksKiri = usable.some(
        (w) => w !== t && w.x < t.x - 4 && w.x > t.x - imgWidth * 0.3 && Math.abs(w.y + w.h / 2 - (t.y + t.h / 2)) < 22,
      );
      if (!adaTeksKiri) edgeCount++;
    }
    if (edgeCount * 2 >= dedup.length) score += 2;

    // Interpolasi rank yang hilang di antara dua anchor berurutan.
    const filled: RankAnchor[] = [];
    for (let i = 0; i < anchors.length; i++) {
      if (i > 0) {
        const prev = anchors[i - 1];
        const cur = anchors[i];
        const dr = cur.rank - prev.rank;
        if (dr > 1 && dr <= 4) {
          const dy = (cur.y - prev.y) / dr;
          for (let k = 1; k < dr; k++) {
            filled.push({ rank: prev.rank + k, y: Math.round(prev.y + dy * k), interpolated: true });
          }
        }
      }
      filled.push(anchors[i]);
    }
    cols.push({
      col: { x0: c.x0, x1: c.x1, blockHeight: bh, anchors: filled, words: c.words },
      score,
    });
  }
  const terpilih = cols
    .filter((s) => s.score >= 5 && s.col.anchors.filter((a) => !a.interpolated).length >= 2)
    .sort((a, b) => a.col.x0 - b.col.x0)
    .map((s) => s.col);
  // Pelonggaran ke ATAS dibatasi puncak grid global (baris blok pertama
  // semua kolom sejajar) — mencegah blok fiktif di area logo.
  if (terpilih.length) {
    const globalTop = Math.min(
      ...terpilih.map((c) => Math.min(...c.anchors.filter((a) => !a.interpolated).map((a) => a.y))),
    );
    for (const col of terpilih) {
      const first = col.anchors[0];
      let y = first.y - col.blockHeight;
      let r = first.rank - 1;
      const yMin = Math.max(imgHeight * 0.02, globalTop - col.blockHeight * 0.55);
      while (r >= 1 && y >= yMin) {
        col.anchors.unshift({ rank: r, y: Math.round(y), interpolated: true });
        y -= col.blockHeight;
        r -= 1;
      }
    }
  }
  return terpilih;
}

/** Skor baris untuk pemilihan 2 baris terbaik dalam blok: kill terbaca > banyak token. */
function scoreRowPair(subs: [OcrWord[], OcrWord[]]): number {
  let s = 0;
  for (const sub of subs) {
    if (!sub.length) continue;
    s += sub.length;
    const m = extractMember(sub);
    if (m?.kills != null) s += 10;
  }
  return s;
}

/** Pisahkan "NAMA  4Kill" → { name, kills }. */
function extractMember(rowWords: OcrWord[]): ParsedMember | null {
  if (!rowWords.length) return null;
  const sorted = [...rowWords].sort((a, b) => a.x - b.x);
  // Cari kill: (a) token gabungan digitKill, (b) kata Kill + digit sebelumnya.
  let killIdx = -1;
  let kills: number | null = null;
  let killishIdx = -1; // token yang KIRA-KIRA angka kill tapi gagal diparse
  for (let i = sorted.length - 1; i >= 0; i--) {
    const t = sorted[i].text.trim();
    // (1) token gabungan digit+Kill ("4Kill", "5K", "OKill") dicek DULU —
    //     karena "4kill" juga lolos isKillWord setelah digit dibuang.
    const merged = killDigitFromMerged(t);
    if (merged != null && /[0-9A-Za-z?&][kKgG]/.test(t)) {
      kills = merged; killIdx = i; break;
    }
    // (2) kata "Kill" berdiri sendiri → kill-nya token sebelumnya.
    if (isKillWord(t)) {
      if (i > 0) {
        const prev = sorted[i - 1].text.trim();
        const d = standaloneDigit(prev);
        if (d != null) { kills = d; killIdx = i - 1; break; }
      }
      continue;
    }
    // (3) token misterius di posisi ekor (mis. "EL", "TH", "gil", "GK",
    //     "TKill", "Kilt") — calon angka kill yang salah baca; catat posisinya
    //     untuk re-OCR terarah (whitelist digit memecah ambiguitas huruf).
    if (
      killishIdx === -1 &&
      /^[A-Za-z?&|]{1,6}$/.test(t) &&
      !isKillWord(t) &&
      i >= 1 &&
      (t.length <= 3 || /[KkGg]/.test(t))
    ) {
      killishIdx = i;
    }
  }
  if (kills == null) {
    // Fallback TERBATAS: hanya digit berdiri sendiri di posisi paling kanan
    // sub-kolom (posisi khas angka kill) — mencegah digit liar ikut.
    const last = sorted[sorted.length - 1];
    if (last) {
      const d = standaloneDigit(last.text.trim());
      if (d != null && d <= 30) { kills = d; killIdx = sorted.length - 1; }
    }
  }
  // Kill per pemain realistis 0..30 — di luar itu dianggap salah baca.
  if (kills != null && (kills < 0 || kills > 30)) kills = null;
  // Nama = semua token bukan-kill sebelum posisi kill.
  const nameTokens: string[] = [];
  const upTo = killIdx >= 0 ? killIdx : sorted.length;
  for (let i = 0; i < upTo; i++) {
    const t = sorted[i].text.trim();
    if (!t) continue;
    if (isKillWord(t)) continue;
    if (UI_WORDS.has(t.toUpperCase().replace(/[^A-Z]/g, ""))) continue;
    if (i === killishIdx && kills == null) continue; // token calon-kill tidak jadi nama
    const mergedTrim = killDigitFromMerged(t);
    if (mergedTrim != null && /[0-9A-Za-z?&][kKgG]/.test(t)) continue;
    const cleaned = cleanNameToken(t);
    if (cleaned.length >= 2 || /[0-9]/.test(cleaned)) nameTokens.push(cleaned);
  }
  const name = nameTokens.join(" ").trim().slice(0, 48);
  if (!name && kills == null) return null;
  // Hint re-OCR: kalau kill tak terbaca, kirim area ekor sub-kolom.
  let killHint: ParsedMember["killHint"];
  if (kills == null) {
    const rowTop = Math.min(...sorted.map((w) => w.y));
    const rowBottom = Math.max(...sorted.map((w) => w.y + w.h));
    const rowH = Math.max(8, rowBottom - rowTop);
    const src = killishIdx >= 0 ? sorted[killishIdx] : null;
    if (src) {
      // Zona token salah baca + area kanannya (digit kill asli kadang berada
      // tepat setelah teks garble — whitelist digit mengabaikan huruf).
      killHint = {
        x: Math.max(0, src.x - 3),
        y: Math.max(0, src.y - 3),
        w: src.w + 6 + Math.round(rowH * 1.6),
        h: src.h + 6,
        kind: "token",
      };
    } else {
      // Zona murni SETELAH token terakhir — JANGAN menimpa nama (ID FF sering
      // berisi angka, mis. "Hanz↷45", yang bisa terbaca sebagai kill).
      const last = sorted[sorted.length - 1];
      const zx = last.x + last.w + 2;
      killHint = { x: zx, y: Math.max(0, rowTop - 2), w: Math.max(16, rowH * 3), h: rowH + 4, kind: "zone" };
    }
  }
  return { name: name || "(tak terbaca)", kills, killHint };
}

/**
 * Fungsi utama: word boxes → blok placement terstruktur.
 * return [] bila layar tidak cocok dengan pola (mis. bukan layar hasil).
 */
export function parseWordBoxesToBlocks(words: OcrWord[], imgWidth: number, imgHeight: number): ParsedBlock[] {
  // 1. Saring kata sampah: simbol murni + pecahan mikroskopik.
  const usable = words.filter((w) => {
    const t = w.text.trim();
    if (!t) return false;
    if (!/[0-9A-Za-zа-яёÀ-ÿあ-んア-ン一-龯]/.test(t)) return false;
    if (w.h < imgHeight * 0.016) return false; // pecahan kecil = noise
    return true;
  });
  if (usable.length < 6) return [];

  // 2. Angka berdiri sendiri untuk anchor rank — buang pecahan terlalu kecil
  //    (sisa potongan teks) dan angka raksasa (logo).
  const digitWords = usable.filter((w) => {
    const t = w.text.trim();
    return /^[0-9]{1,2}[.,]?$/.test(t) && w.h >= imgHeight * 0.015 && w.h < imgHeight * 0.09;
  });
  const rankCols = detectRankColumns(digitWords, usable, imgWidth, imgHeight);
  if (!rankCols.length) return [];

  const blocks: ParsedBlock[] = [];
  const rankTokenKeys = new Set(rankCols.flatMap((c) => c.words.map((w) => `${w.x},${w.y},${w.text}`)));
  for (let ci = 0; ci < rankCols.length; ci++) {
    const col = rankCols[ci];
    // Rentang x kolom pemain: tepi kiri anchor → tepi kiri kolom rank berikutnya (atau tepi gambar).
    const colLeft = Math.max(0, col.x0 - imgWidth * 0.02);
    const nextX = ci + 1 < rankCols.length ? rankCols[ci + 1].x0 - imgWidth * 0.02 : imgWidth;
    const colRight = nextX;

    for (let i = 0; i < col.anchors.length; i++) {
      const a = col.anchors[i];
      // Batas blok = titik tengah antara dua anchor rank berurutan.
      const top = i > 0 ? (col.anchors[i - 1].y + a.y) / 2 : a.y - col.blockHeight * 0.35;
      const bottom = i + 1 < col.anchors.length ? (a.y + col.anchors[i + 1].y) / 2 : Math.min(imgHeight, a.y + col.blockHeight * 1.15);
      const inBlock = usable.filter((w) => {
        if (w.y < top || w.y >= bottom) return false;
        if (w.x <= colLeft || w.x >= colRight) return false;
        // Jangan ikutkan token angka rank itu sendiri.
        if (rankTokenKeys.has(`${w.x},${w.y},${w.text}`)) return false;
        // Abaikan teks UI layar.
        if (UI_WORDS.has(w.text.toUpperCase().replace(/[^A-Z]/g, ""))) return false;
        return true;
      });
      if (!inBlock.length) continue;
      // Baris pemain dalam blok (toleransi = 60% tinggi teks rata-rata).
      const avgH = inBlock.reduce((acc, w) => acc + w.h, 0) / inBlock.length;
      const rows = clusterRows(inBlock, avgH * 0.7);
      // Belah dua sub-kolom pada tengah area pemain — SATU blok maks. 2 baris
      // x 2 sub-kolom = 4 pemain. Pilih 2 baris terbaik (paling banyak kill
      // terbaca) supaya baris sampah (logo/UI) tidak ikut.
      const members: ParsedMember[] = [];
      const minX = Math.min(...inBlock.map((w) => w.x));
      const maxX = Math.max(...inBlock.map((w) => w.x + w.w));
      const mid = (minX + maxX) / 2;
      const rowSubs = rows.map((row) => {
        const left = row.filter((w) => w.x + w.w / 2 < mid);
        const right = row.filter((w) => w.x + w.w / 2 >= mid);
        return [left, right] as [OcrWord[], OcrWord[]];
      });
      rowSubs.sort((a, b) => scoreRowPair(b) - scoreRowPair(a));
      for (const [left, right] of rowSubs.slice(0, 2)) {
        for (const sub of [left, right]) {
          const m = extractMember(sub);
          if (!m) continue;
          if (m.name === "(tak terbaca)" && m.kills == null) continue;
          members.push(m);
        }
      }
      if (!members.length) continue; // blok tanpa pemain terbaca → lewati
      blocks.push({ rank: a.rank, members });
    }
  }
  return blocks.sort((a, b) => a.rank - b.rank);
}
