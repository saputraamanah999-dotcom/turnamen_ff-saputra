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
  /** true bila pembacaan zoom dan pass-1 TIDAK sepakat — angka dipakai dari
   *  sumber terkuat tapi ditandai kuning di UI untuk diperiksa admin. */
  disputed?: boolean;
  /** Area perkiraan posisi angka kill bila kill gagal terbaca — untuk
   *  re-OCR terarah (zoom + whitelist digit). Koordinat gambar asli.
   *  kind "token" = ada teks kill yang salah baca (akurat);
   *  kind "zone" = area kosong setelah nama (wajib hasil persis digit). */
  killHint?: { x: number; y: number; w: number; h: number; kind: "token" | "zone" };
}

export interface ParsedBlock {
  rank: number;
  members: ParsedMember[];
  /** Perkiraan persegi blok di gambar (koordinat gambar asli) — dipakai
   *  klien browser untuk ZOOM re-OCR per sel (2x2 pemain) agar angka kill
   *  kecil terbaca akurat. Kosong bila blok datang dari sumber lain. */
  grid?: { x0: number; y0: number; x1: number; y1: number; badgeX1: number };
}

export interface CellZone {
  /** Persegi sel penuh (1 dari 4 pemain dalam blok). */
  x0: number; y0: number; x1: number; y1: number;
  /** Batas kanan area nama (kiri sel s/d sini) — untuk OCR nama. */
  nameX1: number;
  /** Batas kiri area angka kill (sini s/d kanan sel) — untuk OCR digit. */
  killX0: number;
}

/**
 * Hitung 4 zona sel (2 kolom x 2 baris) di dalam persegi blok — urutan
 * konsisten [kiri-atas, kanan-atas, kiri-bawah, kanan-bawah] = urutan pemain
 * di layar FF. Dipakai bersama klien browser (canvas zoom re-OCR) dan test.
 */
