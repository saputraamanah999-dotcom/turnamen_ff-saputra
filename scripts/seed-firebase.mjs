#!/usr/bin/env node
// ============================================================
// ZEROID ESPORTS — Script Seeding Firebase (Battle Off Friends)
// 1. Membuat akun super admin (Firebase Auth) + adminRoles/{uid}
// 2. Konfigurasi poin resmi BOF (scoringConfigurations)
// 3. Turnamen bof-main + 12 tim + 7 match
// 4. Hasil 3 match pertama dipublikasikan + klasemen publik
// 5. broadcastSettings + audit log seed
//
// Pakai: node scripts/seed-firebase.mjs
// Wajib: file service account (GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_SERVICE_ACCOUNT_PATH)
//        ADMIN_EMAIL & ADMIN_PASSWORD (opsional, ada default aman di .env)
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ---------- Muat env dari root project ----------
function loadDotEnv() {
  const candidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../.env")];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
    break;
  }
}
loadDotEnv();

const SERVICE_ACCOUNT_PATH =
  process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "./secrets/serviceAccountKey.json";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "saputra.developer@bof-esports.id";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ZeroidBOF#2026";
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "turnamenffbof";
const TOURNAMENT_ID = "bof-main";

// ---------- Sistem poin resmi BOF (identik dengan src/lib/scoring.ts) ----------
const PLACEMENT_POINTS = [20, 17, 15, 13, 12, 10, 6, 4, 3, 2, 1, 0];
const KILL_POINT = 2;
const SCORING_VERSION = "BOF-OFFICIAL-v1";

const placementPointsFor = (p) => (p >= 1 && p <= PLACEMENT_POINTS.length ? PLACEMENT_POINTS[p - 1] : 0);
const calc = (placement, kills) => placementPointsFor(placement) + kills * KILL_POINT;

// ---------- Data awal ----------
const TEAMS = [
  ["t01", "Team Alpha", "ALP"], ["t02", "Team Bravo", "BRV"], ["t03", "Team Charlie", "CHL"],
  ["t04", "Team Delta", "DLT"], ["t05", "Team Echo", "ECH"], ["t06", "Team Foxtrot", "FXT"],
  ["t07", "Team Golf", "GLF"], ["t08", "Team Hotel", "HTL"], ["t09", "Team India", "IND"],
  ["t10", "Team Juliet", "JLT"], ["t11", "Team Kilo", "KLO"], ["t12", "Team Lima", "LMA"],
];

const MAPS = ["BERMUDA", "PURGATORY", "KALAHARI", "ALPINE", "NEXTERRA", "BERMUDA", "PURGATORY"];

// Hasil resmi 3 match pertama [teamId, placement, kills]
const RESULTS = {
  "match-01": [["t01", 1, 8], ["t02", 2, 5], ["t03", 3, 7], ["t04", 4, 3], ["t05", 5, 6], ["t06", 6, 2], ["t07", 7, 4], ["t08", 8, 1], ["t09", 9, 3], ["t10", 10, 0], ["t11", 11, 2], ["t12", 12, 1]],
  "match-02": [["t05", 1, 9], ["t01", 2, 6], ["t09", 3, 5], ["t03", 4, 4], ["t07", 5, 5], ["t02", 6, 3], ["t12", 7, 4], ["t04", 8, 2], ["t06", 9, 2], ["t08", 10, 1], ["t10", 11, 1], ["t11", 12, 0]],
  "match-03": [["t03", 1, 10], ["t02", 2, 6], ["t01", 3, 7], ["t05", 4, 5], ["t09", 5, 6], ["t07", 6, 3], ["t06", 7, 4], ["t12", 8, 3], ["t04", 9, 2], ["t11", 10, 1], ["t08", 11, 1], ["t10", 12, 0]],
};

