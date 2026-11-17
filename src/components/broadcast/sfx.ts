"use client";
// ============================================================
// STIKAR ESPORTS — SOUND FX ENGINE
// Efek suara esport (asset: public/sfx/*.mp3, disintesis via
// scripts/make_sfx.py). Dipakai dua arah:
//   1. Admin menekan tombol SFX di /admin/broadcast → field
//      broadcastSettings/{tid}.sfx berubah → SEMUA penonton
//      (TV, /live, halaman interaktif) membunyikannya realtime.
//   2. Otomatis: countdown 10..1 (beep) & GAME START (go) —
//      diputar lokal per perangkat dari presentation.tsx.
// Kebijakan autoplay browser: audio hanya boleh bersuara setelah
// interaksi pertama (klik/ketuk) — onFirstGesture() menangani
// antrean otomatis agar SFX tetap terbunyikan setelah klik pertama.
// ============================================================

import { useEffect, useRef } from "react";
import type { BroadcastSettings } from "@/lib/types";

export type SfxType = "beep" | "go" | "booyah" | "match-end" | "airhorn" | "applause" | "pop" | "swoosh";

export const SFX_SRC: Record<SfxType, string> = {
  beep: "/sfx/beep.mp3",
  go: "/sfx/go.mp3",
  booyah: "/sfx/booyah.mp3",
  "match-end": "/sfx/match-end.mp3",
  airhorn: "/sfx/airhorn.mp3",
  applause: "/sfx/applause.mp3",
  pop: "/sfx/pop.mp3",
  swoosh: "/sfx/swoosh.mp3",
};

/** Katalog untuk UI admin (label Indonesia). */
export const SFX_CATALOG: { type: SfxType; label: string; desc: string }[] = [
  { type: "beep", label: "Beep Countdown", desc: "tick hitungan mundur" },
  { type: "go", label: "Game Start", desc: "nada mulai match" },
  { type: "booyah", label: "BOOYAH!", desc: "fanfare kemenangan" },
  { type: "match-end", label: "Match Selesai", desc: "chime penutup match" },
  { type: "airhorn", label: "Airhorn", desc: "klakson hype esport" },
  { type: "applause", label: "Tepuk Tangan", desc: "sorak penonton" },
  { type: "pop", label: "Pop Pengumuman", desc: "notifikasi singkat" },
  { type: "swoosh", label: "Swoosh Transisi", desc: "perpindahan scene" },
];

// ---------- Gate interaksi pertama (kebijakan autoplay semua browser) ----------
let gestured = false;
const gestureCbs = new Set<() => void>();

function gestureHandler() {
  gestured = true;
  window.removeEventListener("pointerdown", gestureHandler);
  window.removeEventListener("keydown", gestureHandler);
  window.removeEventListener("touchstart", gestureHandler);
  for (const cb of gestureCbs) {
    try { cb(); } catch { /* abaikan */ }
  }
  gestureCbs.clear();
}

/** Jalankan cb sekarang bila pengguna pernah berinteraksi, atau tepat setelah interaksi pertama. */
export function onFirstGesture(cb: () => void) {
  if (gestured) {
    cb();
    return;
  }
  gestureCbs.add(cb);
  if (gestureCbs.size === 1) {
    window.addEventListener("pointerdown", gestureHandler, { passive: true });
    window.addEventListener("keydown", gestureHandler);
    window.addEventListener("touchstart", gestureHandler, { passive: true });
  }
}

// ---------- Pemutar SFX ----------
export function playSfx(type: SfxType, volume = 0.9): boolean {
  const src = SFX_SRC[type];
  if (!src || typeof window === "undefined") return false;
  const audio = new Audio(src);
  audio.volume = Math.min(1, Math.max(0, volume));
  audio.play().catch(() => {
    // Autoplay ditolak (belum ada interaksi) — antrekan setelah klik pertama.
    onFirstGesture(() => {
      const retry = new Audio(src);
      retry.volume = audio.volume;
      void retry.play().catch(() => { /* tetap gagal — biarkan senyap */ });
    });
  });
  return true;
}

// ---------- Listener realtime (penonton) ----------
/**
 * Pantau broadcastSettings/{tid}.sfx — bunyikan SFX baru yang dikirim panitia.
 * Perintah lebih tua dari 25 detik diabaikan (halaman baru dibuka di tengah siaran).
 */
export function useSfxListener(broadcast: BroadcastSettings | null) {
  const lastAt = useRef(0);
  const cmdAt = broadcast?.sfx?.at ?? 0;
  const cmdType = broadcast?.sfx?.type;
  useEffect(() => {
    if (!cmdAt || cmdAt === lastAt.current) return;
    lastAt.current = cmdAt;
    if (Date.now() - cmdAt > 25_000) return; // perintah basi
    playSfx((cmdType ?? "pop") as SfxType, 0.9);
  }, [cmdAt, cmdType]);
}
