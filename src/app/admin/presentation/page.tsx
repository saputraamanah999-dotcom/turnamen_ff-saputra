"use client";
// /admin/presentation — mode presentasi TV (§19 master prompt).
// Urutan 13 section, manual/auto transition, pause/resume/skip.
// Semua konten realtime dari data resmi; perpindahan scene TIDAK
// pernah mengubah hasil pertandingan.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, Clock, Pause, Play, SkipForward,
} from "lucide-react";
import { BoButton, BoCard, BoCardLg } from "@/components/common/bo";
import { ChampionBanner } from "@/components/leaderboard/champion";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard";
import { Top3Podium } from "@/components/leaderboard/top3";
import { MatchInfoCard } from "@/components/tournament/match";
import { useActiveTournament, useDoc, useMatches, useStandings, useTeams } from "@/services/firestore/hooks";
import { setPresentationState } from "@/services/scoring/publish";
import { ORG } from "@/lib/constants";
import type { PresentationState } from "@/lib/types";

const SECTIONS = [
  "Opening", "Pengenalan Turnamen", "Pengenalan Tim", "Info Match", "Countdown",
  "Starting Soon", "Gameplay (arahkan ke OBS)", "Live Leaderboard", "Hasil Match",
  "MVP", "Klasemen Turnamen", "Champion Reveal", "Closing",
] as const;

// Kunci scene yang ditulis ke presentationState/{tid} — TV Display membaca
// kunci ini dan menampilkan scene yang sama secara realtime (§17).
export const SCENE_KEYS = [
  "opening", "tournament", "teams", "match-info", "countdown",
  "starting-soon", "gameplay", "leaderboard", "results",
  "mvp", "standings", "champion", "closing",
] as const;

