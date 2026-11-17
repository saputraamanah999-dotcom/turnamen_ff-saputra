"use client";
// ============================================================
// STIKAR ESPORTS — LAYAR TETAP MENYALA (Keep Awake / TV Mode)
// Masalah: browser TV/HP mematikan layar saat dianggap "idle"
// walau siaran sedang berjalan → penonton kehilangan match.
//
// Tiga lapis pencegahan (semua otomatis, tanpa ketukan):
//   1. Screen Wake Lock API (Chrome/Edge/Android modern).
//   2. Fallback NoSleep: <video> 1px senyap yang sumbernya
//      Canvas.captureStream() — hampir semua browser TV lama
//      menjaga layar menyala selama ada video yang "playing".
//      Teknik yang sama dipakai library NoSleep.js.
//   3. Re-acquire: kunci layar hilang saat tab disembunyikan →
//      diminta ulang otomatis begitu tab terlihat kembali,
//      plus sekali lagi pada interaksi pertama bila sempat
//      ditolak browser (kebijakan autoplay/energi).
//
// Hasil untuk panitia: buka /display di TV → layar TIDAK akan
// mati sendiri, sepanjang tab tetap terbuka.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";

export type WakeState =
  | "active" // Wake Lock API aktif (cara resmi)
  | "fallback" // mode NoSleep video 1px aktif
  | "blocked" // browser menolak — dicoba lagi otomatis/gestur
  | "unsupported"; // tidak di server / tidak ada mekanisme

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: "release", cb: () => void) => void;
}

let videoEl: HTMLVideoElement | null = null; // singleton fallback NoSleep per tab
let canvasEl: HTMLCanvasElement | null = null;
let rafId = 0;

/** Mulai video 1px senyap dari captureStream canvas — menjaga layar tetap ON. */
function startNoSleepVideo(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (videoEl) return true;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    canvasEl = canvas;
    const ctx = canvas.getContext("2d");
    const draw = () => {
      // Frame sangat sederhana — CPU hampir nol, cukup agar stream tetap "hidup".
      if (ctx) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, 16, 16);
      }
      rafId = requestAnimationFrame(draw);
    };
    draw();

    const stream = (canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream?.(2);
    if (!stream) return false;

    const v = document.createElement("video");
    v.id = "stikar-nosleep";
    v.muted = true; // WAJIB senyap — dilarang mengeluarkan suara
    v.defaultMuted = true;
    v.volume = 0;
    v.setAttribute("playsinline", "");
    v.setAttribute("aria-hidden", "true");
    v.style.cssText =
      "position:fixed;width:2px;height:2px;top:0;left:0;opacity:0.001;pointer-events:none;z-index:-1;";
    v.srcObject = stream;
    document.body.appendChild(v);
    videoEl = v;

    const tryPlay = () => v.play().catch(() => { /* dicoba ulang oleh pemanggil */ });
    tryPlay();
    // Beberapa TV baru mengizinkan setelah tab sempat terlihat / gestur apa pun.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") tryPlay();
    });
    window.addEventListener("pointerdown", tryPlay, { passive: true });
    window.addEventListener("keydown", tryPlay);
    return true;
  } catch {
    return false;
  }
}

function stopNoSleepVideo() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  if (videoEl) {
    try {
      videoEl.pause();
      videoEl.srcObject = null;
      videoEl.remove();
    } catch { /* abaikan */ }
    videoEl = null;
  }
  canvasEl = null;
}

/**
 * Hook: panggil sekali per halaman (TV /display, /live, /connect, …).
 * Return status + fungsi request manual (untuk tombol "Nyalakan Layar").
 * Kunci otomatis diminta ulang saat tab kembali terlihat.
 */
export function useKeepAwake(auto = true): { state: WakeState; request: () => void } {
  const [state, setState] = useState<WakeState>("unsupported");

  // Ref agar callback "release" bisa memanggil ulang request tanpa
  // mereferensikan const-nya sendiri (menghindari error react-hooks/immutability).
  const requestRef = useRef<() => void>(() => {});

  const request = useCallback(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    // 1) Wake Lock API resmi.
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    };
    if (nav.wakeLock?.request) {
      nav.wakeLock
        .request("screen")
        .then((sentinel) => {
          setState("active");
          sentinel.addEventListener?.("release", () => {
            // Kunci lepas (mis. tab disembunyikan) → coba kunci lagi saat terlihat.
            if (document.visibilityState === "visible") requestRef.current();
          });
        })
        .catch(() => {
          // Ditolak → jalankan fallback NoSleep bila memungkinkan.
          if (startNoSleepVideo()) setState("fallback");
          else setState("blocked");
        });
      return;
    }
    // 2) Tidak ada Wake Lock API (browser TV lama) → fallback video 1px.
    if (startNoSleepVideo()) setState("fallback");
    else setState("blocked");
  }, []);

  requestRef.current = request;

  useEffect(() => {
    if (!auto) return;
    request();
    // Re-acquire saat tab kembali terlihat (kunci wajib dilepas browser saat hidden).
    const onVis = () => {
      if (document.visibilityState === "visible") request();
    };
    // Sekali lagi pada interaksi pertama — beberapa TV hanya mengizinkan
    // setelah ada ketukan/tekanan tombol remote.
    const onGesture = () => {
      if (videoEl) void videoEl.play().catch(() => {});
      request();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointerdown", onGesture, { passive: true, once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  // Bersihkan fallback saat komponen terakhir unmount (best-effort; singleton).
  useEffect(() => {
    return () => {
      // Tidak selalu amah menghentikan — halaman lain mungkin memakai.
      // NoSleep dibiarkan hidup sepanjang tab terbuka (itu tujuannya).
    };
  }, []);

  return { state, request };
}
