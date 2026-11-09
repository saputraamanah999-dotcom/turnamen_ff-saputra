#!/usr/bin/env node
// ============================================================
// STIKAR ESPORTS — Deploy Firestore RULES + INDEXES via REST
// (tanpa firebase-tools CLI; cukup service account)
// ============================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SERVICE_ACCOUNT_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || resolve(process.cwd(), "../secrets/serviceAccountKey.json");
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "turnamenffbof";

const serviceAccount = JSON.parse(readFileSync(resolve(SERVICE_ACCOUNT_PATH), "utf8"));
const rulesSource = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");
const indexes = JSON.parse(readFileSync(resolve(process.cwd(), "firestore.indexes.json"), "utf8"));

// --- Auth token via JWT signing (google-auth-library, tersedia via firebase-admin deps) ---
const { JWT } = await import("google-auth-library");
const client = new JWT({
  email: serviceAccount.client_email,
  key: serviceAccount.private_key,
  scopes: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/datastore",
    "https://www.googleapis.com/auth/firebase",
  ],
});
const tokens = await client.getAccessToken();
const token = tokens.token;
if (!token) throw new Error("Gagal mendapat access token");

const H = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

const BASE = `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}`;
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)`;

// ---------- 1. Ruleset ----------
console.log("[1/3] Membuat ruleset…");
const rsRes = await fetch(`${BASE}/rulesets`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    source: { files: [{ name: "firestore.rules", content: rulesSource }] },
  }),
});
const rsJson = await rsRes.json();
if (!rsRes.ok) throw new Error(`Ruleset gagal: ${rsRes.status} ${JSON.stringify(rsJson).slice(0, 300)}`);
const rulesetName = rsJson.name;
console.log(`      OK → ${rulesetName}`);

// ---------- 2. Release cloud.firestore ----------
console.log("[2/3] Mengaitkan release cloud.firestore…");
const releaseId = "cloud.firestore";
const releaseName = `${BASE}/releases/${releaseId}`;
const relGet = await fetch(releaseName, { headers: H });
if (relGet.ok) {
  // Body sesuai schema UpdateReleaseRequest: { release: {...}, updateMask? }
  const upd = await fetch(`${releaseName}?updateMask=rulesetName`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ release: { name: `projects/${PROJECT_ID}/releases/${releaseId}`, rulesetName } }),
  });
  if (!upd.ok) throw new Error(`Release update gagal: ${upd.status} ${(await upd.text()).slice(0, 500)}`);
  console.log("      OK → release diperbarui");
} else {
  const create = await fetch(`${BASE}/releases`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ release: { name: releaseName, rulesetName } }),
  });
  if (!create.ok) throw new Error(`Release create gagal: ${create.status} ${(await create.text()).slice(0, 500)}`);
  console.log("      OK → release dibuat");
}

// ---------- 3. Indexes ----------
console.log("[3/3] Membuat composite indexes…");
for (const idx of indexes.indexes) {
  const url = `${FS}/collectionGroups/${idx.collectionGroup}/indexes`;
  const body = {
    queryScope: idx.queryScope,
    fields: idx.fields.map((f) => ({ fieldPath: f.fieldPath, order: f.order })),
  };
  const res = await fetch(url, { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (res.ok) {
    console.log(`      OK  ${idx.collectionGroup}: ${idx.fields.map((f) => f.fieldPath).join(",")}`);
  } else if (res.status === 409) {
    console.log(`      SKIP (sudah ada) ${idx.collectionGroup}`);
  } else {
    console.log(`      WARN ${res.status} ${JSON.stringify(j).slice(0, 160)} — ${idx.collectionGroup}`);
  }
}

console.log("\n✅ Rules + index request selesai. Index butuh beberapa menit untuk BUILD di Firebase.\n");
