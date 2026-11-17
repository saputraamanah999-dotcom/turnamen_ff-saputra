"use client";
// ============================================================
// STIKAR ESPORTS — BOF · Klien AI OCR (sisi admin browser)
// v3 "KILL-ANCHORED": OCR berjalan penuh DI BROWSER.
//
// Alur: pilih screenshot → /api/upload/screenshot (ImgBB) →
// tesseract.js 2 pass (koordinat kata) → parser kill-anchored
// (src/lib/ocr-rows.ts) → setiap sel angka di-ZOOM ulang dengan
// MASK KUNING + whitelist digit (rescue) → hasil { rank, total kill }
// → admin pilih tim terdaftar per baris → TERAPKAN → formulir Entri
// Hasil terisi otomatis + arsip ocrUploads.
//
// NAMA PEMAIN SENGAJA TIDAK DIBACA/DITAMPILKAN (permintaan admin):
// hasil akhir hanya placement + total kill tim (penjumlahan 4 pemain).
// FALLBACK: bila browser gagal mengenali papan skor dan link gambar
// tersedia, analisa dilanjutkan otomatis di server (pipeline sama).
// ============================================================

import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import {
  assignFinalRanks,
  mergeBlocks,
  parseKillAnchoredRows,
  type DigitZone,
  type KillBlock,
  type OcrWord,
} from "@/lib/ocr-rows";
import type { OcrAnalysis, OcrRow, OcrUpload, Team } from "@/lib/types";

// ---------- Pengaturan (disimpan di Firestore settings/ocr) ----------
// Prinsip: .env hanya berisi API KEY (SATU key per provider). Endpoint
// & model diatur dari UI Admin — bisa diganti TANPA deploy ulang.
export interface OcrSettings {
  /** Base URL API jerexd — bisa diganti dari UI tanpa deploy ulang. */
  jereEndpoint: string;
  /** Model vision jerexd (kosong = default server jerexd). */
  jereVisionModel: string;
  /** Model teks jerexd (aichat) — cadangan. */
  jereTextModel: string;
}

export const OCR_SETTINGS_DEFAULT: OcrSettings = {
  jereEndpoint: "https://api.jerexd.my.id",
  jereVisionModel: "",
  jereTextModel: "google/gemini-3.1-flash-lite",
};

/** Normalisasi base URL endpoint: trim, buang slash akhir, wajib https. */
function normalizeEndpoint(raw: string): string {
  const s = raw.trim().replace(/\/+$/, "");
  return /^https:\/\//i.test(s) ? s.slice(0, 120) : OCR_SETTINGS_DEFAULT.jereEndpoint;
}

/** Baca pengaturan AI OCR dari dokumen settings/ocr (fallback: nilai bawaan). */
export async function loadOcrSettings(): Promise<OcrSettings> {
  if (!db) return { ...OCR_SETTINGS_DEFAULT };
  try {
    const snap = await getDoc(doc(db, "settings", "ocr"));
    if (!snap.exists()) return { ...OCR_SETTINGS_DEFAULT };
    const d = snap.data() as Partial<OcrSettings>;
    return {
      jereEndpoint: normalizeEndpoint(String(d.jereEndpoint ?? OCR_SETTINGS_DEFAULT.jereEndpoint)),
      jereVisionModel: String(d.jereVisionModel ?? "").slice(0, 80),
      jereTextModel: String(d.jereTextModel ?? OCR_SETTINGS_DEFAULT.jereTextModel).slice(0, 80),
    };
  } catch {
    return { ...OCR_SETTINGS_DEFAULT };
  }
}

