// ============================================================
// UJI OCR v4 — papan skor sintetis + unit test rank/merge.
// Jalankan: npx tsx scripts/test-ocr-synth.ts
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { runOcrPipeline } from "../src/lib/ocr-engine";
import { assignFinalRanks, mergeBlocks, type KillBlock } from "../src/lib/ocr-rows";

const FIXTURE = path.join(process.cwd(), "scripts", "fixtures");
const EXPECT_TOTAL: Record<number, number> = { 1: 19, 2: 18, 3: 15, 4: 5, 5: 11, 6: 10, 7: 4, 8: 2, 9: 3, 10: 1 };

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  PASS ${name} ${extra}`); }
  else { fail++; console.error(`  FAIL ${name} ${extra}`); }
}

function block(rankRead: number | null, rank: number, y: number, vals: number[], stripX: number | null, halfIdx?: number): KillBlock {
  const x0 = stripX !== null ? stripX + 300 : 340;
  return {
    rankRead, rank,
    pairs: vals.map((v, i) => ({ value: v, cx: x0, cy: y + i * 34, h: 24, conf: 90, rescued: true })),
    stripX,
    flags: [],
    ordY: y,
    halfIdx,
  };
}

async function ocrCase(file: string, label: string, expectedTeams = 10) {
  console.log(`\n=== ${label} (${file}, target ${expectedTeams} tim) ===`);
  const bytes = fs.readFileSync(path.join(FIXTURE, file));
  const t0 = Date.now();
  const res = await runOcrPipeline({
    imageUrl: `file://${file}`,
    expectedTeams,
    fetchImage: async () => bytes,
  });
  console.log(`  ${Date.now() - t0}ms · ${res.rows.length} baris · ${res.notes}`);
  const byRank = new Map(res.rows.map((r) => [r.rank ?? -1, r]));
  const ranks = res.rows.map((r) => r.rank ?? -1).sort((a, b) => a - b);
  const dupes = ranks.filter((r, i) => ranks.indexOf(r) !== i);
  check("10 baris terbaca", res.rows.length === 10, `(${res.rows.length})`);
  check("rank unik 1..10 tanpa ganda", dupes.length === 0 && ranks.join(",") === "1,2,3,4,5,6,7,8,9,10", `(${ranks.join(",")}) dup=${dupes.join(",")}`);
  for (const [r, total] of Object.entries(EXPECT_TOTAL)) {
    const row = byRank.get(Number(r));
    check(`Top #${r} = ${total}`, row?.kills === total, `(${row?.kills ?? "-"})`);
  }
}

async function unitTests() {
  console.log("\n=== UNIT — assignFinalRanks (aturan badge + bebas ganda) ===");
  // Kasus nyata: badge top-6 tak terbaca → DULU jadi "rank 1" ganda.
  // Blok tanpa badge berada di ANTARA top 5 (y=700) dan top 7 (y=800).
  const kasus: KillBlock[] = [
    block(1, 0, 100, [3, 6, 5, 5], 40, 0),
    block(2, 0, 244, [9, 1, 4, 4], 40, 0),
    block(3, 0, 388, [4, 3, 4, 4], 40, 0),
    block(4, 0, 532, [1, 1, 2, 1], 40, 0),
    block(5, 0, 676, [3, 2, 4, 2], 40, 0),
    block(null, 0, 748, [2, 3, 3, 2], null, 0), // top 6 tanpa badge
    block(7, 0, 820, [1, 1, 1, 1], 40, 0),
    block(8, 0, 964, [1, 0, 1, 0], 40, 0),
    block(9, 0, 1108, [1, 1, 1, 0], 40, 0),
    block(10, 0, 1252, [0, 1, 0, 0], 40, 0),
  ];
  assignFinalRanks(kasus, 760);
  const ranks = kasus.map((b) => b.rank).sort((a, b) => a - b);
  const top6 = kasus.find((b) => b.rankRead === null)!;
  check("rank unik 1..10", ranks.join(",") === "1,2,3,4,5,6,7,8,9,10", `(${ranks.join(",")})`);
  check("blok tanpa badge mendapat rank 6 (bukan 1 ganda)", top6.rank === 6, `(rank=${top6.rank})`);

  console.log("\n=== UNIT — assignFinalRanks dua kolom (kolom-major) ===");
  const dua: KillBlock[] = [];
  for (let i = 0; i < 5; i++) dua.push(block(i + 1, 0, 100 + i * 194, [1, 1, 1, 1], 40, 0));
  for (let i = 0; i < 5; i++) dua.push(block(i + 6, 0, 100 + i * 194, [1, 1, 1, 1], 760, 1));
  // badge kolom kanan rusak semua → harus lanjut 6..10 dari urutan
  for (const b of dua.slice(5)) { b.rankRead = null; }
  assignFinalRanks(dua, 1440);
  const kanan = dua.slice(5).map((b) => b.rank).sort((a, b) => a - b);
  check("kolom kanan otomatis 6..10", kanan.join(",") === "6,7,8,9,10", `(${kanan.join(",")})`);

  console.log("\n=== UNIT — mergeBlocks (recovery per-paruh) ===");
  const utama = [block(1, 1, 100, [3, 6, 5, 5], 40), block(2, 2, 294, [9, 1, 4, 4], 40)];
  const paruh = [
    block(2, 2, 294, [9, 1], 40),            // duplikat lebih miskin → buang
    block(null, 0, 488, [2, 3, 3, 2], null), // baris yang tadinya hilang
  ];
  const gabung = mergeBlocks(utama, paruh, 24);
  check("merge: 3 blok (duplikat dibuang, baris baru masuk)", gabung.length === 3, `(${gabung.length})`);
  const richer = gabung.find((b) => b.rankRead === 2);
  check("merge: blok terkaya yang dipertahankan (4 sel)", richer?.pairs.length === 4, `(${richer?.pairs.length})`);
  assignFinalRanks(gabung, 760);
  const granks = gabung.map((b) => b.rank).sort((a, b) => a - b);
  check("merge: rank final 1..3", granks.join(",") === "1,2,3", `(${granks.join(",")})`);
}

async function main() {
  await unitTests();
  await ocrCase("synth-1col.png", "E2E SATU KOLOM — 10 tim, total kill benar");
  await ocrCase("synth-2col.png", "E2E DUA KOLOM — 10 tim (5+5)");
  await ocrCase("synth-badge6-dark.png", "E2E BADGE 6 SAMAR — replikasi bug rank-1-ganda");
  // Paksa jalur recovery: target 12 padahal gambarnya 10 tim → recovery
  // per-paruh berjalan, hasil merge TETAP 10 baris unik (duplikat dibuang).
  await ocrCase("synth-1col.png", "E2E RECOVERY DIPAKSA — target 12, hasil tetap 10 unik", 12);
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
