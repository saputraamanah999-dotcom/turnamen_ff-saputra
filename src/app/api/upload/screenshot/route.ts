import { NextRequest, NextResponse } from "next/server";

// ============================================================
// BOF — POST /api/upload/screenshot
// Upload bukti screenshot Free Fire → link gambar permanen.
//
// HOSTING TUNGGAL: ImgBB (https://api.imgbb.com/1/upload) — CDN
// cepat, tidak ada expiration (gambar permanen) kecuali klien
// mengirim ?ttl=dalam_detik. (Supabase dihapus dari alur —
// keputusan owner: Firebase = database, ImgBB = hosting gambar.)
//
// Server-only: API key TIDAK pernah sampai ke browser.
// ============================================================

export const runtime = "nodejs";

/** Key bawaan milik turnamen (diberikan owner). Bisa diganti via env IMGBB_API_KEY. */
const IMGBB_KEY_DEFAULT = "ae271538eef73c1305493b82bf34b9d5";
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

interface UploadResult {
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

async function uploadToImgbb(
  bytes: Buffer,
  mime: string,
  name: string,
  apiKey: string,
  ttl?: string,
): Promise<UploadResult> {
  const form = new FormData();
  form.append("key", apiKey);
  // ImgBB menerima file mentah atau base64 — kirim base64 paling aman lintas runtime.
  form.append("image", bytes.toString("base64"));
  form.append("name", name);
  if (ttl && /^\d+$/.test(ttl)) form.append("expiration", ttl);

  const res = await fetch("https://api.imgbb.com/1/upload", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(45_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success || !json?.data?.url) {
    const detail = json?.error?.message ?? json?.error ?? `HTTP ${res.status}`;
    throw new Error(`ImgBB menolak upload: ${String(detail).slice(0, 200)}`);
  }
  const d = json.data;
  return {
    url: d.display_url ?? d.url,
    thumbUrl: d.thumb?.url ?? d.medium?.url ?? d.url,
    deleteUrl: d.delete_url,
    host: "imgbb",
    width: Number(d.width) || undefined,
    height: Number(d.height) || undefined,
    size: Number(d.size) || undefined,
    mime,
    filename: d.image?.filename ?? name,
  };
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Field 'file' (gambar) wajib dikirim." }, { status: 400 });
    }
    const mime = file.type || "image/png";
    if (!ALLOWED.has(mime)) {
      return NextResponse.json(
        { ok: false, error: `Format ${mime} tidak didukung. Pakai PNG/JPG/WEBP.` },
        { status: 415 },
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length === 0) {
      return NextResponse.json({ ok: false, error: "Berkas kosong." }, { status: 400 });
    }
    if (bytes.length > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "Gambar lebih dari 20 MB." }, { status: 413 });
    }

    const tid = String(form.get("tid") ?? "tid").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "tid";
    const matchId = String(form.get("matchId") ?? "match").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "match";
    const stamp = Date.now().toString(36);
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const name = `bof-${tid.slice(0, 10)}-m${matchId.slice(0, 10)}-${stamp}`;

    const imgbbKey = process.env.IMGBB_API_KEY || IMGBB_KEY_DEFAULT;

    // --- ImgBB (hosting tunggal) — 2 percobaan bila gangguan jaringan ---
    const errors: string[] = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await uploadToImgbb(
          bytes, mime, name, imgbbKey,
          req.nextUrl.searchParams.get("ttl") ?? undefined,
        );
        return NextResponse.json({ ok: true, ...result });
      } catch (e) {
        errors.push(`percobaan ${attempt}: ${String((e as Error).message ?? e)}`);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: "ImgBB menolak upload. Cek koneksi server atau kelola key IMGBB_API_KEY di environment.",
        detail: errors,
      },
      { status: 502 },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Upload gagal: ${String((e as Error).message ?? e).slice(0, 300)}` },
      { status: 500 },
    );
  }
}
