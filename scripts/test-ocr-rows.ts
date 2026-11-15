// ============================================================
// TEST PARSER "KILL-ANCHORED" v3 terhadap SCREENSHOT ASLI pengguna.
// Jalankan: npx tsx scripts/test-ocr-rows.ts <path-gambar>
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { parseKillAnchoredRows, type DigitZone, type OcrWord } from "../src/lib/ocr-rows";
import { ocrWordBoxes, createDigitRescuerNode } from "../src/lib/ocr-engine";

const FIXTURE_DIR = path.join(process.cwd(), "scripts", "fixtures");

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  PASS ${name} ${extra}`); }
  else { fail++; console.error(`  FAIL ${name} ${extra}`); }
}

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error("Pemakaian: npx tsx scripts/test-ocr-rows.ts <path-gambar>");
  const imagePath = path.resolve(arg);
  const bytes = fs.readFileSync(imagePath);
  console.log(`[test] OCR pada: ${imagePath} (${bytes.length} bytes)`);

  const t0 = Date.now();
  const { words, width, height } = await ocrWordBoxes(bytes);
  console.log(`[test] OCR pass ${Date.now() - t0}ms · ${words.length} kata · kanvas ${width}x${height}`);

  if (!fs.existsSync(FIXTURE_DIR)) fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(FIXTURE_DIR, "ocr-words-last.json"),
    JSON.stringify({ words, width, height }, null, 1),
  );

  const t1 = Date.now();
  const rescue = await createDigitRescuerNode(bytes);
  const res = await parseKillAnchoredRows(words, width, {
    rescueDigit: rescue,
    onDebug: (stage, data) => {
      if (stage === "cells0") console.log("[cells0]", JSON.stringify(data));
      if (stage === "blocks") console.log("[blocks-pre]", JSON.stringify(data));
      if (stage === "rescue" && process.env.RESCUE_LOG) console.log("[rescue]", JSON.stringify(data));
    },
  });
  console.log(`[test] parser+rescue ${Date.now() - t1}ms · lineH=${res.lineH} · strips=[${res.strips.join(", ")}] · bands=[${res.bands.join(", ")}] · rescue=${res.rescued}x`);

  console.log("\nHASIL PARSING (rank | total | sel | rank dibaca | flags):");
  for (const b of res.blocks) {
    const total = b.pairs.reduce((a, p) => a + p.value, 0);
    const angka = b.pairs.map((p) => `${p.value}${p.rescued ? "*" : ""}`).join("+");
    console.log(
      `  Top #${String(b.rank).padStart(2)} = ${String(total).padStart(3)}  (${b.pairs.length}/4: ${angka || "-"})` +
      `  rankDibaca=${b.rankRead ?? "-"}  ${b.flags.length ? "⚠ " + b.flags.join(" | ") : ""}`,
    );
  }

  const byRank = new Map(res.blocks.map((b) => [b.rank, b]));
  const total = (r: number) => (byRank.get(r)?.pairs ?? []).reduce((a, p) => a + p.value, 0);

  console.log("\nASSERTION (nilai harapan dibaca manual dari screenshot):");
  check("≥ 10 blok tim terdeteksi", res.blocks.length >= 10, `(${res.blocks.length})`);
  check("Top 1 = 19 (3+6+5+5)", total(1) === 19, `(${total(1)})`);
  check("Top 2 = 18 (9+1+4+4)", total(2) === 18, `(${total(2)})`);
  check("Top 3 = 15 (4+3+4+4)", total(3) === 15, `(${total(3)})`);
  check("Top 4 = 5", total(4) === 5, `(${total(4)})`);
  check("Top 5 = 11", total(5) === 11, `(${total(5)})`);
  check("Top 6 = 10", total(6) === 10, `(${total(6)})`);
  check("Top 7 = 4", total(7) === 4, `(${total(7)})`);
  check("Top 8 = 2", total(8) === 2, `(${total(8)})`);
  check("Top 9 = 3", total(9) === 3, `(${total(9)})`);
  check("Top 10 = 1", total(10) === 1, `(${total(10)})`);
  const keys = [...byRank.keys()];
  const dupes = keys.filter((r, i) => keys.indexOf(r) !== i);
  check("tidak ada rank ganda", dupes.length === 0, dupes.join(","));
  const penuh = res.blocks.filter((b) => b.pairs.length === 4).length;
  check("≥ 8 blok terbaca lengkap 4/4", penuh >= 8, `(${penuh})`);

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