export default function AdminPresentationPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const standings = useStandings(tid);
  const matches = useMatches(tid);
  const teams = useTeams(tid);
  const saved = useDoc<PresentationState>(tid ? `presentationState/${tid}` : null, { disableFallback: true });

  const [local, setLocal] = useState({ index: 0, paused: false, auto: false });
  const [countdown, setCountdown] = useState(60);

  // Firestore = sumber kebenaran (TV mengikuti realtime); local = fallback offline.
  const savedIdx = saved.data ? SCENE_KEYS.indexOf(saved.data.scene as (typeof SCENE_KEYS)[number]) : -1;
  const index = savedIdx >= 0 ? savedIdx : local.index;
  const paused = saved.data ? !saved.data.playing : local.paused;
  const auto = saved.data ? Boolean(saved.data.auto) : local.auto;

  // Semua kontrol menulis optimis ke local + Firestore (§17). Hanya field
  // yang berubah ditulis — tidak saling menimpa nilai dari operator lain.
  function commit(patch: Partial<{ index: number; paused: boolean; auto: boolean }>) {
    if (patch.index !== undefined) setLocal((l) => ({ ...l, index: patch.index! }));
    if (patch.paused !== undefined) setLocal((l) => ({ ...l, paused: patch.paused! }));
    if (patch.auto !== undefined) setLocal((l) => ({ ...l, auto: patch.auto! }));
    if (!tid) return;
    const doc: Partial<PresentationState> = {};
    if (patch.index !== undefined) doc.scene = SCENE_KEYS[patch.index];
    if (patch.paused !== undefined) doc.playing = !patch.paused;
    if (patch.auto !== undefined) doc.auto = patch.auto;
    void setPresentationState(tid, doc).catch(() => {}); // offline: tetap jalan lokal
  }
  const setIndex = (i: number) => commit({ index: i });
  const setPaused = (v: boolean) => commit({ paused: v });
  const setAuto = (v: boolean) => commit({ auto: v });

  const currentMatch =
    matches.data?.find((m) => m.isCurrent) ??
    matches.data?.find((m) => m.status === "live") ??
    null;
  const latestCompleted =
    matches.data?.filter((m) => m.resultsPublished).sort((a, b) => b.matchNumber - a.matchNumber)[0] ?? null;

  const next = () => commit({ index: (index + 1) % SECTIONS.length });
  const prev = () => commit({ index: (index - 1 + SECTIONS.length) % SECTIONS.length });

  // Auto transition 12 detik per section — timer di-reset setiap pindah section.
  useEffect(() => {
    if (!auto || paused) return;
    const t = setTimeout(() => {
      commit({ index: (index + 1) % SECTIONS.length });
    }, 12000);
    return () => clearTimeout(t);
  }, [auto, paused, index]);

  // Countdown section: timer 60 → 0.
  useEffect(() => {
    if (SECTIONS[index] !== "Countdown" || paused) return;
    const t = setInterval(() => setCountdown((v) => (v <= 1 ? 60 : v - 1)), 1000);
    return () => clearInterval(t);
  }, [index, paused]);

  const rows = standings.data?.standings ?? [];
  const section = SECTIONS[index] as (typeof SECTIONS)[number];
  const tvUrl = "/display";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-black uppercase">Presentation Mode</h1>
        <p className="mt-1 text-sm font-semibold text-fs-text/60">
          Urutan presentasi resmi untuk TV. Perpindahan scene hanya mengubah TAMPILAN — hasil
          pertandingan tidak pernah berubah. Untuk TV besar buka <code>{tvUrl}</code> (fullscreen otomatis).
        </p>
      </div>

      {/* Kontrol */}
      <BoCard className="flex flex-wrap items-center gap-2 bg-fs-panel p-4">
        <BoButton variant="white" onClick={prev}><ChevronLeft className="h-4 w-4" /> Sebelumnya</BoButton>
        <BoButton variant="black" onClick={next}>Berikutnya <ChevronRight className="h-4 w-4" /></BoButton>
        <BoButton variant="primary" onClick={() => setPaused(!paused)}>
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} {paused ? "Resume" : "Pause"}
        </BoButton>
        <BoButton variant={auto ? "destructive" : "cyan"} onClick={() => setAuto(!auto)}>
          {auto ? "Auto: ON (12s)" : "Auto: OFF"}
        </BoButton>
        <span className="ml-auto text-xs font-black uppercase tracking-widest text-fs-text/50">
          Section {index + 1}/{SECTIONS.length}
        </span>
      </BoCard>

      {/* Progres */}
      <div className="flex flex-wrap gap-1.5">
        {SECTIONS.map((s, i) => (
          <button
            key={s}
            onClick={() => setIndex(i)}
            className={`bo-badge ${i === index ? "bg-fs-head text-white" : "bg-fs-panel"}`}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {/* Konten section — render besar seperti TV */}
      <BoCardLg className="bo-grid-bg min-h-[480px] bg-fs-panel p-6">
        {section === "Opening" ? (
          <div className="flex h-80 flex-col items-center justify-center text-center">
            <p className="font-display text-5xl font-black uppercase">STIKAR <span className="text-zb-blue">ESPORTS</span></p>
            <p className="mt-2 font-display text-2xl font-black uppercase text-fs-text/60">{ORG.tournament}</p>
            <p className="mt-1 text-sm font-bold uppercase tracking-widest text-fs-text/40">{ORG.institution}</p>
          </div>
        ) : null}

        {section === "Pengenalan Turnamen" ? (
          <div className="flex h-80 flex-col items-center justify-center text-center">
            <p className="font-display text-3xl font-black uppercase">{tournament?.name ?? "BATTLE OFF FRIENDS"}</p>
            <p className="mt-3 text-lg font-bold text-fs-text/70">
              Format {tournament?.format ?? "BO7"} · {tournament?.totalMatches ?? 7} Match · {tournament?.teamCapacity ?? 12} Tim
            </p>
            <p className="mt-1 text-sm font-semibold text-fs-text/50">
              Sistem poin resmi: placement 20-17-15-13-12-10-6-4-3-2-1-0 + 2 poin/kill
            </p>
          </div>
        ) : null}

        {section === "Pengenalan Tim" ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(teams.data ?? []).map((t) => (
              <div key={t.id} className="bo-card-flat bg-fs-bg px-3 py-2 text-center">
                <p className="text-[10px] font-bold uppercase text-fs-text/50">#{t.number}</p>
                <p className="font-display text-sm font-black">{t.name}</p>
                <p className="text-[10px] font-bold text-fs-text/40">[{t.tag}]</p>
              </div>
            ))}
          </div>
        ) : null}

        {section === "Info Match" ? <MatchInfoCard tournament={tournament} match={currentMatch} /> : null}

        {section === "Countdown" ? (
          <div className="flex h-80 flex-col items-center justify-center">
            <p className="font-display text-8xl font-black tabular-nums text-zb-blue">{countdown}</p>
            <p className="mt-2 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-fs-text/50">
              <Clock className="h-4 w-4" /> Countdown presentasi
            </p>
          </div>
        ) : null}

        {section === "Starting Soon" || section === "Gameplay (arahkan ke OBS)" ? (
          <div className="flex h-80 flex-col items-center justify-center text-center">
            <p className="font-display text-3xl font-black uppercase">Arahkan TV / OBS ke</p>
            <p className="mt-3 font-mono text-xl font-bold text-zb-blue">
              {section === "Starting Soon" ? `/overlay/${tid ?? "bof-main"}/starting-soon` : "OBS Scene: Main Gameplay"}
            </p>
            <p className="mt-3 max-w-md text-sm font-semibold text-fs-text/50">
              {section === "Starting Soon"
                ? "Overlay countdown realtime mengikuti jadwal resmi match."
                : "Section ini menandai momen gameplay — switch scene di Broadcast Control / OBS."}
            </p>
          </div>
        ) : null}

        {section === "Live Leaderboard" || section === "Klasemen Turnamen" ? (
          <div className="mx-auto max-w-2xl">
            <LeaderboardTable standings={rows} status={standings.status} updatedAt={standings.data?.updatedAt} />
          </div>
        ) : null}

        {section === "Hasil Match" ? (
          <div className="flex h-80 flex-col items-center justify-center">
            {latestCompleted ? (
              <>
                <p className="font-display text-2xl font-black uppercase">Match {latestCompleted.matchNumber} — {latestCompleted.map}</p>
                <p className="mt-2 text-sm font-bold text-fs-text/60">
                  Hasil resmi sudah dipublikasikan · detail di halaman /matches/{latestCompleted.id}
                </p>
              </>
            ) : (
              <p className="font-bold text-fs-text/50">Belum ada hasil resmi dipublikasikan.</p>
            )}
          </div>
        ) : null}

        {section === "MVP" ? (
          <div className="flex h-80 flex-col items-center justify-center text-center">
            <p className="font-display text-2xl font-black uppercase">MVP Pemain</p>
            <p className="mt-3 max-w-md text-sm font-semibold text-fs-text/60">
              Statistik pemain individu terverifikasi belum tersedia — sesuai aturan platform, MVP tidak
              dikarang dari total kill tim. Section ini otomatis menampilkan pemenang saat data tersedia.
            </p>
          </div>
        ) : null}

        {section === "Champion Reveal" ? (
          <div className="mx-auto max-w-2xl">
            <ChampionBanner
              standings={rows}
              totalMatches={tournament?.totalMatches ?? 0}
              publishedMatchCount={standings.data?.publishedMatchCount ?? 0}
            />
          </div>
        ) : null}

        {section === "Closing" ? (
          <div className="flex h-80 flex-col items-center justify-center text-center">
            <p className="font-display text-3xl font-black uppercase">Terima Kasih</p>
            <p className="mt-2 text-sm font-bold uppercase tracking-widest text-fs-text/50">
              {ORG.institution} · Developed by {ORG.developer}
            </p>
          </div>
        ) : null}
      </BoCardLg>

      <p className="text-xs font-semibold text-fs-text/50">
        <SkipForward className="mr-1 inline h-3 w-3" /> Tips: buka <code>/display</code> di TV lalu kendalikan
        urutan dari HP/laptop operator — keduanya realtime dan selalu menampilkan data resmi yang sama.
      </p>
    </div>
  );
}
