// ============================================================
// STIKAR ESPORTS — BOF · MESIN AI OCR SCREENSHOT FREE FIRE
// Lib server MURNI (tanpa import next/server) — dipakai oleh
// route /api/ai/ocr DAN script uji (scripts/test-ocr-engine.ts)
// sehingga pipeline yang diuji = pipeline yang berjalan produksi.
//
// ATURAN INTI (kesalahan lama yang sudah diperbaiki):
//   Layar hasil Free Fire menampilkan blok peringkat (Top 1, Top 2, ...)
//   dan SETIAP BLOK BERISI SAMPAI 4 PEMAIN dengan kill per pemain.
//   Kill tim = JUMLAH kill semua anggota blok (dihitung total),
//   BUKAN kill satu pemain. Nama tim sering TIDAK ditampilkan —
//   pencocokan tim terdaftar memakai NAMA PEMAIN (roster/kapten).
// ============================================================

import {
  matchOcrRowToTeam,
  sanitizeOcrRows,
} from "./ocr";
import {
  imageDimensions,
  parseWordBoxesToBlocks,
  type OcrWord,
  type ParsedBlock,
  type ParsedMember,
} from "./ocr-blocks";
import type { OcrRow } from "./types";

export interface RegistryTeam {
  id: string;
  name: string;
  tag?: string;
  captain?: string;
  roster?: { nickname: string }[];
  ocrAliases?: string[];
}

/** Pengaturan mesin OCR — diatur dari UI Admin → Pengaturan (dokumen settings/ocr),
 *  BUKAN dari .env. Env hanya menyimpan API key. */
export interface OcrEngineSettings {
  /** Model vision jerexd (chatvision-v2/v1). Kosong = default server jerexd. */
  jereVisionModel?: string;
  /** Model teks jerexd (aichat) untuk menstrukturkan bacaan ke JSON. */
  jereTextModel?: string;
  /** Aktifkan fallback OCR.space (OCR polos, wajib diperiksa admin). */
  ocrSpaceEnabled?: boolean;
}

export interface OcrPipelineResult {
  ok: true;
  source: string;
  needsReview: boolean;
  booyahTeam: string | null;
  rows: OcrRow[];
  notes: string | null;
  tried: string[];
  detail?: string[];
}

