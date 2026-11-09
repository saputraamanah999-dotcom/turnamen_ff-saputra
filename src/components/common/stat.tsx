"use client";
// ============================================================
// STIKAR ESPORTS — Stat counter animasi + status banner
// ============================================================

import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";
import { AlertTriangle, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** Angka animasi naik saat elemen terlihat. */
export function StatCounter({
  value,
  suffix = "",
  className,
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const duration = 900;
    const start = performance.now();
    let raf = 0;
    function tick(now: number) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {display.toLocaleString("id-ID")}
      {suffix}
    </span>
  );
}

export function LiveDot({ label = "LIVE" }: { label?: string }) {
  return (
    <span className="bo-badge inline-flex items-center gap-1.5 border-fs-edge bg-[#e5484d] text-white">
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fs-panel opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-fs-panel" />
      </span>
      {label}
    </span>
  );
}

/** Banner status koneksi data — jujur, tidak pernah berpura-pura online. */
export function DataStatusBanner({
  status,
}: {
  status: "connecting" | "online" | "offline";
}) {
  if (status === "online") return null;
  if (status === "connecting") {
    return (
      <div className="mb-4 flex items-center gap-2 bo-card-flat bg-zb-cyan px-3 py-2 text-xs font-bold">
        <Wifi className="h-4 w-4" />
        Menghubungkan ke database realtime…
      </div>
    );
  }
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 bo-card-flat bg-zb-yellow px-3 py-2 text-xs font-bold">
      <AlertTriangle className="h-4 w-4" />
      <span className="inline-flex items-center gap-1">
        <WifiOff className="h-3.5 w-3.5" /> MODE DEMO
      </span>
      — Database realtime belum terhubung (project Firebase belum ter-seed atau jaringan terputus).
      Data di bawah adalah <strong>contoh</strong>, bukan hasil resmi turnamen.
    </div>
  );
}

export function EmptyState({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("bo-card flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      <div className="bo-stripe mb-4 h-2 w-16" />
      <p className="font-display text-lg font-bold uppercase">{title}</p>
      {description ? <p className="mt-1 text-sm text-fs-text/60">{description}</p> : null}
    </div>
  );
}
