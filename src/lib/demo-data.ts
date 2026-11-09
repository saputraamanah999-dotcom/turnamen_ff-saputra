// ============================================================
// ZEROID ESPORTS — DATA DEMO (fallback offline)
// Digunakan HANYA ketika Firestore tidak terjangkau dari browser
// (koneksi gagal / project belum di-seed). Selalu ditampilkan
// dengan banner "MODE DEMO". Bukan data resmi turnamen.
// ============================================================

import { computeStandings } from "./scoring";
import type {
  Match,
  PublicLeaderboard,
  Team,
  Tournament,
} from "./types";

export const DEMO_TOURNAMENT_ID = "bof-main";

export const demoTournament: Tournament = {
  id: DEMO_TOURNAMENT_ID,
  name: "BATTLE OFF FRIENDS",
  shortName: "BOF",
  institution: "SMK TI BALI GLOBAL KARANGASEM",
  developer: "SAPUTRA DEVELOPER",
  status: "active",
  format: "BO7",
  totalMatches: 7,
  teamCapacity: 12,
  currentMatchId: "match-04",
  liveStatus: "offline",
  scoringVersion: "BOF-OFFICIAL-v1",
};

export const demoTeams: Team[] = [
  { id: "t01", tournamentId: DEMO_TOURNAMENT_ID, name: "Team Alpha", tag: "ALP", number: 1, status: "active" },
  { id: "t02", tournamentId: DEMO_TOURNAMENT_ID, name: "Team Bravo", tag: "BRV", number: 2, status: "active" },
  { id: "t03", tournamentId: DEMO_TOURNAMENT_ID, name: "Team Charlie", tag: "CHL", number: 3, status: "active" },
  { id: "t04", tournamentId: DEMO_TOURNAMENT_ID, name: "Team Delta", tag: "DLT", number: 4, status: "active" },
  { id: "t05", tournamentId: DEMO_TOURNAMENT_ID, name: "Team Echo", tag: "ECH", number: 5, status: "active" },
  { id: "t06", tournamentId: DEMO_TOURNAMENT_ID, name: "Team Foxtrot", tag: "FXT", number: 6, status: "active" },
  { id: "t07", tournamentId: DEMO_TOURNAMENT_ID, name: "Team Golf", tag: "GLF", number: 7, status: "active" },
  { id: "t08", tournamentId: DEMO_TOURNAMENT_ID, name: "Team Hotel", tag: "HTL", number: 8, status: "active" },
  { id: "t09", tournamentId: DEMO_TOURNAMENT_ID, name: "Team India", tag: "IND", number: 9, status: "active" },
  { id: "t10", tournamentId: DEMO_TOURNAMENT_ID, name: "Team Juliet", tag: "JLT", number: 10, status: "active" },
  { id: "t11", tournamentId: DEMO_TOURNAMENT_ID, name: "Team Kilo", tag: "KLO", number: 11, status: "active" },
  { id: "t12", tournamentId: DEMO_TOURNAMENT_ID, name: "Team Lima", tag: "LMA", number: 12, status: "active" },
];

// Hasil 3 match "sudah dipublikasikan" untuk demo.
const match1Results: [string, number, number][] = [
  ["t01", 1, 8], ["t02", 2, 5], ["t03", 3, 7], ["t04", 4, 3], ["t05", 5, 6],
  ["t06", 6, 2], ["t07", 7, 4], ["t08", 8, 1], ["t09", 9, 3], ["t10", 10, 0],
  ["t11", 11, 2], ["t12", 12, 1],
];
const match2Results: [string, number, number][] = [
  ["t05", 1, 9], ["t01", 2, 6], ["t09", 3, 5], ["t03", 4, 4], ["t07", 5, 5],
  ["t02", 6, 3], ["t12", 7, 4], ["t04", 8, 2], ["t06", 9, 2], ["t08", 10, 1],
  ["t10", 11, 1], ["t11", 12, 0],
];
const match3Results: [string, number, number][] = [
  ["t03", 1, 10], ["t01", 3, 7], ["t02", 2, 6], ["t05", 4, 5], ["t09", 5, 6],
  ["t07", 6, 3], ["t06", 7, 4], ["t12", 8, 3], ["t04", 9, 2], ["t11", 10, 1],
  ["t08", 11, 1], ["t10", 12, 0],
];

function accumFrom(results: [string, number, number][]) {
  return results.map(([teamId, placement, kills]) => {
    const team = demoTeams.find((t) => t.id === teamId)!;
    return {
      teamId,
      teamName: team.name,
      teamTag: team.tag,
      teamNumber: team.number,
      placement,
      kills,
    };
  });
}

export const demoMatches: Match[] = [
  { id: "match-01", tournamentId: DEMO_TOURNAMENT_ID, matchNumber: 1, map: "BERMUDA", format: "BO7", status: "completed", isCurrent: false, resultsPublished: true, scoringVersion: "BOF-OFFICIAL-v1" },
  { id: "match-02", tournamentId: DEMO_TOURNAMENT_ID, matchNumber: 2, map: "PURGATORY", format: "BO7", status: "completed", isCurrent: false, resultsPublished: true, scoringVersion: "BOF-OFFICIAL-v1" },
  { id: "match-03", tournamentId: DEMO_TOURNAMENT_ID, matchNumber: 3, map: "KALAHARI", format: "BO7", status: "completed", isCurrent: false, resultsPublished: true, scoringVersion: "BOF-OFFICIAL-v1" },
  { id: "match-04", tournamentId: DEMO_TOURNAMENT_ID, matchNumber: 4, map: "ALPINE", format: "BO7", status: "live", isCurrent: true, resultsPublished: false, scoringVersion: "BOF-OFFICIAL-v1" },
  { id: "match-05", tournamentId: DEMO_TOURNAMENT_ID, matchNumber: 5, map: "NEXTERRA", format: "BO7", status: "scheduled", isCurrent: false, resultsPublished: false, scoringVersion: "BOF-OFFICIAL-v1" },
  { id: "match-06", tournamentId: DEMO_TOURNAMENT_ID, matchNumber: 6, map: "BERMUDA", format: "BO7", status: "scheduled", isCurrent: false, resultsPublished: false, scoringVersion: "BOF-OFFICIAL-v1" },
  { id: "match-07", tournamentId: DEMO_TOURNAMENT_ID, matchNumber: 7, map: "PURGATORY", format: "BO7", status: "scheduled", isCurrent: false, resultsPublished: false, scoringVersion: "BOF-OFFICIAL-v1" },
];

export const demoLeaderboard: PublicLeaderboard = (() => {
  const standings = computeStandings([
    ...accumFrom(match1Results),
    ...accumFrom(match2Results),
    ...accumFrom(match3Results),
  ]);
  return {
    tournamentId: DEMO_TOURNAMENT_ID,
    standings,
    publishedMatchCount: 3,
    totalKills: standings.reduce((a, r) => a + r.kills, 0),
    scoringVersion: "BOF-OFFICIAL-v1",
    updatedAt: Date.now(),
  };
})();