// ============================================================
// PROMPT UTAMA — jelaskan tata letak layar FF + aturan penjumlahan
// ============================================================
export function buildVisionPrompt(teams: RegistryTeam[]): string {
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
Tugas: baca screenshot LAYAR HASIL match Free Fire (layar BOOYAH!, papan skor akhir, atau klasemen) dan ubah menjadi JSON.

TATA LETAK LAYAR — PAHAMI DULU SEBELUM MEMBACA:
- Layar berisi daftar blok peringkat: nomor placement BESAR (1, 2, 3, 4, ...) di sisi kiri setiap blok. Nomor 1 biasanya kotak emas.
- SATU BLOK PLACEMENT = SATU TIM, dan berisi SAMPAI 4 PEMAIN (susunan 2 kolom x 2 baris).
- Setiap pemain tertulis: NAMA PEMAIN lalu angka kill dan kata "Kill" — contoh: "U.Dogss  6 Kill".
- Kill adalah PER PEMAIN. KILL TIM = JUMLAH (penjumlahan) kill SEMUA anggota dalam blok itu. Contoh blok Top 1 berisi "aangtzc 3 Kill", "U.Dogss 6 Kill", "Nuglieeie 5 Kill", "Nuglieeie 5 Kill" → kill tim = 3+6+5+5 = 19.
- Sering kali NAMA TIM TIDAK DITAMPILKAN sama sekali — hanya nama pemain. JANGAN MENGARANG nama tim; biarkan "screenTeam": null.
- Beberapa varian layar menampilkan nama tim/kru di blok — bila ada, tulis persis di "screenTeam".

DAFTAR TIM TERDAFTAR turnamen ini (id | nama | tag | kapten | pemain roster | alias):
${daftar}

ATURAN WAJIB:
1. Satu blok placement = SATU entri di "rows". "rank" = nomor placement blok (1, 2, 3, ...).
2. "memberKills" = SEMUA pemain di blok itu, sampai 4 orang: [{"name":"nama persis di layar","kills":6}, ...]. Jangan melewatkan satu pun pemain.
3. "kills" = TOTAL penjumlahan kills semua anggota blok (kill tim, bukan kill satu pemain). Hitung ulang penjumlahannya dengan cermat.
4. Cocokkan setiap blok ke tim terdaftar memakai NAMA PEMAIN (bandingkan dengan kolom "pemain" dan "kapten" daftar di atas — simbol/hiasan diabaikan, ejaan mirip dianggap sama, mis. "RBL GraceeSB" = "RBL Gracee"). Bila 2 pemain atau lebih dalam satu blok cocok dengan roster tim yang sama, isi "teamId" = id tim itu. Bila hanya 1 pemain cocok dan tidak persis sama, atau tidak ada yang cocok: "teamId": null. JANGAN MENEBAK.
5. Abaikan elemen UI: tombol KEMBALI, logo FREE FIRE, waktu, ping, mode, latar belakang, ikon.
6. Blok yang terpotong tepi layar tetap dimasukkan bila nomor placementnya terlihat — isi hanya pemain yang terlihat, dan sebutkan di "notes" bahwa ada blok terpotong.
7. Bila suatu angka benar-benar tidak terbaca, isi null — JANGAN menebak.
8. Balas HANYA JSON tanpa penjelasan apa pun, dengan skema persis:
{"rows":[{"rank":1,"screenTeam":null,"memberKills":[{"name":"aangtzc","kills":3},{"name":"U.Dogss","kills":6},{"name":"Nuglieeie","kills":5},{"name":"Nuglieeie","kills":5}],"kills":19,"teamId":"id-atau-null","confidence":0.95}],"booyahTeam":"nama tim rank 1 atau null","notes":"catatan singkat atau null"}`;
}

/** Prompt langkah penstrukturan (aichat teks) — aturan penjumlahan yang sama. */
export function buildStructPrompt(caption: string, teams: RegistryTeam[]): string {
  const daftar = teams.length
    ? teams
        .map((t) => {
          const pemain = (t.roster ?? []).map((r) => r.nickname).filter(Boolean).join(", ");
          return `- ${t.name}${t.tag ? ` (tag ${t.tag})` : ""}${pemain ? ` — pemain: ${pemain}` : ""}`;
        })
        .join("; ")
    : "(belum ada tim terdaftar)";
  return `Kamu asisten data turnamen Free Fire (BOF). Teks di bawah adalah HASIL PEMBACAAN screenshot papan skor Free Fire.
Ubah menjadi JSON murni. ATURAN:
- Satu blok placement (top 1, top 2, ...) = satu entri rows. "rank" = nomor placementnya.
- Layar berisi nama PEMAIN dengan kill per pemain (contoh "U.Dogss 6 Kill"). Satu blok = sampai 4 pemain.
- "memberKills" = semua pemain blok: [{"name":"nama","kills":6}, ...].
- "kills" = JUMLAH TOTAL kill semua anggota blok (contoh 3+6+5+5 = 19) — kill TIM, bukan satu pemain.
- "teamId": cocokkan nama pemain dengan daftar tim berikut (roster/kapten); bila ≥2 pemain satu blok masuk roster tim yang sama, isi id-nya; kalau tidak yakin, null.
- Nama ditulis PERSIS; jangan mengarang.
Daftar tim (nama — pemain): ${daftar}
Skema JSON: {"rows":[{"rank":1,"screenTeam":null,"memberKills":[{"name":"...","kills":0}],"kills":0,"teamId":null,"confidence":0.9}],"booyahTeam":null,"notes":null}
TEKS HASIL BACAAN:
"""
${caption.slice(0, 3500)}
"""
Balas HANYA JSON tanpa penjelasan.`;
}

// ============================================================
// PANGGILAN PROVIDER (dipindah utuh dari route — diuji langsung)
// ============================================================
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

/** Jerexd chatvision-v2 — kirim LINK gambar (ImgBB), form-urlencoded. */
async function callJerexd(apiKey: string, imageUrl: string, prompt: string, model?: string): Promise<string> {
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

/** Jerexd chatvision v1 — upload FILE langsung (multipart), model gemini/gpt. */
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

/** Jerexd aichat (teks, gratis) — strukturkan hasil bacaan menjadi JSON. */
async function callJerexdStruct(apiKey: string, caption: string, teams: RegistryTeam[], model: string): Promise<string> {
  const prompt = buildStructPrompt(caption, teams);
  const params = new URLSearchParams();
  params.set("model", model);
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

/** OCR.space — OCR polos tanpa AI (fallback terakhir, wajib diperiksa admin). */
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

// ============================================================
// UTIL
// ============================================================
export function extractJson(text: string): string {
  const cleaned = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return cleaned;
  return cleaned.slice(start, end + 1);
}

/** True bila teks memuat JSON dengan array "rows" berisi minimal 1 baris. */
export function hasRowsJson(text: string): boolean {
  try {
    const obj = JSON.parse(extractJson(text)) as { rows?: unknown };
    return Array.isArray(obj.rows) && obj.rows.length > 0;
  } catch {
    return false;
  }
}

/** Validasi ulang teamId dari AI + pencocokan lokal per-pemain (voting). */
export function resolveRows(rows: OcrRow[], teams: RegistryTeam[]): OcrRow[] {
  const byId = new Map(teams.map((t) => [t.id, t]));
  return rows.map((r) => {
    let teamId = r.teamId && byId.has(r.teamId) ? r.teamId : null;
    let teamName = teamId ? (byId.get(teamId)?.name ?? null) : r.teamName ?? null;
    let confidence = r.confidence ?? 0.5;
    if (teamId) {
      confidence = Math.max(confidence, 0.75);
    } else {
      const m = matchOcrRowToTeam(r, teams as never);
      if (m) {
        teamId = m.teamId;
        teamName = m.teamName;
        // Voting ≥2 pemain → keyakinan naik; 1 pemain persis → sedang.
        confidence = Math.max(confidence, m.votes >= 2 ? Math.min(0.95, 0.6 + 0.1 * m.votes) : 0.7);
      } else {
        confidence = Math.min(confidence, 0.5);
      }
    }
    return { ...r, teamId, teamName, confidence };
  });
}

// ============================================================
// TESSERACT.JS — OCR DENGAN KOORDINAT KATA (TANPA API KEY, GRATIS)
// DUA pass: PSM 6 (struktur blok lengkap) + PSM 11 (sparse — menangkap
// angka yang lolos dari pass utama). Hasil digabung per posisi.
// Worker script & core diselesaikan EKSPLISIT via createRequire —
// bundling Next/Vercel merusak __dirname bawaan tesseract.js
// (error "Cannot find module '/ROOT/node_modules/tesseract.js/...").
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
  // ini booster recall angka, bukan keharusan (hemat ~40% waktu CPU).
  let sparse: OcrWord[] = [];
  if (main.length < 60) {
    sparse = await runPass("11").catch(() => [] as OcrWord[]);
    for (const w of sparse) {
      width = Math.max(width, w.x + w.w);
      height = Math.max(height, w.y + w.h);
    }
  }

  // Gabungkan: kata sparse yang tidak ada padanannya di pass utama
  // ditambahkan. Pengecualian: bila posisi bertabrakan dengan kata "Kill"
  // (bukan nama/digit), kata sparse tetap ditambahkan — ini yang memulihkan
  // angka kill yang terlewat pass utama (mis. "9" tepat di area "Kill").
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

/** Blok geometris → baris OCR mentah (belum dicocokkan tim). */
export function blocksToRows(blocks: ParsedBlock[]): OcrRow[] {
  return blocks.map((b) => {
    const dipulihkan = b.members.filter((m) => m.recovered).length;
    return {
      rank: b.rank,
      teamRaw: b.members.map((m) => m.name).join(", "),
      teamId: null,
      teamName: null,
      kills: b.members.reduce((a, m) => a + (m.kills ?? 0), 0),
      confidence: dipulihkan > 0 ? 0.55 : 0.6,
      players: b.members.map((m) => m.name),
      memberKills: b.members.map((m) => ({ name: m.name, kills: m.kills })),
    };
  });
}

/**
 * RECOVERY PASS — untuk pemain yang angka killnya gagal terbaca pass awal,
 * OCR ulang TEPAT di area angka kill (rectangle zoom, whitelist digit saja,
 * PSM single-line). Meningkatkan recall angka tanpa mengorbankan akurasi:
 * bila tetap tidak terbaca, kills dibiarkan null (admin isi manual).
 */
async function recoverMissedKills(blocks: ParsedBlock[], bytes: Buffer): Promise<number> {
  const targets: ParsedMember[] = [];
  for (const b of blocks) for (const m of b.members) if (m.kills == null && m.killHint) targets.push(m);
  if (!targets.length) return 0;
  const batas = Date.now() + 22_000; // anggaran waktu recovery (lambda 60s)
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, { cachePath: "/tmp/bof-tessdata", logger: () => {}, ...resolveTessPaths() });
  let pulih = 0;
  try {
    await worker.setParameters({ tessedit_pageseg_mode: "7" as import("tesseract.js").PSM, tessedit_char_whitelist: "0123456789" });
    for (const m of targets.slice(0, 16)) {
      if (Date.now() > batas) break;
      const r = m.killHint!;
      try {
        const { data } = await worker.recognize(bytes, {
          rectangle: { left: r.x, top: r.y, width: r.w, height: r.h },
        });
        const teks = String(data.text ?? "").trim();
        if (r.kind === "zone") {
          // Zona kosong: hanya terima SATU digit persis (0-9) — mencegah
          // digit dari ID pemain di dekatnya ikut terhitung.
          if (/^\d$/.test(teks)) {
            m.kills = Number(teks);
            m.recovered = true;
            pulih++;
          }
        } else {
          // Token salah baca: ambil angka pertama yang wajar — whitelist
          // digit membuat hasil jauh lebih andal daripada bacaan bebas.
          const digits = teks.match(/\d{1,2}/);
          if (digits) {
            const n = Number(digits[0]);
            if (n >= 0 && n <= 23) {
              m.kills = n;
              m.recovered = true;
              pulih++;
            }
          }
        }
      } catch {
        // satu area gagal — lanjut area berikutnya
      }
    }
  } finally {
    await worker.terminate().catch(() => {});
  }
  return pulih;
}

/**
 * Perbaiki nama pemain hasil OCR (sering tergaris-garis/salah baca) memakai
 * aichat jerexd — ANGKA KILL TIDAK DIUBAH (angka dari geometri adalah sumber
 * kebenaran). Bila aichat gagal/balasan tidak valid → nama asli dipakai.
 */
async function refineNamesWithJerexd(
  apiKey: string,
  blocks: ParsedBlock[],
  teams: RegistryTeam[],
  textModel: string,
): Promise<ParsedBlock[]> {
  const daftar = teams.length
    ? teams.map((t) => {
        const pemain = (t.roster ?? []).map((r) => r.nickname).filter(Boolean).join(", ");
        return `- ${t.name}${t.tag ? ` [${t.tag}]` : ""}: ${pemain || "(roster kosong)"}`;
      }).join("\n")
    : "(belum ada)";
  const dump = blocks
    .map((b) => `Top ${b.rank}: ${b.members.map((m) => `"${m.name}"=${m.kills ?? "?"}`).join(", ")}`)
    .join("\n");
  const prompt = `Hasil OCR layar skor Free Fire (bisa salah huruf, simbol hilang) — perbaiki NAMA PEMAIN saja.
Daftar tim terdaftar (nama tim [tag]: pemain):
${daftar}

Data OCR:
${dump}

TUGAS:
1. Untuk setiap nama, koreksi salah baca agar cocok dengan pemain terdaftar bila jelas mirip (contoh "RBLCeltssh"→"RBL Celutss", "indrea®"→"RBL Andrea"). Bila tidak yakin, tulis ulang apa adanya. JANGAN mengarang nama baru, JANGAN mengubah angka.
2. Balas HANYA JSON: {"blocks":[{"rank":1,"members":[{"name":"nama yang sudah dikoreksi","kills":3}]}]} — rank & jumlah members & angka kills HARUS sama persis dengan data OCR.
Balas HANYA JSON.`;
  const params = new URLSearchParams();
  params.set("model", textModel);
  params.set("prompt", prompt);
  const res = await fetch(`https://api.jerexd.my.id/api/ai/aichat?apikey=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await res.text();
  let json: Record<string, unknown> | null = null;
  try { json = JSON.parse(raw) as Record<string, unknown>; } catch { throw new Error(`aichat bukan JSON (HTTP ${res.status})`); }
  if (!res.ok || json?.status === false) throw new Error(String(json?.error ?? json?.message ?? `HTTP ${res.status}`).slice(0, 200));
  const data = json?.data as { answer?: string } | undefined;
  const result = json?.result as string | { answer?: string } | undefined;
  const text = String(data?.answer ?? (typeof result === "string" ? result : result?.answer) ?? "");
  const obj = JSON.parse(extractJson(text)) as { blocks?: { rank?: number; members?: { name?: string; kills?: number }[] }[] };
  if (!Array.isArray(obj.blocks)) throw new Error("balasan tanpa blocks");
  const fixed: ParsedBlock[] = [];
  for (const b of obj.blocks) {
    const orig = blocks.find((x) => x.rank === b.rank);
    if (!orig || !Array.isArray(b.members) || b.members.length !== orig.members.length) { if (orig) fixed.push(orig); continue; }
    const members = orig.members.map((m, i) => ({
      name: String(b.members![i]?.name ?? m.name).trim().slice(0, 48) || m.name,
      kills: m.kills, // angka TIDAK diubah dari geometri
      recovered: m.recovered,
    }));
    fixed.push({ rank: orig.rank, members });
  }
  return fixed;
}


