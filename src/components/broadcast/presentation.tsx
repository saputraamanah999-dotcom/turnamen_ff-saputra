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

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Timer, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { ORG } from "@/lib/constants";
import { playSfx } from "@/components/broadcast/sfx";
import { ConfettiBurst } from "@/components/broadcast/confetti";
import { ChampionsStageOverlay } from "@/components/leaderboard/champion-podium";
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
// Kinerja di TV: komponen detak (angka/beep) DIISOLASI di leaf
// <CountdownTicker> sehingga cangkang overlay (halo, label, footer)
// tidak di-render ulang 4x per detik; halo memakai radial-gradient
// tanpa filter blur (pengganti blur-3xl yang membuat animasi patah).
// ------------------------------------------------------------
export function CountdownOverlay({ broadcast }: { broadcast: BroadcastSettings | null }) {
  const cd = broadcast?.countdown;
  const active = cd?.active === true && typeof cd.endsAt === "number";
  const effects = broadcast?.presentation?.effects !== false;
  const label = (cd?.label ?? "").trim() || "MENUJU SIARAN DIMULAI";

  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center">
      {/* glow latar (efek) — murah: radial gradient + opacity, tanpa blur */}
      {effects ? <div className="fs-halo" aria-hidden="true" /> : null}

      <p className="bo-kicker !text-fs-gold">{label}</p>

      <CountdownTicker endsAt={cd!.endsAt as number} effects={effects} />

      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.34em] text-white/45 sm:text-xs">
        {ORG.tournament} · {ORG.institution}
      </p>
    </div>
  );
}

/** Leaf detak countdown: satu-satunya bagian yang di-render ulang tiap 250ms.
 *  Angka memakai animasi transform + text-shadow statis (tanpa CSS filter) —
 *  murah untuk GPU TV sehingga tidak lagi patah-patah. */