/** Simpan pengaturan AI OCR (dipakai halaman Admin → Pengaturan → AI & OCR). */
export async function saveOcrSettings(s: OcrSettings): Promise<void> {
  if (!db) throw new Error("Firebase belum terhubung.");
  await setDoc(doc(db, "settings", "ocr"), {
    jereEndpoint: normalizeEndpoint(s.jereEndpoint),
    jereVisionModel: s.jereVisionModel.trim().slice(0, 80),
    jereTextModel: s.jereTextModel.trim().slice(0, 80) || OCR_SETTINGS_DEFAULT.jereTextModel,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export interface UploadScreenshotResult {
  url: string;
  thumbUrl?: string;
  deleteUrl?: string;
  host: "imgbb";
  width?: number;
  height?: number;
  size?: number;
  mime?: string;
  filename?: string;
}

/** Kirim file screenshot ke /api/upload/screenshot → dapat link gambar. */
export async function uploadScreenshot(
  file: File,
  tid: string,
  matchId: string,
): Promise<UploadScreenshotResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("tid", tid);
  form.append("matchId", matchId);
  const res = await fetch("/api/upload/screenshot", { method: "POST", body: form });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(String(json?.error ?? `Server menolak upload (HTTP ${res.status})`));
  }
  return json as UploadScreenshotResult;
}

/** Kirim link gambar ke /api/ai/ocr → baris hasil (fallback server).
 *  expectedTeams = jumlah tim terdaftar (target deteksi recovery). */
export async function analyzeScreenshot(imageUrl: string, expectedTeams = 0): Promise<OcrAnalysis> {
  const res = await fetch("/api/ai/ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl, expectedTeams }),
    signal: AbortSignal.timeout(70_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    const detail = Array.isArray(json?.detail) && json.detail.length ? `\n${json.detail.join("\n")}` : "";
    throw new Error(String(json?.error ?? `Server analisa gagal (HTTP ${res.status})`) + detail);
  }
  return {
    source: json.source,
    booyahTeam: json.booyahTeam ?? null,
    rows: (json.rows ?? []) as OcrRow[],
    notes: json.notes ?? null,
    needsReview: Boolean(json.needsReview),
    analyzedAt: Date.now(),
  };
}

/**Gabungkan kata 2 pass (utama PSM 6 + sparse PSM 11) tanpa duplikat posisi. */
function mergeWords(main: OcrWord[], sparse: OcrWord[]): OcrWord[] {
  const words = [...main];
  for (const s of sparse) {
    const scx = s.x + s.w / 2;
    const scy = s.y + s.h / 2;
    const tabrak = main.find((m) => {
      const mcx = m.x + m.w / 2;
      const mcy = m.y + m.h / 2;
      return Math.abs(mcx - scx) <= Math.max(14, m.w * 0.6) && Math.abs(mcy - scy) <= Math.max(10, m.h * 0.6);
    });
    if (!tabrak) words.push(s);
    else if (/^[((]?[Kk][A-Za-z]{0,4}$/.test(tabrak.text) && /^[0-9]{1,2}$/.test(s.text)) words.push(s);
  }
  return words;
}

/**
 * RESCUE DIGIT DI BROWSER — cermin createDigitRescuerNode (ocr-engine):
 * zona di-zoom, mask kuning pekat (R-B besar) memisahkan angka dari
 * nama/kata "Kill", bbox glyph dinormalisasi ke tinggi 48 px lalu dibaca
 * Tesseract whitelist digit (PSM 10/7/8). Fallback abu-abu bila mask kosong.
 */
/** Tipe minimum worker Tesseract yang dibutuhkan rescuer (loose agar
 *  kompatibel dengan tipe resmi tesseract.js). */
interface TessWorkerLike {
  setParameters: (p: Record<string, unknown>) => Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recognize: (img: any) => Promise<{ data: { text?: string; words?: { confidence?: number }[] } }>;
}

function createDigitRescuerBrowser(
  canvas: HTMLCanvasElement,
  worker: TessWorkerLike,
): (zone: DigitZone) => Promise<{ value: number; conf: number } | null> {
  const W = canvas.width;
  const H = canvas.height;
  const zoneCanvas = document.createElement("canvas");
  const zctx = zoneCanvas.getContext("2d", { willReadFrequently: true });
  const glyphCanvas = document.createElement("canvas");
  const gctx = glyphCanvas.getContext("2d");

  const recognize = async (cnv: HTMLCanvasElement, psm: string): Promise<{ digits: string; conf: number } | null> => {
    try {
      await worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: "0123456789" });
      const { data } = await worker.recognize(cnv);
      const digits = String(data.text ?? "").replace(/\D/g, "");
      const ws = data.words ?? [];
      const conf = ws.length ? ws.reduce((a, w) => a + (w.confidence ?? 0), 0) / ws.length : 0;
      return digits ? { digits, conf } : null;
    } catch {
      return null;
    }
  };

  return async (zone) => {
    if (!zctx || !gctx) return null;
    const x0 = Math.max(0, Math.round(zone.x0));
    const y0 = Math.max(0, Math.round(zone.y0));
    const x1 = Math.min(W, Math.round(zone.x1));
    const y1 = Math.min(H, Math.round(zone.y1));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w < 4 || h < 5) return null;

    const S = Math.min(12, Math.max(4, Math.round(120 / h)));
    zoneCanvas.width = w * S;
    zoneCanvas.height = h * S;
    zctx.imageSmoothingEnabled = true;
    zctx.imageSmoothingQuality = "high";
    zctx.drawImage(canvas, x0, y0, w, h, 0, 0, w * S, h * S);
    const img = zctx.getImageData(0, 0, w * S, h * S);
    const cw = w * S;
    const ch = h * S;
    const px = img.data;

    // MASK KUNING PEKAT: R≥110, G≥85, R-B≥85, G-B≥55
    const mask = new Uint8Array(cw * ch);
    let on = 0;
    for (let i = 0; i < cw * ch; i++) {
      const R = px[i * 4];
      const G = px[i * 4 + 1];
      const B = px[i * 4 + 2];
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
        glyphCanvas.width = 112;
        glyphCanvas.height = 72;
        gctx.fillStyle = "#ffffff";
        gctx.fillRect(0, 0, 112, 72);
        gctx.imageSmoothingEnabled = true;
        gctx.imageSmoothingQuality = "high";
        // gambar bagian bbox dari zoneCanvas (sudah di-zoom) → glyph hitam di atas putih
        gctx.save();
        gctx.drawImage(zoneCanvas, bx0, by0, bw, bh, padX, 12, targetW, targetH);
        gctx.restore();
        // binarize glyph: mask kuning → hitam, sisanya putih
        const gimg = gctx.getImageData(0, 0, 112, 72);
        for (let i = 0; i < 112 * 72; i++) {
          const R = gimg.data[i * 4];
          const G = gimg.data[i * 4 + 1];
          const B = gimg.data[i * 4 + 2];
          const hitam = R >= 110 && G >= 85 && R - B >= 85 && G - B >= 55;
          const v = hitam ? 0 : 255;
          gimg.data[i * 4] = v;
          gimg.data[i * 4 + 1] = v;
          gimg.data[i * 4 + 2] = v;
        }
        gctx.putImageData(gimg, 0, 0);
        let best: { value: number; conf: number } | null = null;
        for (const psm of ["10", "7", "8"]) {
          const r = await recognize(glyphCanvas, psm);
          if (!r) continue;
          const v = Number(r.digits.slice(0, 2));
          if (!Number.isFinite(v)) continue;
          if (!best || r.conf > best.conf) best = { value: v, conf: r.conf };
        }
        if (best && best.conf >= 35) {
          await worker.setParameters({ tessedit_char_whitelist: "" });
          return best;
        }
      }
    }

    // fallback abu-abu (mask gagal — mis. tema warna lain)
    gctx.fillStyle = "#ffffff";
    gctx.fillRect(0, 0, Math.max(1, glyphCanvas.width), Math.max(1, glyphCanvas.height));
    glyphCanvas.width = w * S;
    glyphCanvas.height = h * S;
    gctx.fillStyle = "#ffffff";
    gctx.fillRect(0, 0, w * S, h * S);
    gctx.drawImage(canvas, x0, y0, w, h, 0, 0, w * S, h * S);
    const gimg2 = gctx.getImageData(0, 0, w * S, h * S);
    // grayscale + normalisasi kontras sederhana
    let mn = 255;
    let mx = 0;
    const grays = new Uint8Array(w * S * h * S);
    for (let i = 0; i < w * S * h * S; i++) {
      const g = Math.round((gimg2.data[i * 4] * 299 + gimg2.data[i * 4 + 1] * 587 + gimg2.data[i * 4 + 2] * 114) / 1000);
      grays[i] = g;
      if (g < mn) mn = g;
      if (g > mx) mx = g;
    }
    const range = Math.max(1, mx - mn);
    for (let i = 0; i < w * S * h * S; i++) {
      const v = Math.round(((grays[i] - mn) / range) * 255);
      gimg2.data[i * 4] = v;
      gimg2.data[i * 4 + 1] = v;
      gimg2.data[i * 4 + 2] = v;
    }
    gctx.putImageData(gimg2, 0, 0);
    let best2: { value: number; conf: number } | null = null;
    for (const psm of ["7", "8"]) {
      const r = await recognize(glyphCanvas, psm);
      if (!r) continue;
      const v = Number(r.digits.slice(0, 2));
      if (!Number.isFinite(v)) continue;
      if (!best2 || r.conf > best2.conf) best2 = { value: v, conf: r.conf };
    }
    await worker.setParameters({ tessedit_char_whitelist: "" });
    if (best2 && best2.conf < 55) return null;
    return best2;
  };
}

