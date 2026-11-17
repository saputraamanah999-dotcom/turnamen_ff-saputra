// ============================================================
// STIKAR ESPORTS — BOF · MESIN OCR SERVER (FALLBACK)
// Lib server MURNI (tanpa import next/server) — dipakai oleh
// route /api/ai/ocr DAN script uji (scripts/test-ocr-rows.ts)
// sehingga pipeline yang diuji = pipeline yang berjalan produksi.
//
// PERAN: fallback bila OCR browser admin gagal membaca layar.
// Pipeline sama dengan browser: tesseract 2 pass (koordinat kata)
// → parser kill-anchored (src/lib/ocr-rows.ts — tanpa nama pemain)
// → rescue zoom-digit (mask kuning + whitelist digit) → baris
// { rank, total kill }.
//
// ATURAN HITUNG: 1 blok placement (top #) = 1 tim berisi sampai 4
// PEMAIN; KILL TIM = PENJUMLAHAN kill semua anggota blok — dihitung
// ulang oleh parser dari sel-sel yang sudah diverifikasi rescue.
// Nama pemain sengaja tidak dibaca (permintaan admin).
// ============================================================

import { assignFinalRanks, mergeBlocks, parseKillAnchoredRows, type KillBlock, type OcrWord, type RescueDigitFn } from "./ocr-rows";
import type { OcrRow } from "./types";

export type { OcrWord };

/** Pengaturan mesin OCR — diatur dari UI Admin → Pengaturan (dokumen
 *  settings/ocr), BUKAN dari .env. Env hanya menyimpan API key
 *  (SATU key per provider). Disimpan agar kompatibel dengan panel
 *  pengaturan yang sudah ada; pipeline saat ini berjalan tanpa AI. */
export interface OcrEngineSettings {
  jereEndpoint?: string;
  jereVisionModel?: string;
  jereTextModel?: string;
}

