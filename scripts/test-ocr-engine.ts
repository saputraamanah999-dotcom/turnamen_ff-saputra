// ============================================================
// UJI NYATA pipeline AI OCR BOF — pakai screenshot asli + ImgBB + Jerexd
// Jalankan: JERE_API_KEY=... IMGBB_API_KEY=... npx tsx scripts/test-ocr-engine.ts
// ============================================================
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runOcrPipeline, type RegistryTeam } from "../src/lib/ocr-engine";

const IMGBB_KEY = process.env.IMGBB_API_KEY || "ae271538eef73c1305493b82bf34b9d5";
const JERE_KEY = process.env.JERE_API_KEY || "";
const IMG = process.env.OCR_TEST_IMAGE || "/home/z/my-project/upload/ss1 (2)-BSP5rMrn.jpeg";

// Tim fixture — dibuat dari roster yang TERLIHAT di screenshot uji.
// (nama tim di layar TIDAK ditampilkan — hanya pemain)
const TEAMS: RegistryTeam[] = [
  { id: "t-rbl", name: "RBL ESPORTS", tag: "RBL", captain: "RBL Celutss", roster: [{ nickname: "RBL Celutss" }, { nickname: "RBL Andrea" }, { nickname: "RBL Gracee" }, { nickname: "RBL Graceez" }] },
  { id: "t-fj", name: "FAMILY JAGO", tag: "FJ", captain: "FJ Hanz", roster: [{ nickname: "FJ Hanz" }, { nickname: "FJ Yokz" }, { nickname: "FJ Jesica" }] },
  { id: "t-polman", name: "POLMAN SQUAD", tag: "POLMAN", captain: "POLMAN.DUTZZ", roster: [{ nickname: "POLMAN.DUTZZ" }, { nickname: "POLMAN.CMING" }] },
  { id: "t-mdl", name: "MADE LA LENG", tag: "MDL", captain: "MDL.PoTazzz", roster: [{ nickname: "MDL.PoTazzz" }, { nickname: "MDL.Lordzz" }, { nickname: "MDL.JXARTZY" }] },
];

function uploadToImgbb(): Promise<string> {
  const bytes = readFileSync(resolve(IMG));
  const form = new FormData();
  form.append("key", IMGBB_KEY);
  form.append("image", bytes.toString("base64"));
  form.append("name", "bof-test-ocr-engine");
  return fetch("https://api.imgbb.com/1/upload", { method: "POST", body: form })
    .then((r) => r.json())
    .then((j: Record<string, unknown>) => {
      const d = j.data as { url?: string; display_url?: string } | undefined;
      if (!j.success || !d?.url) throw new Error(`ImgBB gagal: ${JSON.stringify(j).slice(0, 200)}`);
      return d.url ?? d.display_url!;
    });
}

async function main() {
  console.log("[1] Upload screenshot asli ke ImgBB…");
  const url = await uploadToImgbb();
  console.log(`    OK → ${url}`);

  console.log("[2] Jalankan runOcrPipeline (mesin produksi)…");
  const result = await runOcrPipeline({
    imageUrl: url,
    teams: TEAMS,
    settings: { jereTextModel: "google/gemini-3.1-flash-lite" },
    jereApiKey: JERE_KEY,
  });

  console.log(`\n=== HASIL (source=${result.source}, tried=${result.tried.join("→")}) ===`);
  console.log(`notes: ${result.notes ?? "-"}`);
  for (const r of result.rows) {
    const detail = (r.memberKills ?? []).map((m) => `${m.name}:${m.kills}`).join(" | ");
    console.log(
      `#${String(r.rank ?? "?").padEnd(2)} kills=${String(r.kills ?? "?").padEnd(3)} ` +
      `tim=${(r.teamName ?? "(manual)").padEnd(14)} yakin=${Math.round((r.confidence ?? 0) * 100)}% ` +
      `layar="${r.teamRaw.slice(0, 60)}"\n     rincian: ${detail || "-"}`
    );
  }
  // Validasi kasar: setiap baris punya kills = jumlah memberKills.
  let salah = 0;
  for (const r of result.rows) {
    if (r.memberKills?.length) {
      const sum = r.memberKills.reduce((a, m) => a + (m.kills ?? 0), 0);
      if (sum !== r.kills) { salah++; console.log(`!! MISMATCH #${r.rank}: sum=${sum} kills=${r.kills}`); }
    }
  }
  console.log(salah === 0 ? "\nSEMUA PENJUMLAHAN KONSISTEN ✓" : `\n${salah} baris tidak konsisten ✗`);
}

main().catch((e) => {
  const err = e as Error & { detail?: string[] };
  console.error("GAGAL:", err.message);
  if (err.detail?.length) console.error("detail:", err.detail.join("\n"));
  process.exit(1);
});
