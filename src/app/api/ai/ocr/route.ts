import { NextRequest, NextResponse } from "next/server";

// ============================================================
// BOF — POST /api/ai/ocr  ·  ENDPOINT AI OCR SCREENSHOT FREE FIRE
//
// Masalah yang diselesaikan: admin tidak perlu mengetik hasil match
// satu per satu — cukup upload screenshot (layar BOOYAH / skor akhir),
// AI membaca placement + nama tim + kill lalu formulir terisi otomatis.
//
// Rantai mesin (yang pertama tersedia dipakai — urutan bisa dipaksa
// lewat env AI_OCR_PROVIDER = jere | gemini | openai | ocrspace):
//   1. Gemini (GEMINI_API_KEY)  — gratis, paling akurat utk font FF.
//   2. OpenAI-compatible (OPENAI_API_KEY, boleh OPENAI_BASE_URL) —
//      bisa dipakai untuk endpoint Z.AI/GLM atau lainnya yang
//      kompatibel OpenAI vision.
//   3. Jerexd Vision (JERE_API_KEY) — GRATIS, UTAMA BOF, 3 langkah:
//      a. chatvision-v2 (kirim LINK ImgBB) → bila JSON tidak terbentuk →
//      b. chatvision v1 (upload file, model gemini) → bila masih deskripsi →
//      c. aichat (teks gratis) menstrukturkan hasil bacaan menjadi JSON.
//      Terbukti uji fixture: 6 baris rank/nama/kill terbaca akurat.
//   4. OCR.space (OCR_SPACE_KEY atau OCRSPACE_API_KEY, default key
//      uji "helloworld") — tanpa pendaftaran, hasil polos wajib
//      dicek admin (needsReview).
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

// ---------- Provider 2: OpenAI-compatible (juga untuk Z.AI/GLM dll.) ----------
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

// ---------- Provider 3: Jerexd Vision (gratis, via URL gambar) ----------
// Endpoint: POST https://api.jerexd.my.id/api/ai/chatvision-v2?apikey=KEY
// Body: application/x-www-form-urlencoded (url=<link> & prompt=<instruksi>)
//       — endpoint ini TIDAK menerima multipart/form-data.
// Respon: { status: true, data: { answer }, result } — answer/result = teks.
async function callJerexd(
  apiKey: string,
  imageUrl: string,
  prompt: string,
  model?: string,
): Promise<string> {
  const params = new URLSearchParams();
  params.set("url", imageUrl);
  params.set("prompt", prompt);
  if (model && model !== "default") params.set("model", model);
  const res = await fetch(`https://api.jerexd.my.id/api/ai/chatvision-v2?apikey=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(25_000),
  });
  const raw = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Bukan JSON (mis. halaman error teks/HTML) — lempar dengan cuplikan isinya.
    throw new Error(`Jerexd: respon bukan JSON (HTTP ${res.status}): ${raw.slice(0, 120)}`);
  }
  if (!res.ok || json?.status === false || (typeof json?.statusCode === "number" && json.statusCode >= 400)) {
    const msg = json?.message ?? json?.error ?? `HTTP ${res.status}`;
    throw new Error(`Jerexd: ${String(msg).slice(0, 300)}`);
  }
  const data = json?.data as { answer?: string } | undefined;
  const result = json?.result as string | { answer?: string } | undefined;
  const text = String(data?.answer ?? (typeof result === "string" ? result : result?.answer) ?? "").trim();
  if (!text) throw new Error("Jerexd mengembalikan jawaban kosong.");
  return text;
}

/** Jerexd chatvision v1 — upload FILE langsung (multipart), pilihan model gemini/gpt. */
async function callJerexdV1(apiKey: string, b64: string, mime: string, prompt: string, model?: string): Promise<string> {
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("model", model || "gemini");
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const bytes = Buffer.from(b64, "base64");
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), `screenshot.${ext}`);
  const res = await fetch(`https://api.jerexd.my.id/api/ai/chatvision?apikey=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(25_000),
  });
  const raw = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`JerexdV1: respon bukan JSON (HTTP ${res.status}): ${raw.slice(0, 120)}`);
  }
  if (!res.ok || json?.status === false || (typeof json?.statusCode === "number" && json.statusCode >= 400)) {
    const msg = json?.message ?? json?.error ?? `HTTP ${res.status}`;
    throw new Error(`JerexdV1: ${String(msg).slice(0, 300)}`);
  }
  const data = json?.data as { answer?: string } | undefined;
  const result = json?.result as string | { answer?: string } | undefined;
  const text = String(data?.answer ?? (typeof result === "string" ? result : result?.answer) ?? "").trim();
  if (!text) throw new Error("JerexdV1 mengembalikan jawaban kosong.");
  return text;
}

