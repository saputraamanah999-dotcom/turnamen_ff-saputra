import { NextRequest, NextResponse } from "next/server";

// ============================================================
// BOF — POST /api/ai/ocr  ·  ENDPOINT AI OCR SCREENSHOT FREE FIRE
//
// Masalah yang diselesaikan: admin tidak perlu mengetik hasil match
// satu per satu — cukup upload screenshot (layar BOOYAH / skor akhir),
// AI membaca placement + pemain + kill lalu formulir terisi otomatis.
//
// ATURAN HITUNG (fix utama): 1 blok placement (top #) = 1 tim berisi
// sampai 4 PEMAIN; KILL TIM = PENJUMLAHAN kill semua anggota blok
// (dihitung total, bukan 1 orang). Penjumlahan dilakukan ulang di
// server dari rincian per pemain — angka Kill masuk ke kolom KILLS,
// nomor blok masuk ke PLACEMENT.
//
// MESIN & KONFIGURASI:
//   - API key disimpan di environment HANYA sebagai key: JERE_API_KEY
//     (Jerexd, utama & gratis), GEMINI_API_KEY/OPENAI_API_KEY (opsional),
//     OCR_SPACE_KEY (opsional).
//   - Pilihan MODEL dan ON/OFF fallback OCR.space diatur dari UI
//     Admin → Pengaturan → AI & OCR (dokumen Firestore settings/ocr)
//     dan dikirim klien pada body "settings" — BUKAN lewat .env.
//
// Route ini STATELESS (tidak menyentuh Firestore). Pencocokan nama
// tim → tim terdaftar memakai MEMORI: nama, tag, kapten, roster
// (nama pemain), dan alias ocrAliases pada dokumen tim.
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 60;

import { analyzeBlocks, runOcrPipeline, type OcrEngineSettings, type RegistryTeam } from "@/lib/ocr-engine";

/** GET /api/ai/ocr — status kesiapan mesin (tanpa pernah membocorkan nilai key). */
export async function GET() {
  const has = (v?: string) => Boolean(v && v.trim().length > 4);
  return NextResponse.json({
    ok: true,
    keys: {
      jere: has(process.env.JERE_API_KEY || process.env.JEREXD_API_KEY),
      imgbb: has(process.env.IMGBB_API_KEY),
      gemini: has(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY),
      openai: has(process.env.OPENAI_API_KEY),
      ocrSpace: has(process.env.OCR_SPACE_KEY || process.env.OCRSPACE_API_KEY),
    },
    engine: "jere-vision-v2+v1+aichat",
    modelConfig: "ui:settings/ocr",
  });
}

export async function POST(req: NextRequest) {
  let body: {
    imageUrl?: string;
    teams?: RegistryTeam[];
    settings?: OcrEngineSettings;
    blocks?: { rank: number; members: { name: string; kills: number | null }[] }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body harus JSON { imageUrl, teams, settings? } atau { blocks, teams }." }, { status: 400 });
  }
  const teams = Array.isArray(body.teams) ? body.teams.slice(0, 60) : [];
  const settings: OcrEngineSettings = {
    jereVisionModel: typeof body.settings?.jereVisionModel === "string" ? body.settings.jereVisionModel.slice(0, 80) : "",
    jereTextModel: typeof body.settings?.jereTextModel === "string" ? body.settings.jereTextModel.slice(0, 80) : "",
    ocrSpaceEnabled: body.settings?.ocrSpaceEnabled === true,
  };

  // MODE UTAMA — OCR dijalankan di BROWSER admin; server menerima blok
  // placement siap-pakai (cepat, bebas batas waktu lambda).
  if (Array.isArray(body.blocks) && body.blocks.length) {
    try {
      const result = await analyzeBlocks({ blocks: body.blocks, teams, settings, jereApiKey: process.env.JERE_API_KEY || process.env.JEREXD_API_KEY || "" });
      return NextResponse.json(result);
    } catch (e) {
      return NextResponse.json({ ok: false, error: String((e as Error).message ?? e).slice(0, 300) }, { status: 400 });
    }
  }

  // MODE CADANGAN — server menerima link gambar dan menjalankan mesin penuh.
  const imageUrl = String(body.imageUrl ?? "").trim();
  if (!/^https:\/\//i.test(imageUrl)) {
    return NextResponse.json(
      { ok: false, error: "imageUrl wajib berupa link https gambar yang sudah di-upload (atau kirim blocks dari OCR browser)." },
      { status: 400 },
    );
  }

  try {
    const result = await runOcrPipeline({
      imageUrl,
      teams,
      settings,
      jereApiKey: process.env.JERE_API_KEY || process.env.JEREXD_API_KEY || "",
      geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "",
      openaiApiKey: process.env.OPENAI_API_KEY || "",
      ocrSpaceKey: process.env.OCR_SPACE_KEY || process.env.OCRSPACE_API_KEY || "",
    });
    return NextResponse.json(result);
  } catch (e) {
    const err = e as Error & { detail?: string[]; tried?: string[] };
    return NextResponse.json(
      {
        ok: false,
        error: String(err.message ?? err).slice(0, 300),
        detail: err.detail ?? undefined,
        tried: err.tried ?? undefined,
        hint:
          "Pastikan JERE_API_KEY terisi di Vercel → Settings → Environment Variables. " +
          "Model & fallback OCR.space diatur dari Admin → Pengaturan → AI & OCR.",
      },
      { status: 502 },
    );
  }
}
