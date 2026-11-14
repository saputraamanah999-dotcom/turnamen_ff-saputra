import { NextRequest, NextResponse } from "next/server";

// ============================================================
// BOF — POST /api/ai/ocr  ·  ENDPOINT AI OCR SCREENSHOT FREE FIRE
//
// Masalah yang diselesaikan: admin tidak perlu mengetik hasil match
// satu per satu — cukup upload screenshot (layar BOOYAH / skor akhir),
// AI membaca placement + nama tim + kill lalu formulir terisi otomatis.
//
// Rantai mesin (yang pertama tersedia dipakai):
//   1. Gemini (GEMINI_API_KEY)  — gratis, paling akurat utk font FF.
//   2. OpenAI-compatible (OPENAI_API_KEY, boleh OPENAI_BASE_URL).
//   3. OCR.space (OCR_SPACE_KEY, default key uji "helloworld") —
//      tanpa pendaftaran, hasil polos wajib dicek admin (needsReview).
//
// Route ini STATELESS (tidak menyentuh Firestore). Pencocokan nama
// tim → tim terdaftar memakai MEMORI: nama, tag, kapten, roster,
// dan alias ocrAliases yang tersimpan di dokumen tim.
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 60;

import { bestTeamMatch, parseOcrSpaceText, sanitizeOcrRows } from "@/lib/ocr";
import type { OcrRow } from "@/lib/types";

interface RegistryTeam {
  id: string;
  name: string;
  tag?: string;
  captain?: string;
  roster?: { nickname: string }[];
  ocrAliases?: string[];
}

function buildPrompt(teams: RegistryTeam[]): string {
  const daftar = teams.length
    ? teams
        .map((t) => {
          const pemain = (t.roster ?? []).map((r) => r.nickname).filter(Boolean).join(", ");
          const alias = (t.ocrAliases ?? []).filter(Boolean).join(", ");
          return `- id=${t.id} | nama=${t.name}${t.tag ? ` | tag=${t.tag}` : ""}${
            t.captain ? ` | kapten=${t.captain}` : ""
          }${pemain ? ` | pemain=${pemain}` : ""}${alias ? ` | alias=${alias}` : ""}`;
        })
        .join("\n")
    : "(belum ada tim terdaftar)";

  return `Kamu operator resmi turnamen Free Fire (BOF — Battle Off Friends).
Tugas: baca screenshot hasil match Free Fire (layar BOOYAH!, papan skor akhir, atau klasemen) dan ubah menjadi data terstruktur.

DAFTAR TIM TERDAFTAR turnamen ini (id | nama | tag | kapten | pemain | alias):
${daftar}

ATURAN MEMBACA:
1. Untuk setiap TIM pada layar, keluarkan SATU baris: placement/peringkat, nama tim PERSIS seperti tertulis di layar, dan jumlah kill (angka kecil di baris tim). Baca angka sekecil apa pun dengan teliti.
2. Cocokkan nama di layar dengan DAFTAR TIM TERDAFTAR: tulis "teamId" bila yakin itu tim yang sama (sama dengan nama, tag, kapten, pemain, atau mirip — mis. "TEAM REVNGE" = "REVENGE ESPORTS", simbol/hiasan diabaikan, ejaan sedikit beda tetap cocok). Jika tidak ada yang cocok, "teamId": null.
3. Abaikan elemen UI: waktu, ping, mode, nama pemain mvp, tombol, iklan.
4. Jika layar menampilkan daftar PEMAIN per kru, kelompokkan tetap per tim/kru.
5. Bila ada angka tidak terbaca, tulis null — JANGAN menebak.
6. "booyahTeam": nama tim di posisi #1 / teks BOOYAH! (atau null).
7. Balas HANYA JSON tanpa penjelasan, dengan skema:
{"rows":[{"rank":1,"team":"NAMA DI LAYAR","teamId":"id-atau-null","kills":12,"points":30,"confidence":0.95}],"booyahTeam":"NAMA TIM JUARA","notes":"catatan singkat atau null"}
"points" hanya diisi jika angka poin memang tertulis di layar.`;
}

