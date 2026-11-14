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
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { normalizeTeamKey } from "@/lib/ocr";
import type { OcrAnalysis, OcrRow, OcrUpload, Team } from "@/lib/types";

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
  const res = await fetch("/api/ai/ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl, teams: registry }),
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
