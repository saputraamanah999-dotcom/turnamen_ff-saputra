"use client";
// ============================================================
// STIKAR ESPORTS — BOF · Klien AI OCR (sisi admin browser)
// Alur: pilih screenshot → /api/upload/screenshot (ImgBB,
// dapat link) → /api/ai/ocr (AI baca placement/kill, cocokkan tim
// terdaftar via memori kapten/roster/alias) → admin periksa →
// TERAPKAN → formulir Entri Hasil terisi otomatis + arsip ocrUploads.
// ============================================================

import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { normalizeTeamKey } from "@/lib/ocr";
import { computeCellZones, type OcrWord, type ParsedMember } from "@/lib/ocr-blocks";
import type { OcrAnalysis, OcrRow, OcrUpload, Team } from "@/lib/types";

// ---------- Pengaturan mesin AI OCR (disimpan di Firestore settings/ocr) ----------
// Prinsip: .env hanya berisi API KEY (SATU key per provider). Endpoint,
// model & fallback diatur dari UI Admin — bisa diganti TANPA deploy ulang.
export interface OcrSettings {
  /** Base URL API jerexd — bisa diganti dari UI tanpa deploy ulang. */
  jereEndpoint: string;
  /** Model vision jerexd (kosong = default server jerexd). */
  jereVisionModel: string;
  /** Model teks jerexd (aichat) untuk penstrukturan JSON. */
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

/** Kirim link gambar ke /api/ai/ocr → baris hasil (placement/kill) siap dipakai. */
export async function analyzeScreenshot(imageUrl: string, teams: Team[]): Promise<OcrAnalysis> {
  // Registry untuk AI: hanya data yang membantu identifikasi tim.
  const registry = teams.map((t) => ({
    id: t.id,
    name: t.name,
    tag: t.tag ?? "",
    captain: t.captain ?? "",
    roster: (t.roster ?? []).map((r) => ({ nickname: r.nickname })),
    ocrAliases: t.ocrAliases ?? [],
  }));
  // Pengaturan mesin dari Firestore (Admin → Pengaturan → AI & OCR).
  const settings = await loadOcrSettings();
  const res = await fetch("/api/ai/ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl, teams: registry, settings }),
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

/**
 * MODE UTAMA — OCR DI BROWSER admin (bebas batas waktu server).
 * Alur: file → tesseract.js (2 pass, koordinat kata) → parser geometris
 * blok placement (lib bersama src/lib/ocr-blocks.ts) → ZOOM re-OCR per sel
 * (piksel + whitelist digit, normal+invert) → kirim BLOK ke /api/ai/ocr →
 * server menghitung total (penjumlahan kill per blok), memperbaiki nama via
 * aichat (bila key ada), mencocokkan tim terdaftar → baris siap dipakai.
 * FALLBACK: bila browser gagal mengenali papan skor (< 2 blok) dan link
 * gambar tersedia, analisa dilanjutkan otomatis di server (pipeline penuh).
 */
export async function analyzeScreenshotClient(
  file: File,
  teams: Team[],
  onProgress?: (note: string) => void,
  imageUrl?: string,
): Promise<OcrAnalysis> {
  const { createWorker } = await import("tesseract.js");
  const { parseWordBoxesToBlocks } = await import("@/lib/ocr-blocks");

  const report = (s: string) => onProgress?.(s);

  // Downscale di browser: OCR 1600px akurat & jauh lebih cepat.
  // FIX BUG "o.toDataURL is not a function": ImageBitmap TIDAK punya metode
  // .toDataURL() — screenshot HP (±1080px, ≤1600) selalu memicu error itu
  // karena dulu canvas hanya dibuat bila gambar >1600px. Sekarang gambar
  // SELALU digambar ke canvas (downscale bila besar, 1:1 bila sudah kecil).
  report("Menyiapkan gambar…");
  const bitmap = await createImageBitmap(file);
  const skala = bitmap.width > 1600 ? 1600 / bitmap.width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * skala));
  canvas.height = Math.max(1, Math.round(bitmap.height * skala));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Browser ini tidak mendukung canvas 2D. Gunakan Chrome terbaru.");
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const width = canvas.width;
  const height = canvas.height;

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

  // Tesseract.js v5 menerima HTMLCanvasElement langsung (ImageLike) — lebih
  // cepat tanpa data-URL. Fallback data-URL JPEG hanya bila browser aneh.
  let imageLike: HTMLCanvasElement | string = canvas;
  try {
    imageLike = canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    imageLike = canvas; // tetap ImageLike yang valid di semua pass
  }

  const worker = await createWorker("eng", 1, { logger: () => {} });
  let words: OcrWord[] = [];
  let blocks: ReturnType<typeof parseWordBoxesToBlocks> = [];
  try {
    report("Membaca layar skor (pass 1/2)…");
    await worker.setParameters({ tessedit_pageseg_mode: "6" as never });
    const main = toWords((await worker.recognize(imageLike)).data ?? {});
    words = main;
    blocks = parseWordBoxesToBlocks(words, width, height);

    // Pass sparse (PSM 11) — selalu dijalankan: menangkap angka/badge yang
    // lolos dari pass utama (badge rank emas sering tak terbaca pass 6).
    report("Membaca lebih teliti (pass 2/2)…");
    await worker.setParameters({ tessedit_pageseg_mode: "11" as never });
    const sparse = toWords((await worker.recognize(imageLike)).data ?? {});
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
    blocks = parseWordBoxesToBlocks(words, width, height);

    // ============================================================
    // ZOOM RE-OCR PER SEL — mekanisme AKURASI utama (fix angka salah).
    // Grid blok sudah diketahui → 4 sel (2x2) per blok. Untuk setiap sel:
    //   1. zona angka kill dianalisis PIKSEL (profil kolom terang) → segmen
    //      digit = segmen tepat sebelum kata "Kill";
    //   2. segmen itu di-zoom 8x → OCR whitelist digit (normal + invert,
    //      pilih conf tertinggi);
    //   3. bila piksel gagal → OCR teks sel utuh 3x → digit terakhir
    //      sebelum kata Kill (format menempel "NAMA9Kill" pun terbaca).
    // Hasil digabung dengan pass-1: sepakat → angka final; beda → angka
    // zoom dipakai + ditandai disputed (kuning di UI).
    // ============================================================
    const zoneCanvas = document.createElement("canvas");
    const zctx = zoneCanvas.getContext("2d", { willReadFrequently: true });
    const dataCanvas = document.createElement("canvas");
    const dctx = dataCanvas.getContext("2d", { willReadFrequently: true });

    const grayAt = (x0: number, y0: number, w: number, h: number): Uint8ClampedArray | null => {
      if (!dctx || w < 2 || h < 2 || x0 < 0 || y0 < 0 || x0 + w > width || y0 + h > height) return null;
      dctx.clearRect(0, 0, dataCanvas.width, dataCanvas.height);
      dctx.drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
      const img = dctx.getImageData(0, 0, w, h);
      const g = new Uint8ClampedArray(w * h);
      for (let i = 0; i < w * h; i++) {
        g[i] = (img.data[i * 4] * 299 + img.data[i * 4 + 1] * 587 + img.data[i * 4 + 2] * 114) / 1000;
      }
      return g;
    };

    /** Segmen kolom terang dalam zona (profil kolom) → [start,end] per segmen. */
    const columnSegments = (g: Uint8ClampedArray, w: number, h: number, thr: number): [number, number][] => {
      const prof = new Array<number>(w).fill(0);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y * w + x] > thr) prof[x]++;
      const cols: number[] = [];
      for (let x = 0; x < w; x++) if (prof[x] >= 1) cols.push(x);
      if (!cols.length) return [];
      const segs: [number, number][] = [];
      let start = cols[0];
      let prev = cols[0];
      for (const c of cols.slice(1)) {
        if (c - prev > 3) { segs.push([start, prev]); start = c; }
        prev = c;
      }
      segs.push([start, prev]);
      return segs.filter(([s, e]) => e - s >= 1);
    };