/**
 * MODE UTAMA — OCR DI BROWSER admin (bebas batas waktu server).
 * 2 pass tesseract → parser kill-anchored (grid band × baris, tanpa nama
 * pemain) → rescue zoom-digit per sel → baris { rank, total kill }.
 *
 * v4 RECOVERY AKURASI (fix "10 tim cuma terbaca 3-8"):
 * 1. Parser kini bebas rank ganda (blok tanpa badge tidak lagi menomori
 *    ulang dari 1) — lihat assignFinalRanks di ocr-rows.ts.
 * 2. Bila jumlah blok < jumlah tim terdaftar (teams.length), gambar
 *    di-OCR ULANG per PARUH (kiri/kanan untuk layar lebar, atas/bawah
 *    untuk layar tinggi) — tiap paruh dibaca dengan resolusi efektif
 *    2× lebih besar dan segmentasi lebih bersih, lalu hasilnya DIGABUNG
 *    (sel duplikat dibuang, blok terkaya yang menang) dan rank dinomori
 *    ulang 1..N dari urutan layar.
 * 3. Rank akhir dijamin unik; baris yang tetap hilang dilaporkan jelas
 *    ("terbaca X dari Y tim") dan bisa ditambah manual di UI.
 *
 * FALLBACK: bila browser gagal mengenali papan skor (0 blok) dan link
 * gambar tersedia, analisa dilanjutkan otomatis di server.
 */