/**
 * MODE BARU — OCR dijalankan di BROWSER admin (CPU perangkat admin, bebas
 * batas waktu server). Klien mengirim blok hasil parser geometris
 * (src/lib/ocr-blocks.ts dipakai langsung di browser); server hanya
 * memperbaiki nama via aichat jerexd, menghitung total kill (penjumlahan
 * per blok) dan mencocokkan tim terdaftar.
 */
export async function analyzeBlocks(opts: {
  blocks: ParsedBlock[];
  teams: RegistryTeam[];
  settings?: OcrEngineSettings;
  jereApiKey?: string;
}): Promise<OcrPipelineResult> {
  const { teams } = opts;
  const settings = opts.settings ?? {};
  let blocks = opts.blocks
    .filter((b) => b && Number.isFinite(b.rank) && Array.isArray(b.members))
    .map((b) => ({ rank: Math.trunc(b.rank), members: b.members.slice(0, 4).map((m) => ({ name: String(m.name ?? "").slice(0, 48), kills: Number.isFinite(m.kills) ? Math.trunc(m.kills as number) : null })) }))
    .filter((b) => b.members.length > 0);
  if (blocks.length < 2) throw new Error("Data blok dari browser tidak cukup (minimal 2 blok placement).");

  const jereKey = opts.jereApiKey || "";
  let catatan = "";
  if (jereKey && teams.length) {
    const textModel = settings.jereTextModel?.trim() || "google/gemini-3.1-flash-lite";
    try {
      blocks = await refineNamesWithJerexd(jereKey, blocks, teams, textModel);
    } catch (e) {
      catatan = `Perbaikan nama AI gagal (${String((e as Error).message ?? e).slice(0, 120)}) — nama asli OCR dipakai.`;
    }
  }

  let rows = blocksToRows(blocks);
  rows = rows.filter((r) => r.kills != null);
  rows = resolveRows(rows, teams);
  const booyah = rows.find((r) => r.rank === 1)?.teamName ?? rows.find((r) => r.rank === 1)?.teamRaw ?? null;
  const takCocok = rows.filter((r) => !r.teamId).length;
  return {
    ok: true,
    source: jereKey ? "browser-ocr+jere" : "browser-ocr",
    needsReview: takCocok > rows.length / 2,
    booyahTeam: booyah,
    rows,
    notes:
      `${rows.length} blok placement terbaca. Kill tim = penjumlahan kill semua pemain di blok ` +
      `(dihitung otomatis). ${takCocok ? takCocok + " baris belum cocok tim terdaftar — pilih manual di kolom Tim terdaftar." : "Semua baris cocok tim terdaftar."}` +
      (catatan ? ` ${catatan}` : ""),
    tried: ["browser-tesseract"],
  };
}