export function computeCellZones(grid: NonNullable<ParsedBlock["grid"]>): CellZone[] {
  const zx0 = grid.badgeX1;
  const zx1 = grid.x1;
  const cellW = Math.max(24, (zx1 - zx0) / 2);
  const cellH = Math.max(14, (grid.y1 - grid.y0) / 2);
  const zones: CellZone[] = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const x0 = Math.round(zx0 + c * cellW);
      const x1 = Math.round(zx0 + (c + 1) * cellW);
      const y0 = Math.round(grid.y0 + r * cellH);
      const y1 = Math.round(grid.y0 + (r + 1) * cellH);
      zones.push({
        x0, y0, x1, y1,
        nameX1: Math.round(x0 + (x1 - x0) * 0.62),
        killX0: Math.round(x0 + (x1 - x0) * 0.58),
      });
    }
  }
  return zones;
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
  if (m) {
    let d = m[2];
    if (!/^[0-9]$/.test(d)) {
      if (LETTER_TO_DIGIT[d] !== undefined) d = LETTER_TO_DIGIT[d];
      else return null;
    }
    const n = Number(d);
    return Number.isFinite(n) && n >= 0 && n <= 99 ? n : null;
  }
  // KASUS LEMKET (umum di layar FF): nama dan kill MENEMPEL jadi satu token,
  // mis. "MALVADOR1Kil!", "BitoKejon4kill", "RBL Celuts9Kil!" — digit kill ada
  // tepat sebelum ekor kata Kill. Ambil KARAKTER TERAKHIR sebelum ekor itu.
  // Aman: ekor wajib berupa kata Kill yang salah baca, jadi nama seperti
  // "Hanz45" (tanpa ekor Kill) tidak pernah ikut.
  const t = raw.replace(/[.!|,;:'"^~`]+$/g, "");
  const m2 = t.match(/^(.+?)([0-9A-Za-z?&|])(?:[KkGg][A-Za-z|]{0,4})?$/);
  if (m2 && m2[1].length >= 2 && /[A-Za-z0-9]/.test(m2[1])) {
    let d = m2[2];
    if (!/^[0-9]$/.test(d)) {
      if (LETTER_TO_DIGIT[d] !== undefined) d = LETTER_TO_DIGIT[d];
      else return null;
    }
    const n = Number(d);
    return Number.isFinite(n) && n >= 0 && n <= 99 ? n : null;
  }
  return null;
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
 * RELAX v2: cukup 2 anchor nyata (sebelumnya 3) — badge emas sering gagal
 * dibaca; 2 anchor + gap konsisten sudah cukup untuk merekonstruksi grid,
 * lalu diperluas KE ATAS (sampai baris konten pemain teratas) dan KE BAWAH
 * (selama masih ada baris konten di kolom itu).
 */
function detectRankColumns(digitWords: OcrWord[], usable: OcrWord[], imgWidth: number, imgHeight: number): RankColumn[] {
  const clusters = clusterByX(digitWords, imgWidth * 0.04);
  const cols: { col: RankColumn; score: number }[] = [];
  const rescue: { x0: number; x1: number; token: OcrWord; rank: number }[] = [];
  for (const c of clusters) {
    // Rank tidak pernah 0 — satu saja angka 0 → bukan kolom rank.
    if (c.words.some((w) => standaloneDigit(w.text.trim()) === 0)) continue;

    const pts = [...c.words].sort((a, b) => a.y - b.y);
    // Buang token y kembar (mis. "11" terpecah "1"+"1" berdampingan).
    const dedup: OcrWord[] = [];
    for (const p of pts) {
      const prev = dedup[dedup.length - 1];
      if (!prev || p.y - prev.y > imgHeight * 0.045) dedup.push(p);
    }
    // SATU token saja → kandidat rescue (kolom yang badge-nya hampir semua
    // gagal terbaca). Rekonstruksi penuh menunggu ritme kolom lain.
    if (dedup.length < 2) {
      const t = dedup[0] ?? c.words[0];
      const v = t ? standaloneDigit(t.text.trim()) : null;
      if (t && v != null && v >= 1 && v <= 60) {
        const adaTeksKiri = usable.some(
          (w) => w !== t && w.x < t.x - 4 && w.x > t.x - imgWidth * 0.3 && Math.abs(w.y + w.h / 2 - (t.y + t.h / 2)) < 22,
        );
        if (!adaTeksKiri) rescue.push({ x0: c.x0, x1: c.x1, token: t, rank: v });
      }
      continue;
    }

    const allGaps: number[] = [];
    for (let i = 1; i < dedup.length; i++) allGaps.push(dedup[i].y - dedup[i - 1].y);
    const validGaps = allGaps.filter((d) => d >= imgHeight * 0.05 && d <= imgHeight * 0.5);
    if (validGaps.length < 1) continue;
    // Tinggi blok = estimasi TERBAIK dari gap. FIX v2: bila dua badge yang
    // terbaca TIDAK berurutan (mis. "3" dan "5" dengan "4" gagal terbaca),
    // gap 2x tinggi blok — dibagi selisih nilai rank agar tidak dobel.
    const bhCands: number[] = [];
    for (let i = 1; i < dedup.length; i++) {
      const dy = dedup[i].y - dedup[i - 1].y;
      if (dy < imgHeight * 0.05 || dy > imgHeight * 0.5) continue;
      const vi = standaloneDigit(dedup[i].text.trim());
      const vp = standaloneDigit(dedup[i - 1].text.trim());
      if (vi != null && vp != null && vi > vp && vi - vp <= 4) {
        const est = dy / (vi - vp);
        if (est >= imgHeight * 0.04 && est <= imgHeight * 0.5) bhCands.push(est);
      } else {
        bhCands.push(dy); // asumsikan berurutan
      }
    }
    if (!bhCands.length) continue;
    const bh = Math.min(...bhCands);
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
    if (anchors.length < 2) {
      // KANDIDAT RESCUE (multi-token tapi hanya 1 anchor valid).
      const t = c.words[0];
      const v = standaloneDigit(t.text.trim());
      if (v != null && v >= 1 && v <= 60) {
        const adaTeksKiri = usable.some(
          (w) => w !== t && w.x < t.x - 4 && w.x > t.x - imgWidth * 0.3 && Math.abs(w.y + w.h / 2 - (t.y + t.h / 2)) < 22,
        );
        if (!adaTeksKiri) rescue.push({ x0: c.x0, x1: c.x1, token: t, rank: v });
      }
      continue;
    }

    // Skor kepercayaan kolom rank.
    let score = 0;
    if (stepTotal > 0 && stepOk / stepTotal >= 0.6) score += 3;
    if (standaloneDigit(dedup[0].text.trim()) === 1) score += 2;
    if (consistent >= 1) score += 2;
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
    .filter((s) => s.score >= 4 && s.col.anchors.filter((a) => !a.interpolated).length >= 2)
    .sort((a, b) => a.col.x0 - b.col.x0)
    .map((s) => s.col);
  if (terpilih.length) {
    // Ritme blok global = median tinggi blok kolom terpilih (kedua kolom FF
    // memakai tinggi blok yang sama, barisnya sejajar).
    const bhRef = terpilih.map((c) => c.blockHeight).sort((a, b) => a - b)[Math.floor(terpilih.length / 2)];
    // RESCUE — kolom 1-anchor: snap ke ritme global lalu perluas seperti biasa.
    for (const rc of rescue) {
      if (terpilih.some((c) => Math.abs(c.x0 - rc.x0) < imgWidth * 0.06)) continue;
      const pseudo: RankColumn = {
        x0: rc.x0, x1: rc.x1, blockHeight: bhRef,
        anchors: [{ rank: rc.rank, y: rc.token.y, interpolated: false }],
        words: [rc.token],
      };
      extendColumnAnchors(pseudo, usable, imgWidth, imgHeight);
      if (pseudo.anchors.length >= 2) terpilih.push(pseudo);
    }
    terpilih.sort((a, b) => a.x0 - b.x0);
    for (const col of terpilih) extendColumnAnchors(col, usable, imgWidth, imgHeight);
  }
  return terpilih;
}

/**
 * Lengkapi barisan anchor sebuah kolom rank:
 *  - interpolasi anchor hilang di antara dua anchor (dr ≤ 4),
 *  - perluasan KE ATAS dibatasi baris konten teratas kolom (blok fiktif di
 *    area logo tidak jadi), dan
 *  - perluasan KE BAWAH selama masih ada baris konten di pita-x kolom.
 * Mengubah col.anchors langsung (in-place).
 */
function extendColumnAnchors(col: RankColumn, usable: OcrWord[], imgWidth: number, imgHeight: number): void {
  const bh = col.blockHeight;
  // Interpolasi internal.
  const filled: RankAnchor[] = [];
  for (let i = 0; i < col.anchors.length; i++) {
    if (i > 0) {
      const prev = col.anchors[i - 1];
      const cur = col.anchors[i];
      const dr = cur.rank - prev.rank;
      if (dr > 1 && dr <= 4) {
        const dy = (cur.y - prev.y) / dr;
        for (let k = 1; k < dr; k++) {
          filled.push({ rank: prev.rank + k, y: Math.round(prev.y + dy * k), interpolated: true });
        }
      }
    }
    filled.push(col.anchors[i]);
  }
  col.anchors = filled;
  // Guard atas berbasis KONTEN: baris konten teratas di pita-x kolom.
  const contentTop = (() => {
    let top = imgHeight;
    for (const w of usable) {
      if (w.x < col.x0 - imgWidth * 0.06) continue;
      if (w.x > col.x0 + imgWidth * 0.42) continue;
      if (rankTokenOf(col, w)) continue;
      if (w.y < top) top = w.y;
    }
    return top;
  })();
  const first = col.anchors[0];
  let y = first.y - bh;
  let r = first.rank - 1;
  // 0.95*bh: blok teratas boleh hanya punya BARIS KEDUA pemain yang terbaca
  // (baris pertama sering gagal) — tapi tetap tidak boleh jauh di atas konten.
  const yMin = Math.max(imgHeight * 0.02, (contentTop < imgHeight ? contentTop : first.y) - bh * 0.95);
  while (r >= 1 && y >= yMin) {
    col.anchors.unshift({ rank: r, y: Math.round(y), interpolated: true });
    y -= bh;
    r -= 1;
  }
  // Perluasan KE BAWAH: selama masih ada baris konten di bawah anchor terakhir.
  let last = col.anchors[col.anchors.length - 1];
  let rn = last.rank + 1;
  let yn = last.y + bh;
  while (rn <= 60 && yn <= imgHeight * 0.985) {
    const adaKonten = usable.some(
      (w) => !rankTokenOf(col, w) && w.x > col.x0 - imgWidth * 0.02 && w.x < col.x0 + imgWidth * 0.42 &&
             w.y > last.y + bh * 0.35 && w.y < yn + bh * 0.6,
    );
    if (!adaKonten) break;
    col.anchors.push({ rank: rn, y: Math.round(yn), interpolated: true });
    last = col.anchors[col.anchors.length - 1];
    rn++;
    yn += bh;
  }
}

/** True bila word w adalah token angka rank milik kolom col (posisi sama). */
function rankTokenOf(col: RankColumn, w: OcrWord): boolean {
  return col.words.some((c) => c.x === w.x && c.y === w.y && c.text === w.text);
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
  //    FIX v2: ambang lama 0.016H membuang SEMUA digit kill kecil (15px pada
  //    layar 2400px = 0.006H) dan badge rank (24px) — itulah sebabnya hampir
  //    tidak ada angka yang terbaca. Sekarang: floor absolut 7px.
  const minH = Math.max(7, imgHeight * 0.006);
  const usable = words.filter((w) => {
    const t = w.text.trim();
    if (!t) return false;
    if (!/[0-9A-Za-zа-яёÀ-ÿあ-んア-ン一-龯]/.test(t)) return false;
    if (w.h < minH) return false; // pecahan mikroskopik = noise
    return true;
  });
  if (usable.length < 6) return [];

  // 2. Angka berdiri sendiri untuk anchor rank — badge rank FF ±0.008..0.12H.
  const digitWords = usable.filter((w) => {
    const t = w.text.trim();
    return /^[0-9]{1,2}[.,]?$/.test(t) && w.h >= Math.max(7, imgHeight * 0.008) && w.h < imgHeight * 0.12;
  });
  const rankCols = detectRankColumns(digitWords, usable, imgWidth, imgHeight);

  if (!rankCols.length) return [];

  // 2b. Batas antar-kolom layar (layout DUA kolom khas FF): lembah kepadatan
  //     kata di tengah gambar. Mencegah kata kolom kanan bocor ke blok kolom
  //     kiri saat badge rank kolom kanan gagal terbaca.
  let columnSplit: number | null = null;
  {
    const bins = new Array(80).fill(0);
    for (const w of usable) {
      const a = Math.max(0, Math.min(79, Math.floor((w.x / imgWidth) * 80)));
      const b = Math.max(0, Math.min(79, Math.floor(((w.x + w.w) / imgWidth) * 80)));
      for (let i = a; i <= b; i++) bins[i]++;
    }
    const peak = Math.max(...bins);
    if (peak >= 4) {
      const win = Math.max(1, Math.round(80 * 0.035));
      let bestVal = Infinity;
      let bestC = -1;
      for (let i = Math.round(80 * 0.38); i + win <= Math.round(80 * 0.68); i++) {
        const v = bins.slice(i, i + win).reduce((a, b) => a + b, 0);
        if (v < bestVal) { bestVal = v; bestC = i; }
      }
      // Lembah sah bila hampir kosong dibanding puncak (≤ 20% puncak).
      if (bestC >= 0 && bestVal <= Math.max(2, peak * 0.2)) {
        columnSplit = Math.round(((bestC + win / 2) / 80) * imgWidth);
      }
    }
  }

  const blocks: ParsedBlock[] = [];
  const rankTokenKeys = new Set(rankCols.flatMap((c) => c.words.map((w) => `${w.x},${w.y},${w.text}`)));
  for (let ci = 0; ci < rankCols.length; ci++) {
    const col = rankCols[ci];
    // Rentang x kolom pemain: tepi kiri anchor → batas berikutnya.
    // FIX v2: kolom yang berada di KANAN lembah tidak boleh mundur ke kiri
    // lembah; kolom kiri tidak boleh melewati lembah ke kanan (colRight).
    const marginL = Math.max(0, col.x0 - imgWidth * 0.02);
    const colLeft = columnSplit != null && col.x0 >= columnSplit
      ? Math.max(columnSplit, marginL)
      : marginL;
    const nextX = ci + 1 < rankCols.length ? rankCols[ci + 1].x0 - imgWidth * 0.02 : imgWidth;
    const colRight = columnSplit != null && nextX > columnSplit && col.x0 < columnSplit
      ? columnSplit
      : nextX;

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
      // Baris pemain: dengan grid diketahui, DUA pita baris ekspektasi ada di
      // 27% dan 77% tinggi blok (layout 2x2 FF). Setiap cluster baris kata
      // dimasukkan ke pita terdekat — urutan member jadi deterministik
      // [kiri-atas, kanan-atas, kiri-bawah, kanan-bawah] = urutan sel zoom.
      const avgH = inBlock.reduce((acc, w) => acc + w.h, 0) / inBlock.length;
      const rows = clusterRows(inBlock, avgH * 0.7);
      const bh = bottom - top;
      const bandCenters = [top + bh * 0.27, top + bh * 0.77];
      const bandWords: OcrWord[][] = [[], []];
      for (const row of rows) {
        const cy = row.reduce((a, x) => a + x.y + x.h / 2, 0) / row.length;
        let best = -1;
        let bestDist = Infinity;
        for (let bi = 0; bi < 2; bi++) {
          const d = Math.abs(cy - bandCenters[bi]);
          if (d < bestDist) { bestDist = d; best = bi; }
        }
        if (best >= 0 && bestDist <= bh * 0.35) bandWords[best].push(...row);
      }
      const members: ParsedMember[] = [];
      const blockMid = (Math.min(...inBlock.map((w) => w.x)) + Math.max(...inBlock.map((w) => w.x + w.w))) / 2;
      for (const band of bandWords) {
        if (!band.length) continue;
        const minX = Math.min(...band.map((w) => w.x));
        const maxX = Math.max(...band.map((w) => w.x + w.w));
        const mid = (minX + maxX) / 2 || blockMid;
        const left = band.filter((w) => w.x + w.w / 2 < mid);
        const right = band.filter((w) => w.x + w.w / 2 >= mid);
        for (const sub of [left, right]) {
          const m = extractMember(sub);
          if (!m) continue;
          if (m.name === "(tak terbaca)" && m.kills == null) continue;
          members.push(m);
        }
      }
      if (!members.length) {
        // Fallback: pilih 2 baris terbaik (paling banyak kill terbaca).
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
      }
      if (!members.length) continue; // blok tanpa pemain terbaca → lewati
      blocks.push({
        rank: a.rank,
        members,
        grid: {
          x0: Math.round(colLeft),
          y0: Math.round(top),
          x1: Math.round(colRight),
          y1: Math.round(bottom),
          badgeX1: Math.round(col.x1 + imgWidth * 0.01),
        },
      });
    }
  }
  return blocks.sort((a, b) => a.rank - b.rank);
}
