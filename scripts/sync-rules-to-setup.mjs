#!/usr/bin/env node
// ============================================================
// STIKAR ESPORTS — Sinkronisasi rules → setup.html
//
// setup.html (halaman setup one-click) menyimpan salinan rules di
// const FIRESTORE_RULES. Dulu disalin manual → sering KETINGGALAN
// versi (inilah penyebab "Missing or insufficient permissions" pada
// fitur baru seperti livePresence / p2pSessions / casterSessions).
//
// Script ini menyalin firebase/firestore.rules ke public/setup.html
// secara OTOMATIS. Dijalankan otomatis setiap build (npm script
// "prebuild") — jadi setup.html selalu memasang rules versi terbaru.
//
// Pakai:  npm run sync:rules   (atau otomatis via npm run build)
// ============================================================
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd());
const RULES = readFileSync(resolve(ROOT, "firebase/firestore.rules"), "utf8").trimEnd();
const SETUP = resolve(ROOT, "public/setup.html");
let html = readFileSync(SETUP, "utf8");

const START = "const FIRESTORE_RULES = `";
const END = "`;";

const startIdx = html.indexOf(START);
if (startIdx === -1) {
  console.error("[sync:rules] GAGAL — marker 'const FIRESTORE_RULES' tidak ditemukan di public/setup.html");
  process.exit(1);
}
const endIdx = html.indexOf(END, startIdx + START.length);
if (endIdx === -1) {
  console.error("[sync:rules] GAGAL — penutup template rules tidak ditemukan");
  process.exit(1);
}

if (RULES.includes("`") || RULES.includes("${")) {
  console.error("[sync:rules] GAGAL — rules mengandung karakter yang tidak aman untuk template literal JS");
  process.exit(1);
}

const before = html.slice(0, startIdx + START.length);
const after = html.slice(endIdx);
let next = before + "\n" + RULES + "\n" + after;

// Perbarui komentar di atas const agar jelas salinan ini otomatis.
next = next.replace(
  "// ---------- Firestore rules (identik firebase/firestore.rules) ----------",
  "// ---------- Firestore rules (DISINKRONKAN OTOMATIS dari firebase/firestore.rules oleh scripts/sync-rules-to-setup.mjs — jangan edit di sini) ----------",
);

if (next === html) {
  console.log("[sync:rules] setup.html sudah sinkron dengan firebase/firestore.rules — tidak ada perubahan.");
  process.exit(0);
}

writeFileSync(SETUP, next, "utf8");
const lines = RULES.split("\n").length;
console.log(`[sync:rules] OK — ${lines} baris rules tersalin ke public/setup.html (termasuk koleksi terbaru).`);
console.log("[sync:rules] Cek cepat koleksi kunci:");
for (const c of ["casterSessions", "livePresence", "p2pSessions", "broadcastSettings"]) {
  console.log(`  - ${c}: ${RULES.includes(`match /${c}/`) ? "ADA" : "TIDAK ADA (periksa firebase/firestore.rules!)"}`);
}
