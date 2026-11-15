// Debug: jalankan pipeline tesseract produksi (dual-pass + recovery) + parser blok.
import { readFileSync } from "node:fs";
import { parseWordBoxesToBlocks } from "../src/lib/ocr-blocks";
import { ocrWordBoxes } from "../src/lib/ocr-engine";

async function main() {
  const IMG = process.argv[2] || "/home/z/my-project/upload/ss1 (2)-BSP5rMrn.jpeg";
  const bytes = readFileSync(IMG);
  const { words, width, height } = await ocrWordBoxes(bytes);
  console.log(`dims=${width}x${height}, words=${words.length}`);
  const blocks = parseWordBoxesToBlocks(words, width, height);
  console.log(`blok awal: ${blocks.length}`);
  // recovery pass (sama seperti produksi)
  const mod = await import("../src/lib/ocr-engine");
  // recoverMissedKills tidak diekspor — replikasi panggilan via pipeline helper:
  // (debug memakai blocks + bytes langsung)
  const targets: { m: (typeof blocks)[0]["members"][0] }[] = [];
  for (const b of blocks) for (const m of b.members) if (m.kills == null && (m as unknown as { killHint?: unknown }).killHint) targets.push({ m });
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, { cachePath: "/tmp/bof-tessdata", logger: () => {} });
  await worker.setParameters({ tessedit_pageseg_mode: "7" as import("tesseract.js").PSM, tessedit_char_whitelist: "0123456789" });
  let pulih = 0;
  for (const { m } of targets) {
    const r = (m as unknown as { killHint: { x: number; y: number; w: number; h: number } }).killHint;
    try {
      const { data } = await worker.recognize(bytes, { rectangle: { left: r.x, top: r.y, width: r.w, height: r.h } });
      const digits = String(data.text ?? "").match(/\d{1,2}/);
      if (digits) {
        const n = Number(digits[0]);
        if (n >= 0 && n <= 30) { (m as unknown as { kills: number | null }).kills = n; pulih++; }
      }
    } catch { /* lanjut */ }
  }
  await worker.terminate();
  console.log(`angka dipulihkan: ${pulih}`);
  for (const b of blocks) {
    const detail = b.members.map((m) => `${m.name || "?"}:${m.kills ?? "?"}`).join(" | ");
    const sum = b.members.reduce((a, m) => a + (m.kills ?? 0), 0);
    console.log(`#${b.rank} (total=${sum}) ${detail}`);
  }
}
main();