function CountdownTicker({ endsAt, effects }: { endsAt: number; effects: boolean }) {
  const now = useNow(true);
  const lastBeep = useRef(-1);
  const playedGo = useRef(false);
  const remaining = endsAt - now;
  const finished = remaining <= 0;
  const secs = Math.max(0, Math.ceil(Math.max(0, remaining) / 1000));

  // SFX otomatis: beep tiap detik pada 10 detik terakhir, nada GO saat waktu habis.
  useEffect(() => {
    if (finished) return;
    if (secs <= 10 && secs > 0 && lastBeep.current !== secs) {
      lastBeep.current = secs;
      playSfx("beep", 0.45);
    }
  }, [secs, finished]);
  useEffect(() => {
    if (finished && !playedGo.current) {
      playedGo.current = true;
      playSfx("go", 1);
    }
  }, [finished]);

  if (remaining <= -4000) return null; // selesai — sembunyikan sendiri

  return (
    <>
      <AnimatePresence mode="popLayout">
        <motion.p
          key={finished ? "mulai" : secs}
          initial={effects ? { opacity: 0, scale: 1.18 } : false}
          animate={{ opacity: 1, scale: 1 }}
          exit={effects ? { opacity: 0, scale: 0.92 } : { opacity: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          style={{ textShadow: "0 0 30px rgba(255,90,31,.4)" }}
          className={cn(
            "font-display font-black uppercase leading-none tabular-nums",
            finished ? "text-fs-fire text-6xl sm:text-8xl" : "text-white text-7xl sm:text-9xl",
          )}
        >
          {finished ? "MULAI!" : fmtRemaining(remaining)}
        </motion.p>
      </AnimatePresence>
      {effects && finished ? <ConfettiBurst trigger="countdown-mulai" /> : null}
    </>
  );
}

// ------------------------------------------------------------
// SEKUENS MULAI GAME (panitia atur delay — hitung mundur → GAME START)
// ------------------------------------------------------------
export function StartSequenceOverlay({ broadcast }: { broadcast: BroadcastSettings | null }) {
  const seq = broadcast?.startSequence;
  const active = seq?.active === true && typeof seq.triggerAt === "number" && typeof seq.delaySeconds === "number";
  const now = useNow(active);
  const lastBeep = useRef(-1);
  const playedGo = useRef(false);

  const delayMs = active ? Math.max(1, (seq!.delaySeconds as number) * 1000) : 1;
  const endAt = active ? (seq!.triggerAt as number) + delayMs : 0;
  const remaining = active ? endAt - now : 1;
  const burst = active && remaining <= 0;
  const secs = Math.ceil(remaining / 1000);
  const finalPhase = active && remaining > 0 && secs <= 10;

  // SFX otomatis: beep 10..1 + nada GO di burst GAME START.
  useEffect(() => {
    if (!active) return;
    if (burst) {
      if (!playedGo.current) {
        playedGo.current = true;
        playSfx("go", 1);
      }
      return;
    }
    if (finalPhase && secs > 0 && lastBeep.current !== secs) {
      lastBeep.current = secs;
      playSfx("beep", 0.45);
    }
  }, [active, burst, finalPhase, secs]);

  if (!active || remaining <= -4000) return null; // selesai — sembunyikan sendiri

  const effects = broadcast?.presentation?.effects !== false;
  const label = (seq!.matchLabel ?? "").trim() || "MATCH BERIKUTNYA";
  const progress = Math.min(100, Math.max(0, (remaining / delayMs) * 100));

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/88 px-6 text-center">
      {effects ? <div className="fs-halo fs-halo-cyan" aria-hidden="true" /> : null}

      {burst ? (
        // FASE C — GAME START
        <motion.div
          initial={effects ? { opacity: 0, scale: 0.6 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 14 }}
          className="flex flex-col items-center gap-3"
        >
          {effects ? <ConfettiBurst trigger="game-start" count={170} /> : null}
          <Zap className={cn("h-12 w-12 text-fs-gold", effects && "fs-pulse-glow-icon")} />
          <p
            style={{ textShadow: "0 0 34px rgba(255,90,31,.55)" }}
            className="fs-live-in font-display text-6xl font-black uppercase leading-none text-fs-fire sm:text-8xl"
          >
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
              style={{ textShadow: "0 0 30px rgba(255,200,60,.45)" }}
              className="font-display text-8xl font-black leading-none tabular-nums text-fs-gold sm:text-[10rem]"
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

// ------------------------------------------------------------
// OVERLAY BOOYAH! (momen juara match — dipicu panitia sekali klik)
// ------------------------------------------------------------
export function BooyahOverlay({ broadcast }: { broadcast: BroadcastSettings | null }) {
  const b = broadcast?.booyah;
  const at = typeof b?.at === "number" ? b.at : 0;
  const active = b?.active === true && at > 0;
  const [show, setShow] = useState(false);
  const lastAt = useRef(0);

  // Tampil ±8 detik sejak ditekan; perintah basi (>8 dtk) diabaikan
  // agar halaman yang baru dibuka di tengah siaran tidak ikut meledak.
  useEffect(() => {
    if (!active) {
      setShow(false);
      return;
    }
    const age = Date.now() - at;
    if (age > 8000) return;
    if (lastAt.current !== at) {
      lastAt.current = at;
      playSfx("booyah", 1);
    }
    setShow(true);
    const t = setTimeout(() => setShow(false), 8000 - age);
    return () => clearTimeout(t);
  }, [active, at]);

  if (!show) return null;
  const effects = broadcast?.presentation?.effects !== false;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 overflow-hidden bg-gradient-to-b from-black/70 via-black/55 to-black/70 px-6 text-center">
      {effects ? <ConfettiBurst trigger={`booyah-${at}`} count={220} /> : null}
      {effects ? (
        <div className="pointer-events-none absolute inset-0">
          <div className="fs-pulse-glow absolute left-1/2 top-1/2 h-[62%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fs-gold/15 blur-3xl" />
        </div>
      ) : null}
      <motion.p
        initial={effects ? { scale: 0.4, opacity: 0, rotate: -3 } : false}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 13 }}
        className="fs-shimmer-gold bg-clip-text font-display text-7xl font-black uppercase leading-none tracking-[0.04em] text-transparent drop-shadow-[0_0_40px_rgba(255,194,71,.55)] sm:text-[11rem]"
        style={{
          backgroundImage:
            "linear-gradient(180deg,#FFF3C4 0%,#FFC247 45%,#B97E14 100%)",
        }}
      >
        BOOYAH!
      </motion.p>
      {b?.teamName ? (
        <motion.p
          initial={effects ? { opacity: 0, y: 14 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="max-w-full truncate font-display text-2xl font-black uppercase tracking-[0.08em] text-white sm:text-4xl"
        >
          {b.teamName}
        </motion.p>
      ) : null}
      <p className="text-[11px] font-bold uppercase tracking-[0.34em] text-fs-gold/90">
        Match Survivor{b?.matchNumber ? ` · Match ${b.matchNumber}` : ""} · {ORG.tournament}
      </p>
    </div>
  );
}

/** Gabungan overlay panggung: sekuens mulai game menang atas countdown;
 *  Panggung Juara di atas segalanya (kendali toggle admin). */
export function PresentationOverlays({ broadcast }: { broadcast: BroadcastSettings | null }) {
  const seqActive = broadcast?.startSequence?.active === true;
  const podium = broadcast?.presentation?.podium === true;
  return (
    <>
      {!podium && !seqActive ? <CountdownOverlay broadcast={broadcast} /> : null}
      {!podium ? <StartSequenceOverlay broadcast={broadcast} /> : null}
      {!podium ? <BooyahOverlay broadcast={broadcast} /> : null}
      {podium ? <ChampionsStageOverlay broadcast={broadcast} /> : null}
    </>
  );
}
