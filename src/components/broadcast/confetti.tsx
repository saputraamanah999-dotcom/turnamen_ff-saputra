"use client";
// ============================================================
// STIKAR ESPORTS — CONFETTI CANVAS (tanpa dependensi)
// Burst konfeti untuk momen besar: MULAI!/GAME START/Panggung
// Juara. Ringan (~140 partikel, berhenti sendiri), menghormati
// prefers-reduced-motion. trigger berubah = burst baru.
// ============================================================

import { useEffect, useRef } from "react";

const COLORS = ["#FFC247", "#FF5A1F", "#FF8A00", "#35D6FF", "#22C55E", "#F0ABFC", "#FFFFFF"];

interface Particle {
  x: number; y: number; vx: number; vy: number;
  w: number; h: number; rot: number; vr: number; color: string; life: number;
}

export function ConfettiBurst({
  trigger,
  count = 140,
  duration = 3800,
  className,
}: {
  /** Ubah nilai ini untuk memicu burst (mis. "mulai", epoch ms, "podium-2"). */
  trigger: string | number | null;
  count?: number;
  duration?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (trigger === null || trigger === "") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const parent = canvas.parentElement;
    const w = parent?.clientWidth ?? window.innerWidth;
    const h = parent?.clientHeight ?? window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const parts: Particle[] = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: -20 - Math.random() * h * 0.25,
      vx: (Math.random() - 0.5) * 2.4,
      vy: 1.6 + Math.random() * 3.2,
      w: 5 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.24,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 1,
    }));

    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      const globalFade = t > duration - 800 ? Math.max(0, (duration - t) / 800) : 1;
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.028; // gravitasi lembut
        p.rot += p.vr;
        p.life = globalFade;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < duration) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, w, h);
    };
  }, [trigger, count, duration]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className ?? "pointer-events-none absolute inset-0 z-40 h-full w-full"}
    />
  );
}
