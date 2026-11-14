// ============================================================
// Test fungsi murni AI OCR (tanpa jaringan/Firestore/browser).
// Jalankan: npx tsx scripts/test-ocr.ts
// ============================================================
import {
  normalizeTeamKey,
  levenshtein,
  similarity,
  bestTeamMatch,
  parseOcrSpaceText,
  sanitizeOcrRows,
} from "../src/lib/ocr";
import type { Team } from "../src/lib/types";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.error(`  FAIL ${name}`); }
}

const teams: Team[] = [
  { id: "t1", tournamentId: "bof", name: "REVENGE ESPORTS", tag: "RVS", number: 1, status: "active", captain: "SaputraGaming", roster: [{ nickname: "RVSxZeta" }], ocrAliases: ["TEAM REVNGE"] },
  { id: "t2", tournamentId: "bof", name: "ALPHA WOLF", tag: "AWF", number: 2, status: "active", captain: "BudiFF" },
  { id: "t3", tournamentId: "bof", name: "SMK TI BALI", tag: "STB", number: 3, status: "active" },
];

console.log("normalizeTeamKey:");
check("buang simbol & tag", normalizeTeamKey("•• TEAM REVENGE ••") === "REVENGE");
check("spasi ganda", normalizeTeamKey("  ALPHA   WOLF  ") === "ALPHAWOLF");
check("huruf kecil → besar", normalizeTeamKey("alpha wolf") === "ALPHAWOLF");
check("kosong", normalizeTeamKey("!!!") === "");
check("tag-only noise tetap ada isi", normalizeTeamKey("TEAM") !== "");

console.log("levenshtein:");
check("sama = 0", levenshtein("REVNGE", "REVNGE") === 0);
check("1 huruf beda = 1", levenshtein("REVNGE", "REVENGE") === 1);
check("kosong vs isi", levenshtein("", "AB") === 2);

console.log("similarity:");
check("identik = 1", similarity("REVENGE ESPORTS", "team revenge!!") === 1);
check("mirip ≥ 0.8", similarity("REVNGE", "REVENGE") >= 0.8);
check("beda total < 0.72", similarity("ZOMBIE X", "ALPHA WOLF") < 0.72);

console.log("bestTeamMatch:");
check("nama persis", bestTeamMatch("REVENGE ESPORTS", teams)?.teamId === "t1");
check("alias dari memori", bestTeamMatch("TEAM REVNGE", teams)?.teamId === "t1");
check("via tag", bestTeamMatch("AWF", teams)?.teamId === "t2");
check("via kapten", bestTeamMatch("BudiFF", teams)?.teamId === "t2");
check("via roster", bestTeamMatch("RVSxZeta", teams)?.teamId === "t1");
check("typo ringan cocok", bestTeamMatch("REVENGEE ESPORT", teams)?.teamId === "t1");
check("asing → null", bestTeamMatch("ZOMBIE SQUAD 99", teams) === null);
check("kosong → null", bestTeamMatch("", teams) === null);

console.log("sanitizeOcrRows:");
const raw = [
  { rank: "1", team: "TEAM REVNGE", teamId: "t1", kills: "12", points: "36", confidence: 0.95 },
  { teamRaw: "ALPHA WOLF", kills: null, rank: 2 },
  { teamRaw: "" }, // dibuang
  "bukan objek", // dibuang
  { teamRaw: "SMK TI BALI", rank: -3, kills: "abc" }, // angka kotor → null
];
const rows = sanitizeOcrRows(raw);
check("3 baris valid", rows.length === 3);
check("string angka dikonversi", rows[0].rank === 1 && rows[0].kills === 12 && rows[0].points === 36);
check("teamRaw fallback", rows[1].teamRaw === "ALPHA WOLF" && rows[1].rank === 2);
check("angka kotor → null", rows[2].rank === null && rows[2].kills === null);
check("confidence dijembatani 0..1", sanitizeOcrRows([{ teamRaw: "X", confidence: 5 }])[0].confidence === 1);

console.log("parseOcrSpaceText (fallback tanpa AI):");
const teks = [
  "BOOYAH!",
  "1 TEAM REVNGE 12 36",
  "2. ALPHA WOLF 8",
  "3) SMK TI BALI - 5",
  "Time 10:23",
  "",
].join("\n");
const parsed = parseOcrSpaceText(teks);
check("3 baris tim terbaca", parsed.length === 3);
check("rank baris 1", parsed[0].rank === 1 && parsed[0].teamRaw.toUpperCase().includes("REVNGE"));
check("kills terbaca (angka pertama ekor)", parsed[0].kills === 12);
check("poin terbaca (angka terakhir ekor)", parsed[0].points === 36);
check("kills tanpa poin", parsed[1].kills === 8 && parsed[1].points === null);
check("pemisah strip bersih", parsed[2].teamRaw === "SMK TI BALI" && parsed[2].kills === 5);
check("baris UI diabaikan", !parsed.some((r) => /booyah/i.test(r.teamRaw)));

console.log("parseOcrSpaceText — pola kolom terpisah (hasil nyata OCR.space):");
const teksKolom = [
  "BOOYAH!", "MATCH 3 - BERMUDA",
  "1 TEAM REVNGE", "12", "36",
  "2", "ALPHA WOLF", "28",
  "SMK TI BALI", "5", "20",
  "4", "ZOMBIE X", "4", "14",
  "KILLS", "POINTS",
].join("\n");
const kolom = parseOcrSpaceText(teksKolom);
check("4 tim terbaca", kolom.length === 4);
check("baris 1 lengkap", kolom[0].rank === 1 && kolom[0].kills === 12 && kolom[0].points === 36);
check("rank menempel baris berikut", kolom[1].teamRaw === "ALPHA WOLF" && kolom[1].rank === 2 && kolom[1].kills === 28);
check("tanpa rank tetap terbaca", kolom[2].teamRaw === "SMK TI BALI" && kolom[2].kills === 5 && kolom[2].points === 20);
check("rank sisa pindah ke baris baru", kolom[3].rank === 4 && kolom[3].kills === 4 && kolom[3].points === 14);

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
