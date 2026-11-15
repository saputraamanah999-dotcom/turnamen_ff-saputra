// Uji singkat: analyzeBlocks TANPA tim terdaftar (mode tanpa kapten/roster)
// + blok dengan sebagian kill tak terbaca → baris tetap muncul + needsReview.
import { analyzeBlocks, blocksToRows, type ParsedBlock } from "../src/lib/ocr-engine";

const blocks: ParsedBlock[] = [
  {
    rank: 1,
    members: [
      { name: "aangtzc", kills: 3 },
      { name: "U.Dogss", kills: 6 },
      { name: "Nuglieeie", kills: 5 },
      { name: "Nuglieeie", kills: 5 },
    ],
  },
  {
    rank: 2,
    members: [
      { name: "FJ Hanz", kills: 4 },
      { name: "FJ Yokz", kills: null, killHint: { x: 0, y: 0, w: 10, h: 10, kind: "zone" } },
      { name: "FJ Jesica", kills: 2 },
    ],
  },
];

async function main() {
  const rows = blocksToRows(blocks);
  console.log("blocksToRows:");
  for (const r of rows) {
    console.log(
      `#${r.rank} kills=${r.kills} conf=${r.confidence} rincian=${(r.memberKills ?? []).map((m) => `${m.name}:${m.kills}`).join("+")}`,
    );
  }
  const sum1 = (rows[0].memberKills ?? []).reduce((a, m) => a + (m.kills ?? 0), 0);
  console.log(`validasi penjumlahan top1: ${sum1} (harus 19) → ${sum1 === 19 ? "OK" : "GAGAL"}`);

  const res = await analyzeBlocks({ blocks, teams: [], settings: {}, jereApiKey: "" });
  console.log("\nanalyzeBlocks (teams=[] → mode tanpa kapten):");
  console.log("source:", res.source, "| needsReview:", res.needsReview);
  console.log("notes:", res.notes);
  for (const r of res.rows) {
    console.log(`#${r.rank} kills=${r.kills} teamId=${r.teamId} teamRaw="${r.teamRaw.slice(0, 40)}"`);
  }
  const ok = res.rows.length === 2 && res.rows.every((r) => r.teamId === null) && res.needsReview === true;
  console.log(ok ? "\nSEMUANYA SESUAI (baris tetap ada, tunggu pilihan manual admin) ✓" : "\nADA YANG TIDAK SESUAI ✗");
}

main();