    /** recognize helper async pada zoneCanvas saat ini. */
    const recognizeZone = async (psm: string, whitelist: string | null): Promise<{ text: string; conf: number }> => {
      await worker.setParameters({
        tessedit_pageseg_mode: psm as never,
        ...(whitelist ? { tessedit_char_whitelist: whitelist } : {}),
      });
      const { data } = await worker.recognize(zoneCanvas);
      const txt = String(data.text ?? "").trim();
      let conf = 0;
      const ws = ((data as unknown as { words?: { confidence?: number }[] }).words ?? []);
      if (ws.length) conf = ws.reduce((a, w) => a + (w.confidence ?? 0), 0) / ws.length;
      return { text: txt, conf };
    };

    /** Zoom digit: normal + invert, ambil bacaan conf tertinggi yang valid. */
    const zoomDigitAsync = async (rect: { x0: number; y0: number; x1: number; y1: number }): Promise<{ v: number; conf: number } | null> => {
      if (!zctx) return null;
      const w = rect.x1 - rect.x0;
      const h = rect.y1 - rect.y0;
      if (w < 3 || h < 5) return null;
      const S = Math.min(10, Math.max(4, Math.round(160 / h)));
      zoneCanvas.width = w * S;
      zoneCanvas.height = h * S;
      let best: { v: number; conf: number } | null = null;
      for (const invert of [true, false]) {
        zctx.save();
        zctx.imageSmoothingEnabled = true;
        zctx.imageSmoothingQuality = "high";
        if (invert) zctx.filter = "invert(1)";
        zctx.drawImage(canvas, rect.x0, rect.y0, w, h, 0, 0, zoneCanvas.width, zoneCanvas.height);
        zctx.restore();
        for (const psm of ["7", "8"]) {
          try {
            const { text, conf } = await recognizeZone(psm, "0123456789");
            const d = text.replace(/\D/g, "");
            if (!d) continue;
            const v = Number(d.slice(0, 2));
            if (v >= 0 && v <= 30 && (!best || conf > best.conf)) best = { v, conf };
          } catch { /* satu psm gagal — lanjut */ }
        }
      }
      await worker.setParameters({ tessedit_char_whitelist: "" });
      return best;
    };

