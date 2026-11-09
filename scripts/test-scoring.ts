/**
 * Automated scoring tests (master prompt §41) — placement/kill/total,
 * tie-breaker, duplikasi placement, kill invalid, champion tracking.
 * Jalankan: npx tsx scripts/test-scoring.ts
 */
import assert from "node:assert/strict";
import {
  applyMovement, calcMatchResult, computeChampion, computeStandings,
  killPointsFor, placementPointsFor, validateResultEntries,
} from "../src/lib/scoring";
import { OFFICIAL_KILL_POINT, OFFICIAL_PLACEMENT_POINTS } from "../src/lib/constants";
import type { StandingsRow } from "../src/lib/types";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log("  ✓", name);
}

console.log("SCORING TESTS — mesin skor resmi BOF");

// --- Placement points ---
test("tabel placement resmi 12 nilai", () => {
  assert.deepEqual(OFFICIAL_PLACEMENT_POINTS, [20, 17, 15, 13, 12, 10, 6, 4, 3, 2, 1, 0]);
  OFFICIAL_PLACEMENT_POINTS.forEach((p, i) => assert.equal(placementPointsFor(i + 1), p));
});
test("placement di luar 1..12 bernilai 0 (kapasitas > 12 butuh konfigurasi)", () => {
  assert.equal(placementPointsFor(13), 0);
  assert.equal(placementPointsFor(0), 0);
});

// --- Kill points ---
test("kill points = kills x 2", () => {
  assert.equal(OFFICIAL_KILL_POINT, 2);
  assert.equal(killPointsFor(8), 16);
  assert.equal(killPointsFor(0), 0);
});

// --- calcMatchResult ---
test("contoh master prompt: placement 1 + 8 kill = 36", () => {
  const r = calcMatchResult("t1", "Tim A", 1, 8);
  assert.equal(r.placementPoints, 20);
  assert.equal(r.killPoints, 16);
  assert.equal(r.totalPoints, 36);
});
test("contoh master prompt: placement 2 + 5 kill = 27", () => {
  const r = calcMatchResult("t2", "Tim B", 2, 5);
  assert.equal(r.totalPoints, 27);
});

// --- Validasi entri ---
test("duplikasi placement ditolak", () => {
  const errs = validateResultEntries([
    { teamId: "a", teamName: "A", placement: 1, kills: 2 },
    { teamId: "b", teamName: "B", placement: 1, kills: 3 },
  ]);
  assert.ok(errs.some((e) => e.field === "placement"));
});
test("kill negatif ditolak", () => {
  const errs = validateResultEntries([
    { teamId: "a", teamName: "A", placement: 2, kills: -1 },
  ]);
  assert.ok(errs.some((e) => e.field === "kills"));
});
test("tim yang sama tak boleh muncul dua kali", () => {
  const errs = validateResultEntries([
    { teamId: "a", teamName: "A", placement: 1, kills: 1 },
    { teamId: "a", teamName: "A", placement: 2, kills: 2 },
  ]);
  assert.ok(errs.length > 0);
});

// --- computeStandings + tie-breaker ---
function row(partial: Partial<StandingsRow> & { teamId: string }): StandingsRow {
  return {
    teamName: partial.teamId.toUpperCase(), teamTag: "", teamNumber: 1, matchesPlayed: 1,
    kills: 0, placementPoints: 0, killPoints: 0, totalPoints: 0, lastPlacement: null,
    rank: 0, movement: "same", ...partial,
  } as StandingsRow;
}

test("urutan klasemen mengikuti total poin", () => {
  const rows = computeStandings([
    { teamId: "a", teamName: "A", teamTag: "", teamNumber: 1, placement: 3, kills: 0 },
    { teamId: "b", teamName: "B", teamTag: "", teamNumber: 2, placement: 1, kills: 0 },
    { teamId: "c", teamName: "C", teamTag: "", teamNumber: 3, placement: 2, kills: 0 },
  ]);
  assert.deepEqual(rows.map((r) => r.teamId), ["b", "c", "a"]);
});

test("tie total poin → placement points menang", () => {
  // a: rank2(17)+2k(4)=17 total? tidak — a: rank4(13)+2k(4)=17;
  // b: rank2(17)+0k=17 → total seri 17, placementPoints b=17 > a=13.
  const rows = computeStandings([
    { teamId: "a", teamName: "A", teamTag: "", teamNumber: 1, placement: 4, kills: 2 },
    { teamId: "b", teamName: "B", teamTag: "", teamNumber: 2, placement: 2, kills: 0 },
  ]);
  assert.equal(rows[0].totalPoints, rows[1].totalPoints);
  assert.equal(rows[0].teamId, "b");
  assert.equal(rows[1].teamId, "a");
});

test("tie total & placement points → placement game terakhir (BO7 game 7)", () => {
  const rows = computeStandings(
    [
      { teamId: "a", teamName: "A", teamTag: "", teamNumber: 1, placement: 1, kills: 0 },
      { teamId: "b", teamName: "B", teamTag: "", teamNumber: 2, placement: 1, kills: 0 },
    ],
    { b: 1, a: 2 }, // final game: b juara
  );
  assert.equal(rows[0].teamId, "b");
});

test("tie total & placement tanpa final placement → REVIEW MANUAL", () => {
  const rows = computeStandings([
    { teamId: "a", teamName: "A", teamTag: "", teamNumber: 1, placement: 1, kills: 0 },
    { teamId: "b", teamName: "B", teamTag: "", teamNumber: 2, placement: 1, kills: 0 },
  ]);
  assert.ok(rows[0].needsManualReview === true && rows[1].needsManualReview === true);
});

// --- applyMovement ---
test("applyMovement: naik/turun/tetap/baru + previousRank", () => {
  const prev = [row({ teamId: "x", rank: 1 }), row({ teamId: "y", rank: 2 })];
  const next = [row({ teamId: "y", rank: 1 }), row({ teamId: "x", rank: 2 }), row({ teamId: "z", rank: 3 })];
  const out = applyMovement(next, prev);
  assert.equal(out[0].movement, "up");
  assert.equal(out[1].movement, "down");
  assert.equal(out[2].movement, "new");
  assert.equal(out[1].previousRank, 1);
});

// --- computeChampion (§30) ---
test("champion NOT CONFIRMED saat masih ada match tersisa", () => {
  const standings = [row({ teamId: "a", rank: 1, totalPoints: 50 }), row({ teamId: "b", rank: 2, totalPoints: 40 })];
  const c = computeChampion(standings, 7, 3);
  assert.equal(c.confirmed, false);
  assert.equal(c.remainingMatches, 4);
  assert.equal(c.candidate?.teamId, "a");
});
test("champion CONFIRMED saat semua match selesai & tidak seri", () => {
  const standings = [
    row({ teamId: "a", rank: 1, totalPoints: 90 }),
    row({ teamId: "b", rank: 2, totalPoints: 40 }),
  ];
  const c = computeChampion(standings, 7, 7);
  assert.equal(c.confirmed, true);
  assert.equal(c.gap, 50);
});
test("champion seri puncak → NOT CONFIRMED + possibleTie", () => {
  const standings = [
    row({ teamId: "a", rank: 1, totalPoints: 90, placementPoints: 60 }),
    row({ teamId: "b", rank: 2, totalPoints: 90, placementPoints: 60 }),
  ];
  const c = computeChampion(standings, 7, 7);
  assert.equal(c.confirmed, false);
  assert.equal(c.possibleTie, true);
});

console.log(`\n✅ SEMUA SCORING TESTS PASS (${passed} test)`);
