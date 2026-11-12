"use client";
// ============================================================
// STIKAR ESPORTS — PRESENTATION OVERLAYS (Panggung TV & /live)
// Countdown besar + sekuens mulai game (delay diatur panitia).
// Data: broadcastSettings/{tid} — dikendalikan realtime dari
// /admin/broadcast → kartu "Panggung TV & Countdown".
// Semua overlay menghormati broadcast.presentation.effects
// (false = versi tenang tanpa animasi berat).
// TIDAK pernah mengubah data pertandingan — murni tampilan.
// ============================================================

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Timer, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { ORG } from "@/lib/constants";
import type { BroadcastSettings } from "@/lib/types";

/** Jam klien yang berdetak (250ms) — hanya berjalan saat aktif. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function pad(n: number) {
  return String(Math.max(0, n)).padStart(2, "0");
}

/** Format sisa waktu: 1:05:09 bila ≥ 1 jam, selain itu M:SS. */
function fmtRemaining(ms: number): string {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// ------------------------------------------------------------
// COUNTDOWN BESAR (mis. menjelang turnamen/sesi dimulai)
// ------------------------------------------------------------
export function CountdownOverlay({ broadcast }: { broadcast: BroadcastSettings | null }) {
  const cd = broadcast?.countdown;
  const active = cd?.active === true && typeof cd.endsAt === "number";
  const now = useNow(active);
  // Sembunyikan sendiri 4 detik setelah waktu habis ("MULAI!" masih tampil sebentar).
  const remaining = active ? (cd!.endsAt as number) - now : 1;
  const finished = remaining <= 0;
  if (!active || remaining <= -4000) return null;

  const effects = broadcast?.presentation?.effects !== false;
  const label = (cd!.label ?? "").trim() || "MENUJU SIARAN DIMULAI";
  const secs = Math.max(0, Math.ceil(remaining / 1000));

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center">
      {/* glow latar (efek) */}
      {effects ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="fs-pulse-glow absolute left-1/2 top-1/2 h-[60%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fs-fire/10 blur-3xl" />
        </div>
      ) : null}

      <p className="bo-kicker !text-fs-gold">{label}</p>

      <AnimatePresence mode="popLayout">
        <motion.p
          key={finished ? "mulai" : secs}
          initial={effects ? { opacity: 0, scale: 1.18 } : false}
          animate={{ opacity: 1, scale: 1 }}
          exit={effects ? { opacity: 0, scale: 0.92 } : { opacity: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className={cn(
            "font-display font-black uppercase leading-none tabular-nums drop-shadow-[0_0_30px_rgba(255,90,31,.45)]",
            finished ? "text-fs-fire text-6xl sm:text-8xl" : "text-white text-7xl sm:text-9xl",
          )}
        >
          {finished ? "MULAI!" : fmtRemaining(remaining)}
        </motion.p>
      </AnimatePresence>

      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.34em] text-white/45 sm:text-xs">
        {ORG.tournament} · {ORG.institution}
      </p>
    </div>
  );
}

// ------------------------------------------------------------
// SEKUENS MULAI GAME (panitia atur delay — hitung mundur → GAME START)
// ------------------------------------------------------------
export function StartSequenceOverlay({ broadcast }: { broadcast: BroadcastSettings | null }) {
  const seq = broadcast?.startSequence;
  const active = seq?.active === true && typeof seq.triggerAt === "number" && typeof seq.delaySeconds === "number";
  const now = useNow(active);
  if (!active) return null;

  const delayMs = Math.max(1, (seq!.delaySeconds as number) * 1000);
  const endAt = (seq!.triggerAt as number) + delayMs;
  const remaining = endAt - now;
  if (remaining <= -4000) return null; // selesai — sembunyikan sendiri

  const effects = broadcast?.presentation?.effects !== false;
  const label = (seq!.matchLabel ?? "").trim() || "MATCH BERIKUTNYA";
  const secs = Math.ceil(remaining / 1000);
  const finalPhase = remaining > 0 && secs <= 10;
  const burst = remaining <= 0;
  const progress = Math.min(100, Math.max(0, (remaining / delayMs) * 100));

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/88 px-6 text-center">
      {effects ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="fs-pulse-glow absolute left-1/2 top-1/2 h-[55%] w-[55%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fs-cyan/10 blur-3xl" />
        </div>
      ) : null}

      {burst ? (
        // FASE C — GAME START
        <motion.div
          initial={effects ? { opacity: 0, scale: 0.6 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 14 }}
          className="flex flex-col items-center gap-3"
        >
          <Zap className={cn("h-12 w-12 text-fs-gold", effects && "fs-pulse-glow-icon")} />
          <p className="fs-live-in font-display text-6xl font-black uppercase leading-none text-fs-fire drop-shadow-[0_0_34px_rgba(255,90,31,.65)] sm:text-8xl">
            GAME START
          </p>
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-fs-gold">{label}</p>
        </motion.div>
      ) : finalPhase ? (
        // FASE B — 10..1 raksasa
        <div className="flex flex-col items-center gap-2">
          <p className="bo-kicker">{label}</p>
          <AnimatePresence mode="popLayout">
            <motion.p
              key={secs}
              initial={effects ? { opacity: 0, scale: 1.6 } : false}
              animate={{ opacity: 1, scale: 1 }}
              exit={effects ? { opacity: 0, scale: 0.7 } : { opacity: 0 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="font-display text-8xl font-black leading-none tabular-nums text-fs-gold drop-shadow-[0_0_30px_rgba(255,200,60,.5)] sm:text-[10rem]"
            >
              {secs}
            </motion.p>
          </AnimatePresence>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/60">Bersiap…</p>
        </div>
      ) : (
        // FASE A — hitung mundur panjang dengan progress bar
        <div className="flex w-full max-w-lg flex-col items-center gap-4">
          <p className="flex items-center gap-2 bo-kicker">
            <Timer className="h-4 w-4" /> Sekuens Mulai Game
          </p>
          <p className="font-display text-3xl font-black uppercase leading-tight text-white sm:text-5xl">{label}</p>
          <AnimatePresence mode="popLayout">
            <motion.p
              key={secs}
              initial={effects ? { opacity: 0.4, scale: 1.06 } : false}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24 }}
              className="font-display text-7xl font-black leading-none tabular-nums text-white sm:text-9xl"
            >
              {fmtRemaining(remaining)}
            </motion.p>
          </AnimatePresence>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-fs-fire to-fs-gold transition-[width] duration-300 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/50">
            Game dimulai otomatis — panitia {ORG.brand}
          </p>
        </div>
      )}
    </div>
  );
}

/** Gabungan overlay panggung: sekuens mulai game menang atas countdown. */
export function PresentationOverlays({ broadcast }: { broadcast: BroadcastSettings | null }) {
  const seqActive = broadcast?.startSequence?.active === true;
  return (
    <>
      {!seqActive ? <CountdownOverlay broadcast={broadcast} /> : null}
      <StartSequenceOverlay broadcast={broadcast} />
    </>
  );
}