export async function analyzeScreenshotClient(
  file: File,
  teams: Team[],
  onProgress?: (note: string) => void,
  imageUrl?: string,
): Promise<OcrAnalysis> {
  const report = (s: string) => onProgress?.(s);
  // Jumlah tim terdaftar = target deteksi (fix "10 team cuma kebaca 3").
  const expectedTeams = Math.max(0, Math.min(24, teams.length || 0));
  void teams; // pencocokan tim dilakukan manual di UI (tanpa nama pemain)

  // Downscale di browser: gambar SELALU digambar ke canvas (fix bug
  // "o.toDataURL is not a function" — ImageBitmap tidak punya metode itu).
  report("Menyiapkan gambar…");
  const bitmap = await createImageBitmap(file);
  const skala = bitmap.width > 2000 ? 2000 / bitmap.width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * skala));
  canvas.height = Math.max(1, Math.round(bitmap.height * skala));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Browser ini tidak mendukung canvas 2D. Gunakan Chrome terbaru.");
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const toWords = (data: { words?: { text?: string; bbox?: { x0: number; y0: number; x1: number; y1: number }; confidence?: number }[] }): OcrWord[] =>
    (data.words ?? [])
      .filter((w) => w.bbox && w.text && String(w.text).trim())
      .map((w) => ({
        text: String(w.text).trim(),
        x: w.bbox!.x0,
        y: w.bbox!.y0,
        w: w.bbox!.x1 - w.bbox!.x0,
        h: w.bbox!.y1 - w.bbox!.y0,
        conf: w.confidence ?? 0,
      }));

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, { logger: () => {} });

  /** OCR 2 pass (PSM 6 + 11) atas satu canvas → kata tergabung. */
  const recognizeCanvas = async (cnv: HTMLCanvasElement): Promise<OcrWord[]> => {
    await worker.setParameters({ tessedit_pageseg_mode: "6" as never });
    const main = toWords((await worker.recognize(cnv)).data ?? {});
    await worker.setParameters({ tessedit_pageseg_mode: "11" as never });
    const sparse = toWords((await worker.recognize(cnv)).data ?? {});
    return mergeWords(main, sparse);
  };

  /** Parse kata → blok placement (rank + sel kill) pada satu region. */
  const parseRegion = async (words: OcrWord[], regionW: number, rescuer: ReturnType<typeof createDigitRescuerBrowser> | null) => {
    const hasil = await parseKillAnchoredRows(words, regionW, rescuer ? { rescueDigit: rescuer } : {});
    return hasil;
  };

  let blocks: KillBlock[] = [];
  let lineH = 0;
  try {
    report("Membaca layar skor (pass 1/2)…");
    const words = await recognizeCanvas(canvas);

    // Parser kill-anchored + rescue zoom-digit per sel (kunci akurasi).
    report("Meneliti ulang tiap angka (zoom + mask kuning)…");
    const rescue = createDigitRescuerBrowser(canvas, worker);
    const hasil = await parseRegion(words, canvas.width, rescue);
    blocks = hasil.blocks;
    lineH = hasil.lineH;

    // ===== v4 RECOVERY — bila kurang dari jumlah tim terdaftar =====
    if (expectedTeams > 0 && blocks.length < expectedTeams) {
      report(
        `Baru ${blocks.length}/${expectedTeams} tim terbaca — analisa ulang per bagian gambar…`,
      );
      // Arah potong: layar lebar → kiri|kanan (2 kolom tim); layar
      // tinggi/persegi → atas|bawah (daftar panjang terpotong layar).
      const vertikal = canvas.width / Math.max(1, canvas.height) > 1.25;
      const potongan: { x: number; y: number; w: number; h: number }[] = vertikal
        ? [
            { x: 0, y: 0, w: Math.ceil(canvas.width / 2) + Math.round(0.02 * canvas.width), h: canvas.height },
            { x: Math.floor(canvas.width / 2) - Math.round(0.02 * canvas.width), y: 0, w: canvas.width - Math.floor(canvas.width / 2) + Math.round(0.02 * canvas.width), h: canvas.height },
          ]
        : [
            { x: 0, y: 0, w: canvas.width, h: Math.ceil(canvas.height / 2) + Math.round(0.02 * canvas.height) },
            { x: 0, y: Math.floor(canvas.height / 2) - Math.round(0.02 * canvas.height), w: canvas.width, h: canvas.height - Math.floor(canvas.height / 2) + Math.round(0.02 * canvas.height) },
          ];

      const extra: KillBlock[] = [];
      for (let i = 0; i < potongan.length; i++) {
        const p = potongan[i];
        const halfCnv = document.createElement("canvas");
        halfCnv.width = Math.max(1, p.w);
        halfCnv.height = Math.max(1, p.h);
        const hctx = halfCnv.getContext("2d", { willReadFrequently: true });
        if (!hctx) continue;
        hctx.drawImage(canvas, p.x, p.y, p.w, p.h, 0, 0, p.w, p.h);
        report(`Membaca ulang bagian ${i + 1}/2 (resolusi lebih besar)…`);
        const hWords = await recognizeCanvas(halfCnv);
        const hRescue = createDigitRescuerBrowser(halfCnv, worker);
        const hHasil = await parseRegion(hWords, halfCnv.width, hRescue);
        // Geser koordinat paruh → ruang gambar penuh, lalu lepas halfIdx
        // (penggabungan lintas-pass memakai kolom berbasis stripX).
        for (const b of hHasil.blocks) {
          for (const pair of b.pairs) {
            pair.cx += p.x;
            pair.cy += p.y;
          }
          if (b.stripX !== null) b.stripX += p.x;
          if (b.ordY !== undefined) b.ordY += p.y;
          b.halfIdx = undefined;
        }
        extra.push(...hHasil.blocks);
      }

      if (extra.length) {
        const gabung = mergeBlocks(blocks, extra, lineH || 24);
        assignFinalRanks(gabung, canvas.width);
        gabung.sort((a, b) => a.rank - b.rank || (a.stripX ?? 0) - (b.stripX ?? 0));
        blocks = gabung;
      }
    }
  } finally {
    await worker.terminate().catch(() => {});
  }

  if (!blocks.length) {
    // FALLBACK OTOMATIS — browser tak mengenali papan skor; coba mesin
    // server (pipeline sama atas link ImgBB) sebelum menyerah.
    if (imageUrl && /^https:\/\//i.test(imageUrl)) {
      report("Browser sulit membaca layar ini — mencoba mesin server…");
      return await analyzeScreenshot(imageUrl, expectedTeams);
    }
    throw new Error(
      "Layar tidak dikenali sebagai papan skor Free Fire (kata \"Kill\" tidak ditemukan). " +
        "Gunakan screenshot layar hasil/klasemen akhir match.",
    );
  }

  report(`Menyusun hasil (${blocks.length} tim)…`);
  const rows: OcrRow[] = blocks.map((b) => {
    const kills = b.pairs.reduce((a, p) => a + p.value, 0);
    const confidence = Math.min(0.97, Math.max(0.2, 0.4 + 0.125 * b.pairs.length + (b.rankRead !== null ? 0.05 : 0)));
    return {
      rank: b.rank,
      teamRaw: `Top #${b.rank}`,
      teamId: null,
      teamName: null,
      kills,
      confidence: Math.round(confidence * 100) / 100,
    };
  });
  const perluCek = blocks.filter((b) => b.flags.length > 0 || b.pairs.length < 4).length;
  const kurang = expectedTeams > 0 && blocks.length < expectedTeams ? expectedTeams - blocks.length : 0;
  return {
    source: "browser-ocr",
    booyahTeam: null,
    rows,
    notes:
      `${blocks.length} blok placement terbaca` +
      (expectedTeams > 0 ? ` dari ${expectedTeams} tim terdaftar` : "") +
      (kurang ? ` — ${kurang} tim belum terbaca, tambah manual lewat "+ Tambah Baris"` : "") +
      (perluCek ? `; ${perluCek} blok perlu diperiksa (angka kurang lengkap / rank otomatis)` : "") +
      `. Total kill = penjumlahan kill 4 pemain per blok.`,
    needsReview: perluCek > 0 || kurang > 0,
    analyzedAt: Date.now(),
  };
}

