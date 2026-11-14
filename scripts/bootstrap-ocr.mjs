#!/usr/bin/env node
// ============================================================
// BOF — Bootstrap koleksi ocrUploads (fitur AI OCR screenshot)
// 1. Memastikan koleksi ADA di project (menulis dokumen _meta).
// 2. Verifikasi tulis+baca via service account.
// Jalankan:  GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccountKey.json node scripts/bootstrap-ocr.mjs
// ============================================================
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "turnamenffbof";
initializeApp({ projectId: PROJECT_ID, credential: applicationDefault() });
const db = getFirestore();

const meta = db.collection("ocrUploads").doc("_meta");
await meta.set({
  note: "Koleksi arsip AI OCR — dibuat otomatis oleh scripts/bootstrap-ocr.mjs",
  feature: "AI OCR screenshot → auto-fill Entri Hasil",
  createdAt: FieldValue.serverTimestamp(),
});
const snap = await meta.get();
if (!snap.exists) throw new Error("Gagal membaca kembali dokumen _meta");
console.log("[bootstrap-ocr] OK — koleksi ocrUploads tersedia di", PROJECT_ID);
console.log("  dokumen uji:", snap.id, "→", snap.data().feature);

// Daftar tim yang punya kapten (contoh ringkasan memori AI).
const tids = await db.collection("publicLeaderboards").listDocuments();
console.log("  tournament terdaftar (publicLeaderboards):", tids.map((d) => d.id).join(", ") || "(kosong)");
