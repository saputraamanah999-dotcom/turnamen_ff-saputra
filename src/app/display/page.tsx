"use client";
// ============================================================
// /display — PUBLIC DISPLAY MODE untuk TV & layar besar (§32)
// TANPA navigasi, tipografi besar, auto-presentasi realtime,
// emergency fullscreen, indikator offline yang jujur.
// Kontrol keyboard: Spasi = pause, ← → = pindah section, F = fullscreen.
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Crown, MapPin, Pause, Play } from "lucide-react";
import { ChampionBanner } from "@/components/leaderboard/champion";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard";
import { Top3Podium } from "@/components/leaderboard/top3";
import { MatchInfoCard } from "@/components/tournament/match";
import {
  useActiveTournament, useBroadcast, useMatches, useStandings, useTeams,
} from "@/services/firestore/hooks";

const SECTIONS = ["leaderboard", "top3", "match", "champion"] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_LABEL: Record<Section, string> = {
  leaderboard: "LIVE LEADERBOARD",
  top3: "TOP 3 CHAMPION CANDIDATES",
  match: "MATCH INFORMASI",
  champion: "CHAMPION TRACKING",
};

export default function DisplayPage() {
  // useSearchParams wajib dibungkus Suspense agar halaman bisa di-prerender.
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-zb-black text-white font-display text-lg">MEMUAT DISPLAY…</main>}>
      <DisplayInner />
    </Suspense>
  );
}

function DisplayInner() {
  const search = useSearchParams();
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const standings = useStandings(tid);
  const matches = useMatches(tid);
  const teams = useTeams(tid);
  const broadcast = useBroadcast(tid);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const dwellMs = Number(search.get("dwell") ?? 10000);

  const emergency = broadcast.data?.emergency;
  const currentMatch =
    matches.data?.find((m) => m.isCurrent) ??
    matches.data?.find((m) => m.status === "live") ??
    null;

  const section = SECTIONS[index] as Section;

  // Auto-presentasi (dwell timer) + keyboard control.
  const next = useCallback(() => setIndex((i) => (i + 1) % SECTIONS.length), []);
  const prev = useCallback(() => setIndex((i) => (i - 1 + SECTIONS.length) % SECTIONS.length), []);
  useEffect(() => {
    if (!playing || emergency?.active) return;
    const t = setInterval(next, Math.max(4000, dwellMs));
    return () => clearInterval(t);
  }, [playing, next, dwellMs, emergency?.active]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space") { e.preventDefault(); setPlaying((v) => !v); }
      if (e.code === "ArrowRight") next();
      if (e.code === "ArrowLeft") prev();
      if (e.key.toLowerCase() === "f") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const rows = standings.data?.standings ?? [];
  const updatedLabel = useMemo(() => {
    const u = standings.data?.updatedAt;
    if (!u) return null;
    const d = typeof u === "object" && "seconds" in (u as Record<string, unknown>)
      ? new Date((u as { seconds: number }).seconds * 1000)
      : new Date(u as string | number);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString("id-ID");
  }, [standings.data]);

  // Layar darurat mengambil alih seluruh display.
  if (emergency?.active) {
    return (
      <main className="bo-grid-bg flex min-h-screen items-center justify-center bg-[#1a0000] px-6 text-white">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl text-center">
          <p className="font-display text-6xl font-black uppercase tracking-wide text-red-400 sm:text-7xl">
            {emergency.preset}
          </p>
          {emergency.message ? (
            <p className="mt-6 text-xl font-semibold text-white/80">{emergency.message}</p>
          ) : null}
          <p className="mt-10 text-sm font-bold uppercase tracking-[0.3em] text-white/50">
            BATTLE OFF FRIENDS · Broadcast Darurat · Skor Resmi Tidak Terpengaruh
          </p>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="bo-grid-bg relative flex min-h-screen flex-col bg-zb-black text-white">
      {/* Header tipis */}
      <header className="flex items-center justify-between border-b-[3px] border-white/10 px-6 py-3">
        <p className="font-display text-xl font-black uppercase tracking-wide">
          ZEROID <span className="text-[#f4d374]">ESPORTS</span> · {tournament?.name ?? "BATTLE OFF FRIENDS"}
        </p>
        <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-white/60">
          {standings.status === "online" ? (
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 animate-ping rounded-full bg-red-500" /> LIVE DATA</span>
          ) : (
            <span className="text-amber-400">DATA OFFLINE — MENAMPILKAN CACHE/DEMO</span>
          )}
          {updatedLabel ? <span className="tabular-nums">UPDATE {updatedLabel}</span> : null}
          <span className="hidden sm:inline">[SPASI] {playing ? "PAUSE" : "PLAY"} · [→←] SEKSI · [F] FULLSCREEN</span>
        </div>
      </header>

      {/* Konten section */}
      <section className="flex flex-1 flex-col px-6 py-6">
        <motion.p
          key={section + String(index)}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 inline-flex w-fit items-center gap-2 border-[3px] border-white/20 px-3 py-1 font-display text-lg font-black uppercase tracking-[0.2em] text-[#f4d374]"
        >
          <Crown className="h-5 w-5" /> {SECTION_LABEL[section]}
        </motion.p>

        {section === "leaderboard" ? (
          <div className="flex-1">
            <div className="mx-auto max-w-4xl">
              <LeaderboardTable standings={rows} status={standings.status} updatedAt={standings.data?.updatedAt} />
            </div>
          </div>
        ) : null}

        {section === "top3" ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-3xl">
              <Top3Podium standings={rows} />
            </div>
          </div>
        ) : null}

        {section === "match" ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-2xl">
              <MatchInfoCard tournament={tournament} match={currentMatch} />
              {currentMatch ? (
                <p className="mt-4 flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-widest text-white/60">
                  <MapPin className="h-4 w-4" /> {currentMatch.map} · {teams.data?.length ?? 0} tim berpartisipasi
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {section === "champion" ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-3xl">
              <ChampionBanner
                standings={rows}
                totalMatches={tournament?.totalMatches ?? 0}
                publishedMatchCount={standings.data?.publishedMatchCount ?? 0}
              />
            </div>
          </div>
        ) : null}
      </section>

      {/* Kontrol + progres */}
      <footer className="flex items-center justify-between border-t-[3px] border-white/10 px-6 py-3">
        <button
          onClick={() => setPlaying((v) => !v)}
          className="flex items-center gap-2 border-[3px] border-white/25 px-4 py-2 font-display text-sm font-black uppercase tracking-widest hover:bg-white/10"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {playing ? "Pause" : "Play"}
        </button>
        <div className="flex gap-2">
          {SECTIONS.map((s, i) => (
            <button
              key={s}
              onClick={() => setIndex(i)}
              aria-label={SECTION_LABEL[s]}
              className={`h-3 w-10 border-2 border-white/40 ${i === index ? "bg-[#f4d374]" : "bg-white/15"}`}
            />
          ))}
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-white/40">
          DISPLAY MODE
        </p>
      </footer>
    </main>
  );
}