/** Arsipkan sesi upload+analisa ke koleksi ocrUploads (aturan: hanya admin). */
export async function saveOcrUpload(
  tid: string,
  matchId: string,
  matchNumber: number | undefined,
  up: UploadScreenshotResult,
  analysis: OcrAnalysis,
): Promise<string | null> {
  if (!db) return null;
  const rec: OcrUpload = {
    tid,
    matchId,
    matchNumber,
    url: up.url,
    thumbUrl: up.thumbUrl,
    deleteUrl: up.deleteUrl,
    host: up.host,
    width: up.width,
    height: up.height,
    size: up.size,
    mime: up.mime,
    filename: up.filename,
    analysis,
    applied: false,
  };
  const ref = await addDoc(collection(db, "ocrUploads"), {
    ...rec,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Tandai analisa sudah diterapkan ke formulir. */
export async function markOcrApplied(uploadId: string) {
  if (!db || !uploadId) return;
  await updateDoc(doc(db, "ocrUploads", uploadId), { applied: true });
}

/** Simpan link screenshot pada dokumen match (untuk tampilan + bukti). */
export async function linkScreenshotToMatch(
  tid: string,
  matchId: string,
  url: string,
  thumbUrl?: string,
) {
  if (!db) return;
  await updateDoc(doc(db, `tournaments/${tid}/matches/${matchId}`), {
    screenshotUrl: url,
    screenshotThumbUrl: thumbUrl ?? "",
    updatedAt: serverTimestamp(),
  });
}
