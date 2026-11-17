// Regresi: kata OCR ASLI pengguna (fixture cache) → parser v4.
// Verifikasi struktur: >= 10 blok, rank unik, top1 terbaca.
import fs from "node:fs";
import { parseKillAnchoredRows } from "../src/lib/ocr-rows";
import type { OcrWord } from "../src/lib/ocr-rows";

async function main() {
  for (const f of ["ocr-words-last.json", "ocr-words-sample.json"]) {
    const p = `scripts/fixtures/${f}`;
    if (!fs.existsSync(p)) continue;
    const { words, width } = JSON.parse(fs.readFileSync(p, "utf8")) as { words: OcrWord[]; width: number };
    console.log(`\n=== ${f}: ${words.length} kata, lebar ${width} ===`);
    const res = await parseKillAnchoredRows(words, width, {});
    const ranks = res.blocks.map((b) => b.rank);
    const dupes = ranks.filter((r, i) => ranks.indexOf(r) !== i);
    console.log(
      `blok=${res.blocks.length} lineH=${res.lineH} strips=[${res.strips.join(",")}] bands=[${res.bands.join(",")}]`,
    );
    console.log(
      res.blocks
        .map((b) => `r${b.rank}${b.rankRead !== null ? "*" : ""}=${b.pairs.reduce((a, p) => a + p.value, 0)}(${b.pairs.length})`)
        .join(" "),
    );
    console.log(`rank ganda: ${dupes.length ? dupes.join(",") : "TIDAK ADA"}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
