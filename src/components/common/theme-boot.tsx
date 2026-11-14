"use client";
// Terapkan tema segera setelah halaman dirender (preferensi lokal), lalu
// ikuti tema broadcast dari admin: broadcastSettings/{tid default} —
// perubahan tema di /admin/broadcast berlaku REAL-TIME di semua halaman
// tanpa reload. Halaman yang memuat broadcastSettings tid lain (TV
// /display?tid=…) memakai useBroadcastTheme secara eksplisit.

import { useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { applyTheme, getStoredTheme } from "@/lib/themes";
import { TOURNAMENT_ID_DEFAULT } from "@/lib/constants";
import { db } from "@/services/firebase/client";

/** Terapkan tema broadcast tertentu saat nilainya berubah (real-time). */
export function useBroadcastTheme(theme?: string | null) {
  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);
}

export function ThemeBoot() {
  useEffect(() => {
    applyTheme(getStoredTheme());
    if (!db) return;
    const unsub = onSnapshot(
      doc(db, `broadcastSettings/${TOURNAMENT_ID_DEFAULT}`),
      (snap) => {
        const t = (snap.data() as { theme?: string } | undefined)?.theme;
        if (t) applyTheme(t);
      },
      () => { /* offline: preferensi lokal tetap dipakai */ },
    );
    return () => unsub();
  }, []);
  return null;
}
