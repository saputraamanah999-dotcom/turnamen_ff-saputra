// Debug parser internals pada papan skor sintetis 1 kolom.
import fs from "node:fs";
import { ocrWordBoxes, createDigitRescuerNode } from "../src/lib/ocr-engine";
import { parseKillAnchoredRows } from "../src/lib/ocr-rows";

(async () => {
  const bytes = fs.readFileSync("scripts/fixtures/synth-1col.png");
  const { words, width } = await ocrWordBoxes(bytes);
  console.log("words:", words.length, "w:", width);
  const dbg = words
    .filter((w) => w.y < 560 && (/[0-9]/.test(w.text) || /k/i.test(w.text)))
    .sort((a, b) => a.y - b.y);
  for (const w of dbg) {
    console.log(`  '${w.text}' x=${w.x} y=${w.y} w=${w.w} h=${w.h} conf=${Math.round(w.conf)}`);
  }
  const rescue = await createDigitRescuerNode(bytes);
  const res = await parseKillAnchoredRows(words, width, {
    rescueDigit: rescue,
    onDebug: (s, d) => {
      if (s === "blocks") console.log("BLOCKS:", JSON.stringify(d));
    },
  });
  console.log("lineH:", res.lineH, "bands:", res.bands, "strips:", res.strips);
  console.log("rowsY:", res.rows.slice(0, 12).join(","));
  console.log(
    "final:",
    res.blocks.map((b) => `r${b.rank}(read${b.rankRead})n${b.pairs.length}=${b.pairs.reduce((a, p) => a + p.value, 0)}`).join(" "),
  );
  process.exit(0);
})();
