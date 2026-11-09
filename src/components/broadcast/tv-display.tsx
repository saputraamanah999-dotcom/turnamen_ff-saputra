"use client";
// ============================================================
// STIKAR ESPORTS — TV DISPLAY BROADCAST (PHASE 2 §9, §10, §11)
// Bukan "website dibuka di TV" — ini tampilan siaran turnamen:
//   header broadcast | gameplay 70-75% | leaderboard 25-30% | ticker.
// Data: scoring engine resmi (publicLeaderboards) + broadcastSettings
// realtime. Animasi LIVE NOW saat admin menekan START LIVE.
// Emergency screen menimpa segalanya. Mobile: tumpuk vertikal.
// ============================================================

import { Suspense, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, Maximize, Swords } from "lucide-react";
import { BroadcastLeaderboard } from "@/components/leaderboard/broadcast-board";
import { LiveVideoPlayer, type PlayerStatus } from "@/components/video/player";
import {
  useActiveTournament, useBroadcast, useMatches, usePublicObserverEvents, useStandings, useTeams,
} from "@/services/firestore/hooks";
import { ORG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { BroadcastEvent, PresentationState, Tournament } from "@/lib/types";

export function TvDisplayPage({ tidOverride }: { tidOverride?: string }) {
  return (
    <Suspense fallback={<Main className="items-center justify-center"><span className="font-display text-lg tracking-[0.3em] text-fs-muted">MEMUAT DISPLAY…</span></Main>}>
      <TvDisplayInner tidOverride={tidOverride} />
    </Suspense>
  );
}

function TvDisplayInner({ tidOverride }: { tidOverride?: string }) {
  const active = useActiveTournament();
  const tid = tidOverride ?? active.tournament?.id ?? null;
  const tournament = useTournamentDoc(tid);
  const standings = useStandings(tid);
  const matches = useMatches(tid, false);
  const teams = useTeams(tid, false);
  const broadcast = useBroadcast(tid, false);
  const observerEvents = usePublicObserverEvents(tid);
  // Presentasi TV (§17): TV mengikuti kendali admin realtime.
  const presentation = useDoc<PresentationState>(tid ? `presentationState/${tid}` : null, { disableFallback: true });

  const [clock, setClock] = useState("");
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>("idle");
  const [shownEvent, setShownEvent] = useState<BroadcastEvent | null>(null);

  const currentMatch =
    matches.data?.find((m) => m.isCurrent) ?? matches.data?.find((m) => m.status === "live") ?? null;
  const emergency = broadcast.data?.emergency;
  const event = broadcast.data?.event;
  const live = broadcast.data?.live;

  // Jam broadcast
  useEffect(() => {
    const kick = setTimeout(() => setClock(new Date().toLocaleTimeString("id-ID")), 0);
    const t = setInterval(() => setClock(new Date().toLocaleTimeString("id-ID")), 1000);
    return () => { clearTimeout(kick); clearInterval(t); };
  }, []);

  // Event broadcast → animasi (LIVE NOW dkk.) selama ~6 detik.
  useEffect(() => {
    if (!event?.id) return;
    const kick = setTimeout(() => setShownEvent(event), 0);
    const t = setTimeout(() => setShownEvent(null), event.type === "LIVE_NOW" || event.type === "LIVE_STARTING" ? 6100 : 4300);
    return () => { clearTimeout(kick); clearTimeout(t); };
  }, [event]);

  const tickerText = useMemo(() => {
    const parts: string[] = [];
    const ann = broadcast.data?.announcements ?? [];
    if (ann.length) parts.push(ann[ann.length - 1]);
    if (live?.state === "live") parts.push("SIARAN LANGSUNG BERJALAN — BATTLE OFF FRIENDS");
    parts.push(`${ORG.tournament} · ${tournament.data?.name ?? ""} · ${ORG.institution}`);
    parts.push(`${ORG.brand} — DEVELOPED BY ${ORG.developer}`);
    return parts.join("   •   ") + "   •   ";
  }, [broadcast.data?.announcements, live?.state, tournament.data?.name]);

  const rows = standings.data?.standings ?? [];

  // ---------- Emergency screen menimpa segalanya ----------
  if (emergency?.active) {
    return (
      <main className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#160303] px-8 text-center text-white">
        <motion.div initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }}>
          <p className="font-display text-6xl font-black uppercase tracking-wide text-[#F87171] sm:text-7xl">
            {emergency.preset}
          </p>
          {emergency.message ? <p className="mx-auto mt-6 max-w-3xl text-xl font-semibold text-[#FCA5A5]">{emergency.message}</p> : null}
          <p className="mt-12 text-xs font-bold uppercase tracking-[0.34em] text-white/50">
            {ORG.tournament} · Broadcast Darurat · Skor Resmi Tidak Terpengaruh
          </p>
        </motion.div>
      </main>
    );
  }

  const isLive = (live?.state ?? "offline") === "live";
  const presScene = presentation.data?.playing ? presentation.data.scene : null;

  return (
    <Main>
      {/* ---------- PRESENTATION OVERLAY (mengikuti admin realtime) ---------- */}
      <AnimatePresence>
        {presScene && presScene !== "gameplay" ? (
          <motion.div
            key={presScene}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[90]"
          >
            <PresentationScene scene={presScene} tid={tid} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ---------- TOP BROADCAST HEADER ---------- */}
      <header className="relative flex items-center justify-between gap-4 border-b border-fs-edge bg-[#0C1117] px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="fs-cut-sm flex h-11 w-11 shrink-0 items-center justify-center bg-gradient-to-br from-fs-fire to-fs-flame font-display text-xl font-black text-white shadow-[0_0_16px_rgba(255,90,31,.45)]">Z</span>
          <div className="min-w-0">
            <p className="font-display text-lg font-black uppercase leading-none tracking-[0.12em] sm:text-xl">
              STIKAR <span className="text-fs-fire">ESPORTS</span>
            </p>
            <p className="truncate text-[9.5px] font-bold uppercase tracking-[0.26em] text-fs-muted">
              {ORG.tournament} · {tournament.data?.name ?? "—"}
            </p>
          </div>
        </div>

        {/* MATCH / ROUND / MAP / STATUS */}
        <div className="hidden text-center md:block">
          <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-fs-muted">Match Information</p>
          <AnimatePresence mode="wait">
            <motion.p
              key={`${currentMatch?.id ?? "none"}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="font-display text-xl font-black uppercase tracking-[0.06em]"
            >
              {currentMatch ? (
                <>
                  ROUND {String(currentMatch.matchNumber).padStart(2, "0")} ·{" "}
                  <span className="text-fs-gold">{currentMatch.map || "UNKNOWN"}</span>
                </>
              ) : (
                <span className="text-fs-muted">NOT SET</span>
              )}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden font-stat text-sm font-bold text-fs-muted sm:block tabular-nums">{clock}</span>
          {isLive || playerStatus === "live" ? (
            <span className="fs-live-badge inline-flex items-center gap-1.5 bg-fs-err px-3 py-1.5 font-display text-sm font-black uppercase tracking-[0.2em] text-white">
              <span className="inline-block h-2 w-2 rounded-full bg-white" /> LIVE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 border border-fs-edge px-3 py-1.5 font-display text-sm font-black uppercase tracking-[0.2em] text-fs-muted">
              STANDBY
            </span>
          )}
          <FullscreenButton />
        </div>
      </header>

      {/* ---------- MAIN: gameplay + leaderboard ---------- */}
      <section className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* GAMEPLAY — 70-75% */}
        <div className="relative min-h-[54vh] flex-1 lg:min-h-0" style={{ flexBasis: "72%" }}>
          <LiveVideoPlayer
            broadcast={broadcast.data}
            className="h-full w-full border-0"
            onStatus={setPlayerStatus}
            idleContent={
              <div className="flex flex-col items-center gap-4 text-center">
                <p className="fs-live-in font-display text-4xl font-black uppercase tracking-[0.14em] text-fs-fire sm:text-5xl">
                  Starting Soon
                </p>
                <p className="max-w-md text-sm font-semibold text-white/60">
                  {currentMatch
                    ? `Match ${currentMatch.matchNumber} · ${currentMatch.map} akan segera dimulai.`
                    : "Jadwal match belum ditetapkan panitia."}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/35">
                  {ORG.brand} · {ORG.tournament}
                </p>
              </div>
            }
          />

          {/* Kill feed (dari AI Observer — nyata; kosong = belum ada event) */}
          {observerEvents.data?.length ? (
            <div className="pointer-events-none absolute right-3 top-12 z-10 flex w-64 flex-col gap-1.5">
              {observerEvents.data.slice(0, 3).map((ev) => (
                <motion.div
                  key={ev.id}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="ov-frame flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-bold"
                >
                  <Swords className="h-3.5 w-3.5 shrink-0 text-fs-fire" />
                  <span className="truncate">{ev.teamName ?? ev.playerName ?? ev.type}</span>
                </motion.div>
              ))}
            </div>
          ) : null}

          {/* EVENT BANNER — LIVE NOW dkk. */}
          <AnimatePresence>
            {shownEvent ? (
              <motion.div
                key={shownEvent.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/45"
              >
                <p className="fs-live-in font-display text-5xl font-black uppercase tracking-[0.12em] text-fs-fire drop-shadow-[0_0_28px_rgba(255,90,31,.6)] sm:text-7xl">
                  {shownEvent.type.replaceAll("_", " ")}
                </p>
                <p className="mt-3 text-sm font-bold uppercase tracking-[0.4em] text-fs-gold">
                  {ORG.tournament} — {ORG.brand}
                </p>
                {shownEvent.matchNumber ? (
                  <p className="mt-1.5 text-xs font-bold uppercase tracking-[0.2em] text-white/70">
                    Match {shownEvent.matchNumber}{shownEvent.map ? ` · ${shownEvent.map}` : ""}
                  </p>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* LEADERBOARD — 25-30% */}
        <aside className="flex min-h-0 w-full flex-col border-t border-fs-edge bg-[#0C1117] lg:w-[28%] lg:min-w-[320px] lg:border-l lg:border-t-0">
          <BroadcastLeaderboard
            standings={rows}
            mode="broadcast"
            status={standings.status}
            updatedAt={standings.data?.updatedAt}
            className="flex min-h-0 flex-1 flex-col [&>div:last-child]:shrink-0 [&_table]:text-[13px]"
          />
        </aside>
      </section>

      {/* ---------- BAWAH: ticker + info ---------- */}
      <footer className="border-t border-fs-edge bg-[#0C1117]">
        <div className="flex items-center gap-3 px-4 py-1.5">
          <span className="shrink-0 bg-gradient-to-r from-fs-fire to-fs-flame px-2 py-0.5 font-display text-[10px] font-black uppercase tracking-[0.2em] text-white">
            Info
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="fs-ticker-track inline-block whitespace-nowrap text-xs font-bold tracking-wide text-fs-muted">
              {tickerText.repeat(4)}
            </p>
          </div>
          <span className="hidden shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-fs-muted sm:flex">
            <Crown className="h-3.5 w-3.5 text-fs-gold" /> {rows[0]?.teamName ?? "—"} · {rows[0]?.totalPoints ?? 0} PTS
          </span>
        </div>
      </footer>
    </Main>
  );
}

function Main({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <main
      className={cn(
        "fixed inset-0 flex flex-col overflow-hidden bg-fs-bg text-fs-text",
        className,
      )}
      style={{
        background:
          "radial-gradient(900px 420px at 88% -10%, rgba(255,90,31,.10), transparent 55%), radial-gradient(700px 380px at -8% 108%, rgba(53,214,255,.06), transparent 55%), #080B10",
      }}
    >
      {children}
    </main>
  );
}

/** Scene presentasi fullscreen — konten sesuai perintah admin (§17). */
function PresentationScene({ scene, tid }: { scene: string; tid: string | null }) {
  const standings = useStandings(tid);
  const matches = useMatches(tid, false);
  const { tournament: active } = useActiveTournament();
  const tournament = useDoc<Tournament>(tid ? `tournaments/${tid}` : null);
  const rows = standings.data?.standings ?? [];
  const currentMatch = matches.data?.find((m) => m.isCurrent) ?? null;
  const t = tournament.data ?? active;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-fs-bg px-10 text-center">
      {scene === "opening" ? (
        <>
          <p className="fs-live-in font-display text-6xl font-black uppercase tracking-[0.08em]">STIKAR <span className="text-fs-fire">ESPORTS</span></p>
          <p className="mt-3 font-display text-2xl font-black uppercase text-fs-muted">{ORG.tournament}</p>
          <p className="mt-1 text-sm font-bold uppercase tracking-[0.3em] text-fs-muted/60">{ORG.institution}</p>
        </>
      ) : null}
      {scene === "tournament" ? (
        <>
          <p className="font-display text-4xl font-black uppercase">{t?.name ?? ORG.tournament}</p>
          <p className="mt-4 text-lg font-bold text-fs-muted">Format {t?.format ?? "BO7"} · {t?.totalMatches ?? 7} Match · {t?.teamCapacity ?? 12} Tim</p>
          <p className="mt-2 text-sm font-semibold text-fs-muted/70">Poin resmi: placement 20-17-15-13-12-10-6-4-3-2-1-0 + 2/kill</p>
        </>
      ) : null}
      {scene === "leaderboard" || scene === "standings" ? (
        <div className="w-full max-w-3xl">
          <p className="bo-kicker mb-4">Klasemen Resmi</p>
          <BroadcastLeaderboard standings={rows} mode="tv" status={standings.status} updatedAt={standings.data?.updatedAt} />
        </div>
      ) : null}
      {scene === "match-info" || scene === "starting-soon" || scene === "countdown" ? (
        <>
          <p className="fs-live-in font-display text-6xl font-black uppercase text-fs-fire">Starting Soon</p>
          <p className="mt-4 text-xl font-bold text-fs-muted">
            {currentMatch ? `Match ${currentMatch.matchNumber} · ${currentMatch.map}` : "Jadwal segera diumumkan"}
          </p>
        </>
      ) : null}
      {scene === "champion" || scene === "mvp" ? (
        <>
          <p className="bo-kicker mb-4">Champion Tracking</p>
          <p className="font-display text-5xl font-black uppercase text-fs-gold">{rows[0]?.teamName ?? "—"}</p>
          <p className="mt-2 text-lg font-bold text-fs-muted">{rows[0]?.totalPoints ?? 0} PTS · {rows[0]?.kills ?? 0} kill</p>
        </>
      ) : null}
      {scene === "results" ? (
        <>
          <p className="bo-kicker mb-4">Hasil Terakhir</p>
          <BroadcastLeaderboard standings={rows.slice(0, 6)} mode="results" status={standings.status} updatedAt={standings.data?.updatedAt} />
        </>
      ) : null}
      {scene === "teams" ? (
        <p className="font-display text-3xl font-black uppercase text-fs-muted">Pengenalan Tim — {rows.length} tim peserta</p>
      ) : null}
      {scene === "closing" ? (
        <>
          <p className="font-display text-5xl font-black uppercase">Terima Kasih</p>
          <p className="mt-3 text-sm font-bold uppercase tracking-[0.3em] text-fs-muted">{ORG.institution} · {ORG.developer}</p>
        </>
      ) : null}
    </div>
  );
}

function FullscreenButton() {
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const onChange = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  return (
    <button
      onClick={() => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => {});
      }}
      className="hidden h-9 w-9 items-center justify-center border border-fs-edge text-fs-muted transition hover:border-fs-fire hover:text-fs-fire sm:flex"
      aria-label={fs ? "Keluar layar penuh" : "Masuk layar penuh"}
      title="Fullscreen (F)"
    >
      <Maximize className="h-4 w-4" />
    </button>
  );
}

// Hook kecil agar display pakai tid eksplisit atau fallback turnamen aktif.
import { useDoc as useDocBase } from "@/services/firestore/hooks";
function useDoc<T>(path: string | null, opts?: { disableFallback?: boolean }) {
  return useDocBase<T>(path, opts);
}
function useTournamentDoc(tid: string | null) {
  return useDoc<Tournament>(tid ? `tournaments/${tid}` : null);
}
