// ============================================================
// ZEROID ESPORTS — Firebase client (SDK Web)
// ============================================================

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
};

/** True jika konfigurasi minimum tersedia. */
export const firebaseEnabled = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

function getFirebaseApp() {
  if (!firebaseEnabled) return null;
  if (!getApps().length) {
    initializeApp(firebaseConfig);
  }
  return getApp();
}

export const app = getFirebaseApp();
export const db = app ? getFirestore(app) : null;
export const auth = app && typeof window !== "undefined" ? getAuth(app) : null;

/** Analytics opsional — tidak wajib, diam-diam diabaikan bila tidak didukung. */
export async function initAnalytics() {
  if (!app || typeof window === "undefined") return;
  try {
    const { getAnalytics, isSupported } = await import("firebase/analytics");
    const supported = await isSupported();
    if (supported) getAnalytics(app);
  } catch {
    // Analytics opsional — jangan ganggu aplikasi utama.
  }
}

export const PROJECT_ID = firebaseConfig.projectId;