// ---------- Jerexd langkah 2: aichat (teks, gratis) — strukturkan hasil bacaan ----------
// Endpoint vision jerexd (v1/v2) kerap membalas deskripsi berisi SEMUA data
// ("1 TEAM X (12 kills), 2 TEAM Y (9 kills), ...") tetapi tidak dalam JSON.
// Langkah ini mengubah teks bacaan itu menjadi JSON skema tetap via aichat.
async function callJerexdStruct(
  apiKey: string,
  caption: string,
  teams: RegistryTeam[],
): Promise<string> {
  const daftar = teams.length
    ? teams.map((t) => `- ${t.name}${t.tag ? ` (tag ${t.tag})` : ""}${t.captain ? `, kapten ${t.captain}` : ""}`).join("; ")
    : "(belum ada tim terdaftar)";
  const prompt = `Kamu asisten data turnamen Free Fire (BOF). Ubah teks hasil bacaan OCR screenshot papan skor berikut menjadi JSON murni.
Skema: {"rows":[{"rank":1,"team":"NAMA DI LAYAR","kills":12}],"booyahTeam":"NAMA TIM RANK 1","notes":null}
Aturan: satu baris per tim; rank = placement; kills = angka kill; nama tim PERSIS seperti di teks; bila ada daftar tim resmi berikut, gunakan untuk koreksi ejaan: ${daftar}.
TEKS HASIL BACAAN OCR:
"""
${caption.slice(0, 3500)}
"""
Balas HANYA JSON tanpa penjelasan.`;
  const params = new URLSearchParams();
  params.set("model", process.env.JERE_TEXT_MODEL || "google/gemini-3.1-flash-lite");
  params.set("prompt", prompt);
  const res = await fetch(`https://api.jerexd.my.id/api/ai/aichat?apikey=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`JerexdStruct: respon bukan JSON (HTTP ${res.status}): ${raw.slice(0, 120)}`);
  }
  if (!res.ok || json?.status === false || (typeof json?.statusCode === "number" && json.statusCode >= 400)) {
    const msg = json?.message ?? json?.error ?? `HTTP ${res.status}`;
    throw new Error(`JerexdStruct: ${String(msg).slice(0, 300)}`);
  }
  const data = json?.data as { answer?: string } | undefined;
  const result = json?.result as string | { answer?: string } | undefined;
  const text = String(data?.answer ?? (typeof result === "string" ? result : result?.answer) ?? "").trim();
  if (!text) throw new Error("JerexdStruct mengembalikan jawaban kosong.");
  return text;
}

/** True bila teks memuat JSON dengan array "rows" berisi minimal 1 baris. */
function hasRowsJson(text: string): boolean {
  try {
    const obj = JSON.parse(extractJson(text)) as { rows?: unknown };
    return Array.isArray(obj.rows) && obj.rows.length > 0;
  } catch {
    return false;
  }
}

// ---------- Provider 4: OCR.space (fallback tanpa key AI) ----------
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

/**
 * Ekstrak objek JSON dari jawaban AI — beberapa model menambah kalimat
 * pembuka/penutup atau pagar markdown. Ambil blok {..} paling luar.
 */
function extractJson(text: string): string {
  const cleaned = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return cleaned;
  return cleaned.slice(start, end + 1);
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
  const jereKey = process.env.JERE_API_KEY || process.env.JEREXD_API_KEY;
  if (jereKey) {
    const model = process.env.JERE_MODEL || "default";
    providers.push({
      name: "jere",
      run: async () => {
        const catatan: string[] = [];
        // Jalankan KEDUA vision endpoint PARALEL (server jerexd kadang lambat;
        // paralel memotong waktu tunggu ±setengah). Batas per panggilan 25s.
        const [r2, r1] = await Promise.allSettled([
          callJerexd(jereKey, imageUrl, prompt, model),
          callJerexdV1(jereKey, b64, mime, prompt, "gemini"),
        ]);
        let caption = "";
        if (r2.status === "fulfilled") {
          if (hasRowsJson(r2.value)) return r2.value;
          caption = r2.value;
          catatan.push("v2: balasan deskripsi, bukan JSON");
        } else {
          catatan.push(`v2: ${String((r2.reason as Error)?.message ?? r2.reason).slice(0, 140)}`);
        }
        if (r1.status === "fulfilled") {
          if (hasRowsJson(r1.value)) return r1.value;
          if (r1.value.length > caption.length) caption = r1.value;
          catatan.push("v1: balasan deskripsi, bukan JSON");
        } else {
          catatan.push(`v1: ${String((r1.reason as Error)?.message ?? r1.reason).slice(0, 140)}`);
        }
        if (!caption) throw new Error(catatan.join(" | ") || "Jerexd kosong");
        // 3) Strukturkan teks bacaan via aichat (gratis, ±3 detik) — JSON skema tetap.
        const structured = await callJerexdStruct(jereKey, caption, teams);
        if (!hasRowsJson(structured)) {
          throw new Error(`Jerexd: ${catatan.join(" | ")} | structuring gagal: ${structured.slice(0, 100)}`);
        }
        return structured;
      },
    });
  }
  providers.push({
    name: "ocrspace",
    needsReview: true,
    run: () => callOcrSpace(process.env.OCR_SPACE_KEY || process.env.OCRSPACE_API_KEY || "helloworld", b64, mime),
  });

  // AI_OCR_PROVIDER memaksa urutan (mis. "ocrspace" untuk uji, "jere" default gratis).
  const forced = (process.env.AI_OCR_PROVIDER || "auto").toLowerCase().trim();
  if (forced !== "auto") {
    const idx = providers.findIndex((p) => p.name === forced);
    if (idx > 0) providers.unshift(...providers.splice(idx, 1));
  }

  const errors: string[] = [];
  const tried: string[] = [];
  for (const p of providers) {
    tried.push(p.name);
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
            "Untuk akurasi penuh, isi JERE_API_KEY (gratis) atau GEMINI_API_KEY di environment Vercel.",
          // Diagnostik: mesin apa saja yang dicoba + error tiap mesin sebelumnya.
          tried,
          detail: errors.length ? errors : undefined,
        });
      }
      // Model AI → JSON ketat (ekstrak blok {..} dari jawaban bila perlu).
      const cleaned = extractJson(text);
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
        tried,
        detail: errors.length ? errors : undefined,
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
        "Bila JERE_API_KEY/GEMINI_API_KEY belum diisi, fitur memakai OCR polos yang sering salah. " +
        "Key Jerexd gratis dari owner sudah didukung — cek varian JERE_API_KEY di Vercel → Settings → Environment Variables.",
    },
    { status: 502 },
  );
}
