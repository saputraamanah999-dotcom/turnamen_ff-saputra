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
import type { OcrWord } from "@/lib/ocr-blocks";
import type { OcrAnalysis, OcrRow, OcrUpload, Team } from "@/lib/types";

// ---------- Pengaturan mesin AI OCR (disimpan di Firestore settings/ocr) ----------
// Prinsip: .env hanya berisi API KEY. Model & fallback diatur dari UI Admin.
export interface OcrSettings {
  /** Model vision jerexd (kosong = default server jerexd). */
  jereVisionModel: string;
  /** Model teks jerexd (aichat) untuk penstrukturan JSON. */
  jereTextModel: string;
  /** Aktifkan fallback OCR polos OCR.space bila AI gagal. */
  ocrSpaceEnabled: boolean;
}

export const OCR_SETTINGS_DEFAULT: OcrSettings = {
  jereVisionModel: "",
  jereTextModel: "google/gemini-3.1-flash-lite",
  ocrSpaceEnabled: false,
};

/** Baca pengaturan AI OCR dari dokumen settings/ocr (fallback: nilai bawaan). */
export async function loadOcrSettings(): Promise<OcrSettings> {
  if (!db) return { ...OCR_SETTINGS_DEFAULT };
  try {
    const snap = await getDoc(doc(db, "settings", "ocr"));
    if (!snap.exists()) return { ...OCR_SETTINGS_DEFAULT };
    const d = snap.data() as Partial<OcrSettings>;
    return {
      jereVisionModel: String(d.jereVisionModel ?? "").slice(0, 80),
      jereTextModel: String(d.jereTextModel ?? OCR_SETTINGS_DEFAULT.jereTextModel).slice(0, 80),
      ocrSpaceEnabled: d.ocrSpaceEnabled === true,
    };
  } catch {
    return { ...OCR_SETTINGS_DEFAULT };
  }
}

/** Simpan pengaturan AI OCR (dipakai halaman Admin → Pengaturan → AI & OCR). */
export async function saveOcrSettings(s: OcrSettings): Promise<void> {
  if (!db) throw new Error("Firebase belum terhubung.");
  await setDoc(doc(db, "settings", "ocr"), {
    jereVisionModel: s.jereVisionModel.trim().slice(0, 80),
    jereTextModel: s.jereTextModel.trim().slice(0, 80) || OCR_SETTINGS_DEFAULT.jereTextModel,
    ocrSpaceEnabled: s.ocrSpaceEnabled === true,
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
 * blok placement (lib bersama src/lib/ocr-blocks.ts) → recovery re-OCR
 * whitelist digit → kirim BLOK ke /api/ai/ocr → server menghitung total
 * (penjumlahan kill per blok), memperbaiki nama via aichat (bila key ada),
 * mencocokkan tim terdaftar → baris siap dipakai formulir.
 */
export async function analyzeScreenshotClient(
  file: File,
  teams: Team[],
  onProgress?: (note: string) => void,
): Promise<OcrAnalysis> {
  const { createWorker } = await import("tesseract.js");
  const { parseWordBoxesToBlocks } = await import("@/lib/ocr-blocks");

  const report = (s: string) => onProgress?.(s);

  // Downscale di browser: OCR 1600px akurat & jauh lebih cepat.
  report("Menyiapkan gambar…");
  const bitmap = await createImageBitmap(file);
  let width = bitmap.width;
  let height = bitmap.height;
  let source: ImageBitmapSource = bitmap;
  if (width > 1600) {
    const scale = 1600 / width;
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    source = canvas;
    width = canvas.width;
    height = canvas.height;
  }

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

  // Tesseract.js browser menerima string (URL/data-URL) — canvas dikonversi
  // agar tipe ImageLike terpenuhi di semua pass.
  const imageLike: string = typeof source === "string"
    ? (source as string)
    : (source as HTMLCanvasElement).toDataURL("image/jpeg", 0.92);

  const worker = await createWorker("eng", 1, { logger: () => {} });
  let words: OcrWord[] = [];
  let blocks: ReturnType<typeof parseWordBoxesToBlocks> = [];
  try {
    report("Membaca layar skor (pass 1/2)…");
    await worker.setParameters({ tessedit_pageseg_mode: "6" as never });
    const main = toWords((await worker.recognize(imageLike)).data ?? {});
    words = main;
    blocks = parseWordBoxesToBlocks(words, width, height);

    if (main.length < 60) {
      report("Membaca lebih teliti (pass 2/2)…");
      await worker.setParameters({ tessedit_pageseg_mode: "11" as never });
      const sparse = toWords((await worker.recognize(imageLike)).data ?? {});
      // Gabungkan kata sparse yang tidak tabrakan posisi dengan pass utama.
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
    }

    // RECOVERY — re-OCR area kill yang gagal terbaca (whitelist digit).
    const targets = blocks.flatMap((b) => b.members.filter((m) => m.kills == null && m.killHint));
    if (targets.length) {
      report(`Memulihkan angka kill yang buram (${targets.length})…`);
      await worker.setParameters({ tessedit_pageseg_mode: "7" as never, tessedit_char_whitelist: "0123456789" });
      for (const m of targets.slice(0, 20)) {
        const r = m.killHint!;
        try {
          const rect = { left: r.x, top: r.y, width: r.w, height: r.h };
          const { data } = await worker.recognize(imageLike, { rectangle: rect });
          const teks = String(data.text ?? "").trim();
          if (r.kind === "zone") {
            if (/^\d$/.test(teks)) { m.kills = Number(teks); m.recovered = true; }
          } else {
            const digits = teks.match(/\d{1,2}/);
            if (digits) {
              const n = Number(digits[0]);
              if (n >= 0 && n <= 23) { m.kills = n; m.recovered = true; }
            }
          }
        } catch {
          // satu area gagal — lanjut
        }
      }
      // Nama tidak diubah di sini — server yang memperbaiki via AI (bila key ada).
    }
  } finally {
    await worker.terminate().catch(() => {});
  }

  if (blocks.length < 2) {
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