async function main() {
  const path = resolve(SERVICE_ACCOUNT_PATH);
  if (!existsSync(path)) {
    console.error(`\n[ERROR] Service account tidak ditemukan di: ${path}`);
    console.error("Simpan file JSON service account Firebase, lalu set FIREBASE_SERVICE_ACCOUNT_PATH di .env\n");
    process.exit(1);
  }

  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");

  const serviceAccount = JSON.parse(readFileSync(path, "utf8"));
  initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
  const auth = getAuth();
  const db = getFirestore();

  console.log(`\n=== ZEROID ESPORTS — Seeding project: ${PROJECT_ID} ===\n`);

  // 1. Super admin
  let uid;
  try {
    const user = await auth.getUserByEmail(ADMIN_EMAIL);
    uid = user.uid;
    console.log(`[1/6] Super admin sudah ada: ${ADMIN_EMAIL} (${uid})`);
  } catch {
    const user = await auth.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      displayName: "Super Admin ZEROID",
    });
    uid = user.uid;
    console.log(`[1/6] Super admin dibuat: ${ADMIN_EMAIL} (password dari ADMIN_PASSWORD)`);
  }
  await db.doc(`adminRoles/${uid}`).set({
    uid,
    email: ADMIN_EMAIL,
    role: "superadmin",
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  // 2. Konfigurasi poin resmi
  await db.doc("scoringConfigurations/bof-official-v1").set({
    placementPoints: PLACEMENT_POINTS,
    killPointPerKill: KILL_POINT,
    version: SCORING_VERSION,
    isOfficial: true,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log("[2/6] Konfigurasi poin resmi BOF siap (kill = 2 poin)");

  // 3. Turnamen
  await db.doc(`tournaments/${TOURNAMENT_ID}`).set({
    id: TOURNAMENT_ID,
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
    scoringVersion: SCORING_VERSION,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  // 4. Tim
  for (const [id, name, tag] of TEAMS) {
    const number = Number(id.slice(1));
    await db.doc(`tournaments/${TOURNAMENT_ID}/teams/${id}`).set({
      id, tournamentId: TOURNAMENT_ID, name, tag, number, status: "active",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  console.log("[3/6] Turnamen bof-main + 12 tim terdaftar");

  // 5. Match
  for (let i = 1; i <= 7; i++) {
    const id = `match-0${i}`;
    const published = RESULTS[id] != null;
    await db.doc(`tournaments/${TOURNAMENT_ID}/matches/${id}`).set({
      id, tournamentId: TOURNAMENT_ID, matchNumber: i, map: MAPS[i - 1], format: "BO7",
      status: published ? "completed" : i === 4 ? "live" : "scheduled",
      isCurrent: i === 4,
      resultsPublished: published,
      scoringVersion: SCORING_VERSION,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    if (published) {
      for (const [teamId, placement, kills] of RESULTS[id]) {
        const team = TEAMS.find((t) => t[0] === teamId);
        await db.doc(`tournaments/${TOURNAMENT_ID}/matches/${id}/results/${teamId}`).set({
          teamId, teamName: team[1], teamTag: team[2], placement, kills,
          placementPoints: placementPointsFor(placement),
          killPoints: kills * KILL_POINT,
          totalPoints: calc(placement, kills),
        }, { merge: true });
      }
    }
  }
  console.log("[4/6] 7 match dibuat — 3 match pertama hasil resmi dipublikasikan");

  // 6. Klasemen publik (akumulasi seluruh hasil yang dipublikasikan)
  const accum = new Map();
  for (const list of Object.values(RESULTS)) {
    for (const [teamId, placement, kills] of list) {
      const team = TEAMS.find((t) => t[0] === teamId);
      const cur = accum.get(teamId) ?? {
        teamId, teamName: team[1], teamTag: team[2], teamNumber: Number(teamId.slice(1)),
        matchesPlayed: 0, kills: 0, placementPoints: 0, killPoints: 0, totalPoints: 0,
      };
      cur.matchesPlayed += 1;
      cur.kills += kills;
      cur.placementPoints += placementPointsFor(placement);
      cur.killPoints += kills * KILL_POINT;
      cur.totalPoints = cur.placementPoints + cur.killPoints;
      accum.set(teamId, cur);
    }
  }
  const standings = [...accum.values()]
    .sort((a, b) => b.totalPoints - a.totalPoints || b.placementPoints - a.placementPoints || a.teamNumber - b.teamNumber)
    .map((r, i) => ({ ...r, lastPlacement: null, rank: i + 1, movement: "same" }));

  await db.doc(`publicLeaderboards/${TOURNAMENT_ID}`).set({
    tournamentId: TOURNAMENT_ID,
    standings,
    publishedMatchCount: Object.keys(RESULTS).length,
    totalKills: standings.reduce((a, r) => a + r.kills, 0),
    scoringVersion: SCORING_VERSION,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`[5/6] Klasemen publik dihitung (${standings.length} tim, ${Object.keys(RESULTS).length} match)`);

  // 7. Broadcast settings + audit log
  await db.doc(`broadcastSettings/${TOURNAMENT_ID}`).set({
    tournamentId: TOURNAMENT_ID,
    streamMode: "offline",
    streamTitle: "BATTLE OFF FRIENDS — Siaran Resmi",
    showPublicTimeline: true,
    announcements: ["Selamat datang di BATTLE OFF FRIENDS — SMK TI Bali Global Karangasem!"],
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db.collection("auditLogs").add({
    action: "SEED_DATABASE",
    actorUid: "system",
    actorEmail: "system@zeroid",
    targetType: "database",
    targetId: TOURNAMENT_ID,
    details: { teams: TEAMS.length, matches: 7, published: Object.keys(RESULTS).length },
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log("[6/6] Broadcast settings + audit log seed selesai");

  console.log(`
✅ SEEDING BERHASIL!
   Email admin : ${ADMIN_EMAIL}
   Password    : (lihat ADMIN_PASSWORD di .env) — GANTI setelah login pertama!
   Halaman     : /admin  |  /live/${TOURNAMENT_ID}  |  /overlay/${TOURNAMENT_ID}/compact
`);
  process.exit(0);
}

main().catch((e) => {
  console.error("\n❌ Seeding gagal:", e.message ?? e);
  process.exit(1);
});
