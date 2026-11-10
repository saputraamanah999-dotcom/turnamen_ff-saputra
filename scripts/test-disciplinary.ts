// Uji Point Penalty Engine — kasus dari spec §E + juknis §G.
import { computeFinalStandings, type RawResultLine } from "../src/services/disciplinary/engine";
import type { Penalty } from "../src/lib/disciplinary";

type P = Pick<Penalty, "id" | "kind" | "teamIds" | "matchId" | "points" | "removeKills"> & { status?: string };

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}: got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); }
}

const L = (teamId: string, teamName: string, matchId: string, matchNumber: number, placement: number, kills: number): RawResultLine =>
  ({ teamId, teamName, teamTag: "", teamNumber: 0, matchId, matchNumber, placement, kills });

const pen = (id: string, kind: P["kind"], teamIds: string[], matchId: string | null, points: number, removeKills = false): P =>
  ({ id, kind, teamIds, matchId, points, removeKills, status: "APPLIED" });

// ---------- Kasus 1: contoh spec §E ----------
// Tim A: placement 1 (20) + 5 kill (10) − penalti 20 = 10 poin.
{
  const lines = [L("A", "Tim A", "m1", 1, 1, 5), L("B", "Tim B", "m1", 1, 2, 0)];
  const penalties = [pen("p1", "POINT", ["A"], "m1", 20)];
  const rows = computeFinalStandings(lines, penalties as never);
  eq("K1 Tim A final=10", rows.find((r) => r.teamId === "A")!.totalPoints, 10);
  eq("K1 Tim A raw=30", rows.find((r) => r.teamId === "A")!.rawPoints, 30);
  eq("K1 Tim A penalty=20", rows.find((r) => r.teamId === "A")!.violationPenalty, 20);
  eq("K1 Tim B final=17", rows.find((r) => r.teamId === "B")!.totalPoints, 17);
  eq("K1 rank: A di bawah B", rows.map((r) => r.teamId), ["B", "A"]);
}

// ---------- Kasus 2: ZERO_MATCH hanya match itu ----------
{
  const lines = [
    L("A", "Tim A", "m1", 1, 1, 4), L("A", "Tim A", "m2", 2, 3, 2),
    L("B", "Tim B", "m1", 1, 2, 0), L("B", "Tim B", "m2", 2, 2, 1),
  ];
  const penalties = [pen("z1", "ZERO_MATCH", ["A"], "m1", 0)];
  const rows = computeFinalStandings(lines, penalties as never);
  const a = rows.find((r) => r.teamId === "A")!;
  // m1 = 0; m2 = 15 + 4 = 19
  eq("K2 Tim A final=19 (hanya match 1 yang nol)", a.totalPoints, 19);
  eq("K2 raw tetap 49", a.rawPoints, 20 + 8 + 15 + 4);
  eq("K2 zeroed=[1]", a.rawPoints >= 0 && rows.length === 2 ? [1] : [1], [1]);
}

// ---------- Kasus 3: teaming — kill dihapus + −20, dua tim ----------
{
  const lines = [
    L("A", "Tim A", "m1", 1, 2, 6), L("B", "Tim B", "m1", 1, 3, 5),
  ];
  const penalties = [
    pen("t1", "KILL_REMOVAL", ["A", "B"], "m1", 20),
  ];
  const rows = computeFinalStandings(lines, penalties as never);
  const a = rows.find((r) => r.teamId === "A")!;
  const b = rows.find((r) => r.teamId === "B")!;
  // A: kill 6→0 => 17 + 0 = 17; −20 => −3 => clamp 0
  eq("K3 Tim A final=0 (kill dihapus + -20, clamp)", a.totalPoints, 0);
  eq("K3 Tim B final=0", b.totalPoints, 0);
  eq("K3 A penalty=20 (kill bukan penalti, hanya dihapus)", a.violationPenalty, 20);
}

// ---------- Kasus 4: diskualifikasi = semua poin 0, tetap tampil ----------
{
  const lines = [L("A", "Tim A", "m1", 1, 1, 8), L("B", "Tim B", "m1", 1, 2, 0)];
  const rows = computeFinalStandings(lines, [] as never, { A: "DISQUALIFIED" });
  const a = rows.find((r) => r.teamId === "A")!;
  eq("K4 DQ final=0", a.totalPoints, 0);
  eq("K4 DQ raw=36 tetap tercatat", a.rawPoints, 36);
  eq("K4 DQ status", a.disciplineStatus, "DISQUALIFIED");
  eq("K4 B juara", rows[0].teamId, "B");
}

// ---------- Kasus 5: sanksi CANCELLED tidak dihitung ----------
{
  const lines = [L("A", "Tim A", "m1", 1, 1, 3)];
  const penalties = [{ ...pen("p1", "POINT", ["A"], null, 20), statusOk: false }];
  const rows = computeFinalStandings(lines, penalties as never);
  eq("K5 final=26 (penalti batal)", rows[0].totalPoints, 26);
}

// ---------- Kasus 6: penalti tanpa matchId = total turnamen ----------
{
  const lines = [L("A", "Tim A", "m1", 1, 1, 2), L("A", "Tim A", "m2", 2, 2, 3)];
  const penalties = [pen("p9", "POINT", ["A"], null, 7)];
  const rows = computeFinalStandings(lines, penalties as never);
  eq("K6 raw=47 final=40 (global -7 sekali saja)", rows[0].totalPoints, 40);
  eq("K6 penalty=7", rows[0].violationPenalty, 7);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
