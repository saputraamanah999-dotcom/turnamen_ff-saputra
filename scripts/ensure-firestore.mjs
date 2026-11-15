// ============================================================
// BOF — Verifikasi & penyiapan Firestore via service account:
//  1. Autentikasi + daftar koleksi yang SUDAH ada (bukti nyata).
//  2. Pastikan dokumen settings/ocr ada (nilai bawaan mesin AI OCR)
//     — koleksi lain dibuat otomatis Firestore saat penulisan pertama;
//     rules-nya sudah mencakup semuanya (dicek terpisah).
// ============================================================
import { readFileSync } from "node:fs";
const sa = JSON.parse(readFileSync(new URL("../secrets/serviceAccountKey.json", import.meta.url), "utf8"));
const PROJECT = "turnamenffbof";
const { JWT } = await import("google-auth-library");
const client = new JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/datastore", "https://www.googleapis.com/auth/cloud-platform"] });
const { token } = await client.getAccessToken();
if (!token) throw new Error("Gagal auth");
const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)`;

// 1. Daftar koleksi root (query campaignIds kosong = list collection ids)
const listRes = await fetch(`${BASE}/documents:listCollectionIds`, {
  method: "POST", headers: H, body: JSON.stringify({ parent: null, pageSize: 100 }),
});
const listJson = await listRes.json().catch(() => ({}));
const existing = (listJson.collectionIds ?? []).sort();
console.log("KOLEKSI ROOT SAAT INI:", existing.length ? existing.join(", ") : "(kosong)");

// 2. Pastikan settings/ocr ada (dibaca UI Admin → Pengaturan → AI & OCR)
const docRes = await fetch(`${BASE}/documents/settings/ocr`, { headers: H });
if (docRes.ok) {
  console.log("settings/ocr: SUDAH ADA ✓");
  // Migrasi: pastikan field jereEndpoint ada (skema baru — endpoint diatur UI).
  const cur = (await docRes.json()).fields ?? {};
  if (!cur.jereEndpoint) {
    const patch = await fetch(`${BASE}/documents/settings/ocr?updateMask.fieldPaths=jereEndpoint`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ fields: { jereEndpoint: { stringValue: "https://api.jerexd.my.id" } } }),
    });
    console.log("settings/ocr jereEndpoint:", patch.ok ? "DITAMBAH ✓ (default jerexd)" : `GAGAL: ${patch.status}`);
  } else {
    console.log("settings/ocr jereEndpoint: sudah ada ✓");
  }
} else {
  const create = await fetch(`${BASE}/documents/settings?documentId=ocr`, {
    method: "POST", headers: H,
    body: JSON.stringify({ fields: {
      jereEndpoint: { stringValue: "https://api.jerexd.my.id" },
      jereVisionModel: { stringValue: "" },
      jereTextModel: { stringValue: "google/gemini-3.1-flash-lite" },
      updatedAt: { stringValue: new Date().toISOString() },
    } }),
  });
  console.log("settings/ocr:", create.ok ? "DIBUAT ✓ (nilai bawaan, skema baru)" : `GAGAL: ${create.status} ${(await create.text()).slice(0, 200)}`);
}

// 3. Probe tulis-baca-hapus pada koleksi yang dipakai fitur → bukti rules
const probes = ["ocrUploads", "auditLogs", "bridgeHeartbeats"];
for (const c of probes) {
  const pid = `_probe_${Date.now()}`;
  const r = await fetch(`${BASE}/documents/${c}?documentId=${pid}`, {
    method: "POST", headers: H, body: JSON.stringify({ fields: { probe: { booleanValue: true } } }),
  });
  if (r.ok) {
    const name = (await r.json()).name;
    await fetch(`${BASE}/${name}`, { method: "DELETE", headers: H });
    console.log(`koleksi ${c}: tulis/hapus admin OK ✓`);
  } else {
    console.log(`koleksi ${c}: GAGAL (${r.status})`);
  }
}
console.log("SELESAI.");