// ============================================================
// PIPELINE UTAMA
// ============================================================
export async function runOcrPipeline(opts: {
  imageUrl: string;
  teams: RegistryTeam[];
  settings?: OcrEngineSettings;
  jereApiKey?: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
  ocrSpaceKey?: string;
}): Promise<OcrPipelineResult> {
  const { imageUrl, teams } = opts;
  const settings = opts.settings ?? {};
  const prompt = buildVisionPrompt(teams);

  // Unduh gambar satu kali untuk semua provider.
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!imgRes.ok) throw new Error(`Gagal mengunduh gambar: HTTP ${imgRes.status}`);
  let buf = Buffer.from(await imgRes.arrayBuffer());
  if (buf.length < 64) throw new Error("berkas terlalu kecil");
  if (buf.length > 16 * 1024 * 1024) throw new Error("berkas > 16 MB");
  let mime = imgRes.headers.get("content-type")?.split(";")[0] ?? "image/png";
  if (!mime.startsWith("image/")) mime = "image/png";
  // Downscale: OCR 1600px sudah akurat dan ±4x lebih cepat — screenshot HP
  // mentah (2400-4000px) membuat mesin melebihi batas waktu lambda Vercel.
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(buf).metadata();
    if ((meta.width ?? 0) > 1600) {
      buf = await sharp(buf).resize({ width: 1600 }).jpeg({ quality: 88 }).toBuffer();
      mime = "image/jpeg";
    }
  } catch {
    // sharp gagal (mis. binary tidak tersedia) — lanjut dengan gambar asli.
  }
  const bytes = buf;
  const b64 = bytes.toString("base64");

  const providers: { name: string; run: () => Promise<string>; needsReview?: boolean }[] = [];
  const jereKeyForNames = opts.jereApiKey || "";
  let catatanRecovery = "";

  // ============================================================
  // MESIN UTAMA — TESSERACT.JS (word boxes, tanpa API key) + JEREXD aichat
  // Angka (rank & kill) dibaca geometris — akurat & tidak tergantung AI.
  // Nama pemain diperbaiki aichat jerexd (bila key ada).
  // ============================================================
  let tesseractBlocks: ParsedBlock[] = [];
  try {
    const { words, width, height } = await ocrWordBoxes(bytes);
    if (width && height && words.length >= 6) {
      tesseractBlocks = parseWordBoxesToBlocks(words, width, height);
      if (tesseractBlocks.length >= 2) {
        try {
          const pulih = await recoverMissedKills(tesseractBlocks, bytes);
          if (pulih) catatanRecovery = `${pulih} angka kill dipulihkan lewat re-OCR terarah.`;
        } catch (e) {
          // recovery opsional — lanjut dengan hasil pass awal
          console.error("[ocr] recovery gagal:", String((e as Error).message ?? e).slice(0, 200));
        }
      }
    }
  } catch (e) {
    console.error("[ocr] tesseract path gagal:", String((e as Error).message ?? e).slice(0, 300));
    tesseractBlocks = [];
  }

  if (tesseractBlocks.length >= 2) {
    const textModel = settings.jereTextModel?.trim() || "google/gemini-3.1-flash-lite";
    let blocks = tesseractBlocks;
    let catatan = "";
    if (jereKeyForNames && teams.length) {
      try {
        blocks = await refineNamesWithJerexd(jereKeyForNames, blocks, teams, textModel);
      } catch (e) {
        catatan = `Perbaikan nama AI gagal (${String((e as Error).message ?? e).slice(0, 120)}) — nama asli OCR dipakai.`;
      }
    }
    let rows = blocksToRows(blocks);
    // Baris yang sama sekali tak terbaca angkanya (kill null semua) dibuang.
    rows = rows.filter((r) => r.kills != null);
    if (rows.length) {
      rows = resolveRows(rows, teams);
      const booyah = rows.find((r) => r.rank === 1)?.teamName ?? rows.find((r) => r.rank === 1)?.teamRaw ?? null;
      const takCocok = rows.filter((r) => !r.teamId).length;
      return {
        ok: true,
        source: jereKeyForNames ? "tesseract+jere" : "tesseract",
        needsReview: takCocok > rows.length / 2,
        booyahTeam: booyah,
        rows,
        notes:
          `${rows.length} blok placement terbaca. Kill tim = penjumlahan kill semua pemain di blok ` +
          `(dihitung otomatis). ${takCocok ? takCocok + " baris belum cocok tim terdaftar — pilih manual di kolom Tim terdaftar." : "Semua baris cocok tim terdaftar."}` +
          (catatanRecovery ? ` ${catatanRecovery}` : "") +
          (catatan ? ` ${catatan}` : ""),
        tried: ["tesseract"],
        detail: undefined,
      };
    }
  }

  // ============================================================
  // MESIN CADANGAN — provider AI vision (hanya bila key tersedia)
  // ============================================================
  const jereKey = opts.jereApiKey || "";
  if (jereKey) {
    const visionModel = settings.jereVisionModel?.trim() || "";
    const textModel = settings.jereTextModel?.trim() || "google/gemini-3.1-flash-lite";
    providers.push({
      name: "jere",
      run: async () => {
        const catatan: string[] = [];
        // Kedua endpoint vision dijalankan PARALEL (server jerexd kadang lambat).
        const [r2, r1] = await Promise.allSettled([
          callJerexd(jereKey, imageUrl, prompt, visionModel || undefined),
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
        // Strukturkan teks bacaan via aichat (gratis) → JSON skema tetap.
        const structured = await callJerexdStruct(jereKey, caption, teams, textModel);
        if (!hasRowsJson(structured)) {
          throw new Error(`Jerexd: ${catatan.join(" | ")} | structuring gagal: ${structured.slice(0, 100)}`);
        }
        return structured;
      },
    });
  }

  const geminiKey = opts.geminiApiKey || "";
  if (geminiKey) providers.push({ name: "gemini", run: () => callGemini(geminiKey, "gemini-2.0-flash", prompt, b64, mime) });

  const openaiKey = opts.openaiApiKey || "";
  if (openaiKey) providers.push({ name: "openai", run: () => callOpenai(openaiKey, "gpt-4o-mini", "https://api.openai.com/v1", prompt, b64, mime) });

  if (settings.ocrSpaceEnabled && opts.ocrSpaceKey) {
    providers.push({ name: "ocrspace", needsReview: true, run: () => callOcrSpace(opts.ocrSpaceKey!, b64, mime) });
  }

  if (!providers.length) {
    throw new Error(
      "Belum ada API key mesin analisa. Isi JERE_API_KEY (key Jerexd — gratis) di Pengaturan environment, atau nyalakan OCR.space di menu Pengaturan → AI & OCR.",
    );
  }

  const errors: string[] = [];
  const tried: string[] = [];
  for (const p of providers) {
    tried.push(p.name);
    try {
      const text = await p.run();
      if (p.name === "ocrspace") {
        const { parseOcrSpaceText } = await import("./ocr");
        const rows = parseOcrSpaceText(text);
        const resolved = resolveRows(rows, teams);
        return {
          ok: true,
          source: "ocrspace",
          needsReview: true,
          booyahTeam: resolved.find((r) => r.rank === 1)?.teamRaw ?? null,
          rows: resolved,
          notes:
            "Hasil OCR polos (tanpa AI vision). Periksa & koreksi setiap baris sebelum diterapkan.",
          tried,
          detail: errors.length ? errors : undefined,
        };
      }
      const cleaned = extractJson(text);
      const parsed = JSON.parse(cleaned);
      const obj = parsed as Record<string, unknown>;
      let rows = sanitizeOcrRows(obj.rows ?? obj.data ?? obj.results);
      if (!rows.length) throw new Error("AI tidak menemukan blok placement — pastikan screenshot layar skor/BOOYAH.");
      rows = resolveRows(rows, teams);
      const booyahRaw = typeof obj.booyahTeam === "string" ? obj.booyahTeam : null;
      const booyah = booyahRaw ?? rows.find((r) => r.rank === 1)?.teamName ?? rows.find((r) => r.rank === 1)?.teamRaw ?? null;
      return {
        ok: true,
        source: p.name,
        needsReview: false,
        booyahTeam: booyah,
        rows,
        notes: typeof obj.notes === "string" ? obj.notes.slice(0, 400) : null,
        tried,
        detail: errors.length ? errors : undefined,
      };
    } catch (e) {
      errors.push(`${p.name}: ${String((e as Error).message ?? e).slice(0, 220)}`);
    }
  }

  const err = new Error("Semua mesin analisa gagal.") as Error & { detail?: string[]; tried?: string[] };
  err.detail = errors;
  err.tried = tried;
  throw err;
}