    /** OCR teks sel utuh (nama + kill) → {name, kills}. */
    const LETTER_TO_DIGIT: Record<string, string> = { O: "0", D: "0", Q: "0", I: "1", l: "1", i: "1", "|": "1", L: "1", Z: "2", z: "2", A: "4", S: "5", s: "5", b: "6", B: "8", g: "9", q: "9" };
    const zoomCellText = async (rect: { x0: number; y0: number; x1: number; y1: number }): Promise<{ name: string; kills: number | null } | null> => {
      if (!zctx) return null;
      const w = rect.x1 - rect.x0;
      const h = rect.y1 - rect.y0;
      if (w < 12 || h < 8) return null;
      const S = 3;
      zoneCanvas.width = w * S;
      zoneCanvas.height = h * S;
      zctx.imageSmoothingEnabled = true;
      zctx.imageSmoothingQuality = "high";
      zctx.clearRect(0, 0, zoneCanvas.width, zoneCanvas.height);
      zctx.drawImage(canvas, rect.x0, rect.y0, w, h, 0, 0, zoneCanvas.width, zoneCanvas.height);
      try {
        const { text } = await recognizeZone("7", null);
        const t = text.replace(/\s+/g, " ").trim();
        if (!t) return null;
        const re = /([0-9OoDdQqIiLlZzAaSsBbgq|])[ \t]*[KkGg][AaEeIiLl1|!]{0,4}/g;
        let m: RegExpExecArray | null;
        let last: RegExpExecArray | null = null;
        while ((m = re.exec(t))) last = m;
        if (last) {
          let d = last[1];
          if (!/[0-9]/.test(d)) d = LETTER_TO_DIGIT[d] ?? "";
          if (d && /[0-9]/.test(d)) {
            const name = t.slice(0, last.index).replace(/[|!.,;:'"^~`_-]+$/, "").trim();
            return { name: name.slice(0, 40), kills: Number(d) };
          }
        }
        const digits = [...t.matchAll(/(?:^|\s)(\d{1,2})(?:$|\s)/g)];
        if (digits.length) {
          const v = Number(digits[digits.length - 1][1]);
          if (v >= 0 && v <= 30) {
            const name = t.replace(digits[digits.length - 1][0], " ").trim();
            return { name: name.slice(0, 40), kills: v };
          }
        }
        return { name: t.slice(0, 40), kills: null };
      } catch {
        return null;
      }
    };

    const targets = blocks.filter((b) => b.grid);
    if (targets.length) {
      const totalSel = targets.reduce((a, t) => a + 4, 0);
      let done = 0;
      report(`Zoom per sel untuk akurasi angka (${totalSel} sel)…`);
      for (const b of targets) {
        const zones = computeCellZones(b.grid!);
        const merged: ParsedMember[] = [];
        for (let i = 0; i < 4; i++) {
          const z = zones[i];
          const pass1 = b.members[i] ?? null;
          // (1) analisis piksel zona kill → segmen digit sebelum kata Kill
          let pixelRect: { x0: number; y0: number; x1: number; y1: number } | null = null;
          if (zctx) {
            const kx0 = z.killX0;
            const g = grayAt(kx0, z.y0 + 1, z.x1 - kx0, z.y1 - z.y0 - 2);
            if (g) {
              const zw = z.x1 - kx0;
              const zh = z.y1 - z.y0 - 2;
              // pita baris teks
              let ya = 0, yb = zh;
              {
                const rp = new Array<number>(zh).fill(0);
                for (let y = 0; y < zh; y++) for (let x = 0; x < zw; x++) if (g[y * zw + x] > 100) rp[y]++;
                const rowsOn: number[] = [];
                for (let y = 0; y < zh; y++) if (rp[y] >= 1) rowsOn.push(y);
                if (rowsOn.length >= 3) { ya = rowsOn[0]; yb = rowsOn[rowsOn.length - 1] + 1; }
              }
              const bandG = g.subarray(ya * zw, yb * zw);
              const segs = columnSegments(bandG as unknown as Uint8ClampedArray, zw, yb - ya, 100);
              if (segs.length >= 2) {
                const [s, e] = segs[segs.length - 2];
                if (segs[segs.length - 1][0] - e <= Math.max(30, (z.x1 - z.x0) * 0.5)) {
                  pixelRect = { x0: kx0 + s - 2, y0: z.y0 + 1 + ya - 1, x1: kx0 + e + 2, y1: z.y0 + 1 + yb + 1 };
                }
              } else if (segs.length === 1) {
                const [s, e] = segs[0];
                if (e - s <= 26) pixelRect = { x0: kx0 + s - 2, y0: z.y0 + 1 + ya - 1, x1: kx0 + e + 2, y1: z.y0 + 1 + yb + 1 };
              }
            }
          }
          const pixel = pixelRect ? await zoomDigitAsync(pixelRect) : null;
          // (2) OCR teks sel utuh → digit terakhir sebelum Kill + nama
          const cell = await zoomCellText({ x0: z.x0, y0: z.y0 + 1, x1: z.x1, y1: z.y1 - 1 });
          done++;
          if (done % 8 === 0) report(`Zoom per sel (${done}/${totalSel})…`);
          // (3) gabungkan sumber
          let kills: number | null = pass1?.kills ?? null;
          let disputed = false;
          let recovered = pass1?.recovered ?? false;
          if (pixel && pixel.conf >= 55) {
            if (kills != null && kills !== pixel.v) disputed = true;
            kills = pixel.v;
            recovered = true;
          }
          if (cell?.kills != null) {
            if (kills == null) { kills = cell.kills; recovered = true; }
            else if (kills !== cell.kills) {
              if (pixel && pixel.conf >= 55) disputed = true; // pixel vs cell beda → tetap pixel
              else { kills = cell.kills; disputed = true; recovered = true; }
            }
          }
          const name = (pass1?.name && pass1.name !== "(tak terbaca)" ? pass1.name : cell?.name?.trim()) || pass1?.name || "";
          merged.push({
            name: name || "(tak terbaca)",
            kills,
            recovered,
            disputed,
          });
        }
        b.members = merged;
      }
    }
  } finally {
    await worker.terminate().catch(() => {});
  }

  if (blocks.length < 2) {
    // FALLBACK OTOMATIS — browser tak mengenali papan skor; coba mesin
    // server (pipeline penuh atas link ImgBB) sebelum menyerah.
    if (imageUrl && /^https:\/\//i.test(imageUrl)) {
      report("Browser sulit membaca layar ini — mencoba mesin server…");
      return await analyzeScreenshot(imageUrl, teams);
    }
    throw new Error(
      "Layar tidak dikenali sebagai papan skor Free Fire (blok placement tidak ditemukan). " +
        "Gunakan screenshot layar hasil/klasemen akhir.",
    );
  }

  report(`Menghitung & mencocokkan tim (${blocks.length} blok)…`);
  // Registry untuk AI: hanya data yang membantu identifikasi tim.
  const registry = teams.map((t) => ({
    id: t.id,
    name: t.name,
    tag: t.tag ?? "",
    captain: t.captain ?? "",
    roster: (t.roster ?? []).map((r) => ({ nickname: r.nickname })),
    ocrAliases: t.ocrAliases ?? [],
  }));
  const settings = await loadOcrSettings();
  const res = await fetch("/api/ai/ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks, teams: registry, settings }),
    signal: AbortSignal.timeout(45_000),
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

/**
 * Perkaya MEMORI tim: nama mentah dari screenshot yang terbukti milik
 * tim ini disimpan sebagai alias → screenshot berikutnya otomatis cocok.
 */
export async function addOcrAlias(tid: string, teamId: string, rawName: string) {
  if (!db || !rawName) return;
  const database = db; // simpan referensi agar TS tidak kehilangan narrowing
  const key = normalizeTeamKey(rawName);
  if (!key) return;
  const t = await import("firebase/firestore").then((m) => m.getDoc(doc(database, `tournaments/${tid}/teams/${teamId}`)));
  if (!t.exists()) return;
  const aliases: string[] = t.data().ocrAliases ?? [];
  const duplikat = aliases.some((a) => normalizeTeamKey(a) === key);
  if (duplikat) return;
  await updateDoc(doc(db, `tournaments/${tid}/teams/${teamId}`), {
    ocrAliases: arrayUnion(rawName.trim().slice(0, 64)),
    updatedAt: serverTimestamp(),
  });
}