export interface RegistryTeam {
  id: string;
  name: string;
  tag?: string;
  captain?: string;
  roster?: { nickname: string }[];
  ocrAliases?: string[];
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

// ============================================================
// TESSERACT.JS — OCR DENGAN KOORDINAT KATA (TANPA API KEY, GRATIS)
// DUA pass: PSM 6 (struktur blok lengkap) + PSM 11 (sparse — menangkap
// angka yang lolos dari pass utama). Worker script & core diselesaikan
// EKSPLISIT via createRequire — bundling Next/Vercel merusak
// __dirname bawaan tesseract.js.
// ============================================================
import { createRequire as nodeCreateRequire } from "node:module";
import nodePath from "node:path";

interface TessPaths {
  workerPath?: string;
  corePath?: string;
}
let tessPathsCache: TessPaths | null = null;
function resolveTessPaths(): TessPaths {
  if (tessPathsCache) return tessPathsCache;
  try {
    const req = nodeCreateRequire(import.meta.url);
    const pkgDir = nodePath.dirname(req.resolve("tesseract.js/package.json"));
    tessPathsCache = {
      workerPath: nodePath.join(pkgDir, "src", "worker-script", "node", "index.js"),
      corePath: nodePath.join(pkgDir, "src", "core"),
    };
  } catch {
    tessPathsCache = {};
  }
  return tessPathsCache;
}

export async function ocrWordBoxes(bytes: Buffer): Promise<{ words: OcrWord[]; width: number; height: number }> {
  const { createWorker } = await import("tesseract.js");
  const paths = resolveTessPaths();
  const runPass = async (psm: string) => {
    const worker = await createWorker("eng", 1, {
      cachePath: "/tmp/bof-tessdata",
      logger: () => {},
      ...paths,
    });
    try {
      await worker.setParameters({ tessedit_pageseg_mode: psm as import("tesseract.js").PSM });
      const { data } = await worker.recognize(bytes);
      const rawWords = (data.words ?? []) as { text?: string; bbox?: { x0: number; y0: number; x1: number; y1: number }; confidence?: number }[];
      return rawWords
        .filter((w) => w.bbox && w.text && w.text.trim())
        .map((w) => ({
          text: String(w.text).trim(),
          x: w.bbox!.x0,
          y: w.bbox!.y0,
          w: w.bbox!.x1 - w.bbox!.x0,
          h: w.bbox!.y1 - w.bbox!.y0,
          conf: w.confidence ?? 0,
        }));
    } finally {
      await worker.terminate().catch(() => {});
    }
  };

  const main = await runPass("6");
  const dim = imageDimensions(bytes);
  let width = dim.width;
  let height = dim.height;
  for (const w of main) {
    width = Math.max(width, w.x + w.w);
    height = Math.max(height, w.y + w.h);
  }
  // Pass sparse (PSM 11) hanya bila pass utama kurang meyakinkan —
  // booster recall angka, bukan keharusan (hemat waktu CPU lambda).
  let sparse: OcrWord[] = [];
  if (main.length < 60) {
    sparse = await runPass("11").catch(() => [] as OcrWord[]);
    for (const w of sparse) {
      width = Math.max(width, w.x + w.w);
      height = Math.max(height, w.y + w.h);
    }
  }

  // Gabungkan: kata sparse yang tidak ada padanannya di pass utama
  // ditambahkan; angka yang bertabrakan dengan kata "Kill" tetap masuk
  // (memulihkan angka kill yang terlewat pass utama).
  const words = [...main];
  for (const s of sparse) {
    const scx = s.x + s.w / 2;
    const scy = s.y + s.h / 2;
    const tabrak = main.find((m) => {
      const mcx = m.x + m.w / 2;
      const mcy = m.y + m.h / 2;
      return Math.abs(mcx - scx) <= Math.max(14, m.w * 0.6) && Math.abs(mcy - scy) <= Math.max(10, m.h * 0.6);
    });
    if (!tabrak) { words.push(s); continue; }
    const tabrakKillish = /^[((]?[Kk][A-Za-z]{0,4}$/.test(tabrak.text);
    if (tabrakKillish && /^[0-9]{1,2}$/.test(s.text)) words.push(s);
  }
  return { words, width, height };
}

// ============================================================
// RESCUE DIGIT (NODE) — mask kuning + normalisasi glyph + whitelist 0-9
// ============================================================
// Angka kill di layar Free Fire berwarna KUNING PEKAT (R-B besar),
// sedangkan nama pemain/bintang lebih putih dan kata "Kill" lebih
// pucat — mask saturasi memisahkan angka dari semuanya. Bbox glyph
// lalu dinormalisasi ke tinggi 48 px (Tesseract akurat di ukuran itu —
// glyph terlalu besar/kecil sering gagal terbaca) dan dibaca dengan
// whitelist digit. Browser punya versi canvas-nya sendiri di
// src/services/ocr/client.ts.
// ============================================================
export async function createDigitRescuerNode(
  bytes: Buffer,
): Promise<(zone: { x0: number; y0: number; x1: number; y1: number }) => Promise<{ value: number; conf: number } | null>> {
  const sharp = (await import("sharp")).default;
  const { createWorker } = await import("tesseract.js");
  const paths = resolveTessPaths();
  const worker = await createWorker("eng", 1, {
    cachePath: "/tmp/bof-tessdata",
    logger: () => {},
    ...paths,
  });
  const meta = await sharp(bytes).metadata();
  const W = meta.width ?? 1;
  const H = meta.height ?? 1;

  const recognize = async (png: Buffer, psm: string): Promise<{ digits: string; conf: number } | null> => {
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: psm as import("tesseract.js").PSM,
        tessedit_char_whitelist: "0123456789",
      });
      const { data } = await worker.recognize(png);
      const digits = String(data.text ?? "").replace(/\D/g, "");
      const ws = (data.words ?? []) as { confidence?: number }[];
      const conf = ws.length ? ws.reduce((a, w) => a + (w.confidence ?? 0), 0) / ws.length : 0;
      return digits ? { digits, conf } : null;
    } catch {
      return null;
    }
  };

  return async (zone) => {
    const x0 = Math.max(0, Math.round(zone.x0));
    const y0 = Math.max(0, Math.round(zone.y0));
    const x1 = Math.min(W, Math.round(zone.x1));
    const y1 = Math.min(H, Math.round(zone.y1));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w < 4 || h < 5) return null;

