// ============================================================
// STIKAR ESPORTS — Layar penuh (fullscreen) bersama
// Dipakai: player video, TV display, live viewer, connect.
// Browser TV/HP sering menuntut gestur sentuh sebelum fullscreen
// diizinkan — jadi kalau permintaan awal ditolak, satu ketukan
// pertama di halaman otomatis masuk layar penuh.
// ============================================================

import { useEffect } from "react";

/** Baca parameter ?fs= dari URL (nilai "0"/"false" berarti mati). */
export function isAutoFullscreenRequested(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = new URLSearchParams(window.location.search).get("fs");
    return v !== null && v !== "0" && v !== "false";
  } catch {
    return false;
  }
}

/**
 * Masuk layar penuh pada elemen (default: seluruh dokumen).
 * Fallback browser TV/iOS: fullscreen pada elemen <video>.
 * Return true bila berhasil.
 */
export async function enterFullscreen(el?: HTMLElement | null): Promise<boolean> {
  if (typeof document === "undefined") return false;
  const target = el ?? document.documentElement;
  try {
    if (!document.fullscreenElement) {
      await target.requestFullscreen({ navigationUI: "hide" });
    }
    return true;
  } catch {
    /* lanjut fallback */
  }
  try {
    const v = document.querySelector("video");
    const video = v as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (video && typeof video.webkitEnterFullscreen === "function") {
      video.webkitEnterFullscreen();
      return true;
    }
  } catch {
    /* abaikan */
  }
  return false;
}

export async function exitFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* abaikan */
  }
}

export function isFullscreenActive(): boolean {
  return typeof document !== "undefined" && Boolean(document.fullscreenElement);
}

/**
 * Auto layar penuh saat halaman dibuka dengan ?fs=1 (dipakai link/QR TV).
 * Bila browser menolak (butuh gestur), ketukan/tombol pertama pada halaman
 * langsung memasuki layar penuh (maks. 30 detik setelah halaman terbuka).
 */
export function useAutoFullscreen(): void {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isAutoFullscreenRequested()) return;
    let pending = true;
    const grab = () => {
      if (!pending) return;
      void enterFullscreen().then((ok) => {
        if (ok) pending = false;
      });
    };
    void enterFullscreen().then((ok) => {
      if (ok || !pending) return;
      document.addEventListener("pointerdown", grab, true);
      document.addEventListener("touchstart", grab, true);
      document.addEventListener("keydown", grab, true);
    });
    const stop = setTimeout(() => {
      pending = false;
      document.removeEventListener("pointerdown", grab, true);
      document.removeEventListener("touchstart", grab, true);
      document.removeEventListener("keydown", grab, true);
    }, 30000);
    return () => {
      pending = false;
      clearTimeout(stop);
      document.removeEventListener("pointerdown", grab, true);
      document.removeEventListener("touchstart", grab, true);
      document.removeEventListener("keydown", grab, true);
    };
  }, []);
}