// ---------- Provider 1: Gemini ----------
async function callGemini(apiKey: string, model: string, prompt: string, b64: string, mime: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json", maxOutputTokens: 4096 },
      }),
      signal: AbortSignal.timeout(50_000),
    },
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Gemini: ${String(msg).slice(0, 300)}`);
  }
  const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini mengembalikan jawaban kosong.");
  return text;
}

// ---------- Provider 2: OpenAI-compatible ----------
async function callOpenai(
  apiKey: string,
  model: string,
  baseUrl: string,
  prompt: string,
  b64: string,
  mime: string,
): Promise<string> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(50_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`OpenAI: ${String(msg).slice(0, 300)}`);
  }
  const text = json?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("OpenAI mengembalikan jawaban kosong.");
  return text;
}

// ---------- Provider 3: OCR.space (fallback tanpa key AI) ----------
async function callOcrSpace(apiKey: string, b64: string, mime: string): Promise<string> {
  const form = new FormData();
  form.append("apikey", apiKey);
  form.append("base64Image", `data:${mime};base64,${b64}`);
  form.append("OCREngine", "2");
  form.append("scale", "true");
  form.append("isTable", "false");
  const res = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(45_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.IsErroredOnProcessing) {
    const msg = Array.isArray(json?.ErrorMessage) ? json.ErrorMessage[0] : json?.ErrorMessage ?? `HTTP ${res.status}`;
    throw new Error(`OCR.space: ${String(msg).slice(0, 300)}`);
  }
  return String(json?.ParsedResults?.[0]?.ParsedText ?? "");
}

/** Validasi ulang teamId dari AI + fallback pencocokan lokal. */
function resolveRows(rows: OcrRow[], teams: RegistryTeam[]): OcrRow[] {
  const byId = new Map(teams.map((t) => [t.id, t]));
  return rows.map((r) => {
    let teamId = r.teamId && byId.has(r.teamId) ? r.teamId : null;
    let teamName = teamId ? (byId.get(teamId)?.name ?? null) : r.teamName ?? null;
    let score = teamId ? 1 : 0;
    if (!teamId && r.teamRaw) {
      const m = bestTeamMatch(r.teamRaw, teams as never);
      if (m) {
        teamId = m.teamId;
        teamName = m.teamName;
        score = m.score;
      }
    }
    return { ...r, teamId, teamName, confidence: Math.min(r.confidence ?? 0.5, score || (r.confidence ?? 0.5)) };
  });
}

export async function POST(req: NextRequest) {
  let body: { imageUrl?: string; teams?: RegistryTeam[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body harus JSON { imageUrl, teams }." }, { status: 400 });
  }
  const imageUrl = String(body.imageUrl ?? "").trim();
  const teams = Array.isArray(body.teams) ? body.teams.slice(0, 60) : [];
  if (!/^https:\/\//i.test(imageUrl)) {
    return NextResponse.json(
      { ok: false, error: "imageUrl wajib berupa link https gambar yang sudah di-upload." },
      { status: 400 },
    );
  }

  // Ambil gambar satu kali untuk semua provider.
  let bytes: Buffer;
  let mime = "image/png";
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
    if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    if (buf.length < 64) throw new Error("berkas terlalu kecil");
    if (buf.length > 16 * 1024 * 1024) throw new Error("berkas > 16 MB");
    bytes = buf;
    mime = imgRes.headers.get("content-type")?.split(";")[0] ?? "image/png";
    if (!mime.startsWith("image/")) mime = "image/png";
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Gagal mengunduh gambar: ${String((e as Error).message ?? e).slice(0, 200)}` },
      { status: 400 },
    );
  }
  const b64 = bytes.toString("base64");
  const prompt = buildPrompt(teams);

  const providers: { name: string; run: () => Promise<string>; needsReview?: boolean }[] = [];
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (geminiKey) {
    const model = process.env.AI_OCR_MODEL || "gemini-2.0-flash";
    providers.push({ name: "gemini", run: () => callGemini(geminiKey, model, prompt, b64, mime) });
  }
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const base = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    providers.push({ name: "openai", run: () => callOpenai(openaiKey, model, base, prompt, b64, mime) });
  }
  providers.push({
    name: "ocrspace",
    needsReview: true,
    run: () => callOcrSpace(process.env.OCR_SPACE_KEY || "helloworld", b64, mime),
  });

  const errors: string[] = [];
  for (const p of providers) {
    try {
      const text = await p.run();
      if (p.name === "ocrspace") {
        // Teks polos → parser heuristik + pencocokan tim lokal.
        const rows = parseOcrSpaceText(text);
        const resolved = resolveRows(rows, teams);
        return NextResponse.json({
          ok: true,
          source: "ocrspace",
          needsReview: true,
          booyahTeam: resolved.find((r) => r.rank === 1)?.teamRaw ?? null,
          rows: resolved,
          notes:
            "Hasil OCR polos (tanpa AI vision). Periksa & koreksi setiap baris sebelum diterapkan. " +
            "Untuk akurasi penuh, isi GEMINI_API_KEY (gratis) di environment Vercel.",
        });
      }
      // Model AI → JSON ketat (buang pagar markdown bila ada).
      const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      const obj = parsed as Record<string, unknown>;
      let rows = sanitizeOcrRows(obj.rows ?? obj.data ?? obj.results);
      if (!rows.length) throw new Error("AI tidak menemukan baris tim — pastikan screenshot layar skor/BOOYAH.");
      rows = resolveRows(rows, teams);
      const booyahRaw = typeof obj.booyahTeam === "string" ? obj.booyahTeam : null;
      // BOOYAH = rank 1 bila AI tidak menuliskannya.
      const booyah = booyahRaw ?? rows.find((r) => r.rank === 1)?.teamRaw ?? null;
      return NextResponse.json({
        ok: true,
        source: p.name,
        needsReview: false,
        booyahTeam: booyah,
        rows,
        notes: typeof obj.notes === "string" ? obj.notes.slice(0, 400) : null,
      });
    } catch (e) {
      errors.push(`${p.name}: ${String((e as Error).message ?? e).slice(0, 220)}`);
    }
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Semua mesin analisa gagal. Detail tiap mesin ada di 'detail'.",
      detail: errors,
      hint:
        "Bila GEMINI_API_KEY belum diisi, fitur memakai OCR polos yang sering salah. " +
        "Ambil key gratis di aistudio.google.com/apikey lalu tambahkan di Vercel → Settings → Environment Variables.",
    },
    { status: 502 },
  );
}