    const S = Math.min(12, Math.max(4, Math.round(120 / h)));
    const { data: raw, info } = await sharp(bytes)
      .extract({ left: x0, top: y0, width: w, height: h })
      .resize(w * S, h * S, { kernel: "mitchell" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const cw = info.width;
    const ch = info.height;
    const chn = info.channels;

    // MASK KUNING PEKAT: R≥110, G≥85, R-B≥85, G-B≥55
    const mask = new Uint8Array(cw * ch);
    let on = 0;
    for (let i = 0; i < cw * ch; i++) {
      const R = raw[i * chn];
      const G = raw[i * chn + 1];
      const B = raw[i * chn + 2];
      if (R >= 110 && G >= 85 && R - B >= 85 && G - B >= 55) {
        mask[i] = 1;
        on++;
      }
    }

    if (on >= 12) {
      // bbox piksel mask yang punya tetangga (buang piksel liar 1 px)
      let bx0 = cw, by0 = ch, bx1 = 0, by1 = 0, hitung = 0;
      for (let y = 1; y < ch - 1; y++) {
        for (let x = 1; x < cw - 1; x++) {
          const i = y * cw + x;
          if (!mask[i]) continue;
          const tetangga = mask[i - 1] + mask[i + 1] + mask[i - cw] + mask[i + cw];
          if (tetangga < 2) continue;
          if (x < bx0) bx0 = x;
          if (x > bx1) bx1 = x;
          if (y < by0) by0 = y;
          if (y > by1) by1 = y;
          hitung++;
        }
      }
      if (hitung >= 10 && bx1 > bx0 && by1 > by0) {
        const bw = bx1 - bx0 + 1;
        const bh = by1 - by0 + 1;
        // normalisasi: tinggi glyph 48 px, lebar proporsional (maks 96)
        const targetH = 48;
        const scale = targetH / bh;
        let targetW = Math.round(bw * scale);
        if (targetW > 96) targetW = 96;
        if (targetW < 8) targetW = 8;
        const padX = Math.max(12, Math.round((112 - targetW) / 2));
        const maskBuf = Buffer.alloc(cw * ch * 3);
        for (let i = 0; i < cw * ch; i++) {
          const v = mask[i] ? 0 : 255;
          maskBuf[i * 3] = v;
          maskBuf[i * 3 + 1] = v;
          maskBuf[i * 3 + 2] = v;
        }
        const glyph = await sharp(maskBuf, { raw: { width: cw, height: ch, channels: 3 } })
          .extract({ left: bx0, top: by0, width: bw, height: bh })
          .resize(targetW, targetH, { kernel: "mitchell" })
          .extend({ top: 12, bottom: 12, left: padX, right: Math.max(12, 112 - targetW - padX), background: { r: 255, g: 255, b: 255 } })
          .png()
          .toBuffer();
        let best: { value: number; conf: number } | null = null;
        for (const psm of ["10", "7", "8"]) {
          const r = await recognize(glyph, psm);
          if (!r) continue;
          const v = Number(r.digits.slice(0, 2));
          if (!Number.isFinite(v)) continue;
          if (!best || r.conf > best.conf) best = { value: v, conf: r.conf };
        }
        if (best && best.conf >= 35) return best;
      }
    }

    // fallback abu-abu (mask gagal — mis. tema warna lain)
    const gray = await sharp(bytes)
      .extract({ left: x0, top: y0, width: w, height: h })
      .resize(w * S, h * S, { kernel: "mitchell" })
      .grayscale()
      .normalise()
      .png()
      .toBuffer();
    let best2: { value: number; conf: number } | null = null;
    for (const psm of ["7", "8"]) {
      const r = await recognize(gray, psm);
      if (!r) continue;
      const v = Number(r.digits.slice(0, 2));
      if (!Number.isFinite(v)) continue;
      if (!best2 || r.conf > best2.conf) best2 = { value: v, conf: r.conf };
    }
    if (best2 && best2.conf < 55) return null;
    return best2;
  };
}

// ============================================================
// PIPELINE SERVER (FALLBACK) — link ImgBB → baris { rank, total kill }
// v4: bila jumlah blok < expectedTeams (tim terdaftar), gambar di-OCR
// ulang per PARUH (kiri/kanan untuk layar lebar, atas/bawah selain itu)
// via sharp crop → hasil digabung + rank dinomori ulang bebas ganda.
// ============================================================
export interface OcrPipelineResult {
  ok: true;
  source: string;
  needsReview: boolean;
  booyahTeam: string | null;
  rows: OcrRow[];
  notes: string | null;
}

export async function runOcrPipeline(opts: {
  imageUrl: string;
  expectedTeams?: number;
  fetchImage?: (url: string) => Promise<Buffer>;
  settings?: OcrEngineSettings;
  jereApiKey?: string;
}): Promise<OcrPipelineResult> {
  void opts.settings;
  void opts.jereApiKey;
  const expectedTeams = Math.max(0, Math.min(24, opts.expectedTeams ?? 0));
  const ambil =
    opts.fetchImage ??
    (async (url: string) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`Gagal mengunduh gambar (HTTP ${res.status}).`);
      return Buffer.from(await res.arrayBuffer());
    });
  const bytes = await ambil(opts.imageUrl);
  const { words, width, height } = await ocrWordBoxes(bytes);
  const rescue: RescueDigitFn = await createDigitRescuerNode(bytes);
  const hasil = await parseKillAnchoredRows(words, width, { rescueDigit: rescue });
  let blocks: KillBlock[] = hasil.blocks;

  // ===== v4 RECOVERY — bila kurang dari jumlah tim terdaftar =====
  if (expectedTeams > 0 && blocks.length && blocks.length < expectedTeams) {
    const sharp = (await import("sharp")).default;
    const vertikal = width / Math.max(1, height) > 1.25;
    const potongan = vertikal
      ? [
          { left: 0, top: 0, width: Math.ceil(width / 2) + Math.round(0.02 * width), height },
          { left: Math.floor(width / 2) - Math.round(0.02 * width), top: 0, width: width - Math.floor(width / 2) + Math.round(0.02 * width), height },
        ]
      : [
          { left: 0, top: 0, width, height: Math.ceil(height / 2) + Math.round(0.02 * height) },
          { left: 0, top: Math.floor(height / 2) - Math.round(0.02 * height), width, height: height - Math.floor(height / 2) + Math.round(0.02 * height) },
        ];
    const extra: KillBlock[] = [];
    for (const p of potongan) {
      if (p.width < 40 || p.height < 40) continue;
      const crop = await sharp(bytes).extract(p).png().toBuffer();
      const hOcr = await ocrWordBoxes(crop);
      const hRescue = await createDigitRescuerNode(crop);
      const hHasil = await parseKillAnchoredRows(hOcr.words, hOcr.width, { rescueDigit: hRescue });
      for (const b of hHasil.blocks) {
        for (const pair of b.pairs) {
          pair.cx += p.left;
          pair.cy += p.top;
        }
        if (b.stripX !== null) b.stripX += p.left;
        if (b.ordY !== undefined) b.ordY += p.top;
        b.halfIdx = undefined;
      }
      extra.push(...hHasil.blocks);
    }
    if (extra.length) {
      const gabung = mergeBlocks(blocks, extra, hasil.lineH || 24);
      assignFinalRanks(gabung, width);
      gabung.sort((a, b) => a.rank - b.rank || (a.stripX ?? 0) - (b.stripX ?? 0));
      blocks = gabung;
    }
  }

  if (!blocks.length) {
    throw new Error(
      "Layar tidak dikenali sebagai papan skor Free Fire (kata \"Kill\" tidak ditemukan). Gunakan screenshot layar hasil/klasemen akhir match.",
    );
  }
  const rows: OcrRow[] = blocks.map((b) => ({
    rank: b.rank,
    teamRaw: `Top #${b.rank}`,
    teamId: null,
    teamName: null,
    kills: b.pairs.reduce((a, p) => a + p.value, 0),
    confidence: Math.round(Math.min(0.97, Math.max(0.2, 0.4 + 0.125 * b.pairs.length + (b.rankRead !== null ? 0.05 : 0))) * 100) / 100,
  }));
  const perluCek = blocks.filter((b) => b.flags.length > 0 || b.pairs.length < 4).length;
  const kurang = expectedTeams > 0 && blocks.length < expectedTeams ? expectedTeams - blocks.length : 0;
  return {
    ok: true,
    source: "server-ocr",
    needsReview: perluCek > 0 || kurang > 0,
    booyahTeam: null,
    rows,
    notes:
      `${blocks.length} blok placement terbaca (mesin server)` +
      (expectedTeams > 0 ? ` dari ${expectedTeams} tim terdaftar` : "") +
      (kurang ? ` — ${kurang} tim belum terbaca` : "") +
      (perluCek ? `; ${perluCek} blok perlu diperiksa` : "") +
      `. Total kill = penjumlahan kill 4 pemain per blok.`,
  };
}
