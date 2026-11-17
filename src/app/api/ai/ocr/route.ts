import { NextRequest, NextResponse } from "next/server";

// ============================================================
// BOF — POST /api/ai/ocr  ·  ENDPOINT OCR SCREENSHOT FREE FIRE
//
// OCR UTAMA berjalan DI BROWSER admin (lihat src/services/ocr/client.ts
// + src/lib/ocr-rows.ts) — cepat, tanpa batas waktu lambda, dan sudah
// diverifikasi akurat pada screenshot asli (10 tim terbaca, top 1 =
// 3+6+5+5 = 19). Route ini hanya FALLBACK: menerima link gambar
// (ImgBB) bila browser gagal, menjalankan pipeline yang sama di
// server (tesseract + parser kill-anchored + rescue digit).
//
// HASIL = { rank, total kill } per blok placement — TANPA nama pemain
// (permintaan admin). Pencocokan tim terdaftar dilakukan manual lewat
// dropdown di panel hasil OCR.
//
// MESIN & KONFIGURASI:
//   - .env hanya berisi key: JERE_API_KEY (cadangan) + IMGBB_API_KEY.
//   - Endpoint/model diatur dari UI Admin → Pengaturan → AI & OCR.
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 60;

import { runOcrPipeline } from "@/lib/ocr-engine";

/** GET /api/ai/ocr — status kesiapan mesin (tanpa membocorkan key). */
export async function GET() {
  const has = (v?: string) => Boolean(v && v.trim().length > 4);
  return NextResponse.json({
    ok: true,
    keys: {
      jere: has(process.env.JERE_API_KEY || process.env.JEREXD_API_KEY),
      imgbb: has(process.env.IMGBB_API_KEY),
    },
    engine: "tesseract kill-anchored v4 (browser utama, server fallback, recovery per-paruh)",
    modelConfig: "ui:settings/ocr",
  });
}

export async function POST(req: NextRequest) {
  let body: { imageUrl?: string; expectedTeams?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body harus JSON { imageUrl }." }, { status: 400 });
  }
  const imageUrl = String(body.imageUrl ?? "").trim();
  if (!/^https:\/\//i.test(imageUrl)) {
    return NextResponse.json(
      { ok: false, error: "imageUrl wajib berupa link https gambar yang sudah di-upload." },
      { status: 400 },
    );
  }
  const expectedTeams = Number(body.expectedTeams ?? 0);

  try {
    const result = await runOcrPipeline({
      imageUrl,
      expectedTeams: Number.isFinite(expectedTeams) ? expectedTeams : 0,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: String((e as Error).message ?? e).slice(0, 300),
        hint: "Pastikan screenshot adalah layar hasil/klasemen akhir Free Fire. OCR utama tetap bisa dipakai langsung dari browser admin.",
      },
      { status: 502 },
    );
  }
}
