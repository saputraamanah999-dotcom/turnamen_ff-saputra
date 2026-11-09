"use client";
// ============================================================
// ZEROID ESPORTS — HALAMAN LIVE UTAMA (/live/:tournamentId)
// Desktop: kiri 68-72% video + info, kanan 28-32% leaderboard.
// Mobile urutan: Video → Info → Leaderboard → Top 3 → Statistik.
// ============================================================

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Megaphone } from "lucide-react";
import { BoCard, BoCardLg } from "@/components/common/bo";
import { DataStatusBanner, LiveDot } from "@/components/common/stat";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard";
import { Top3Podium } from "@/components/leaderboard/top3";
import { TeamDetailPanel } from "@/components/leaderboard/team-detail";
import { LiveVideoPlayer } from "@/components/video/player";
import { MatchInfoCard } from "@/components/tournament/match";
import {
  useBroadcast,
  useMatches,
  useStandings,
  useTeams,
  useTournament,
  fetchResultsOnce,
} from "@/services/firestore/hooks";
import type { MatchResult, StandingsRow } from "@/lib/types";

export default function LiveTournamentPage() {
  const params = useParams<{ tournamentId: string }>();
  const tid = params?.tournamentId ?? null;

  const tournament = useTournament(tid);
  const standings = useStandings(tid);
  const matches = useMatches(tid);
  const teams = useTeams(tid);
  const broadcast = useBroadcast(tid);

  const [selected, setSelected] = useState<StandingsRow | null>(null);
  const [history, setHistory] = useState<{ matchId: string; result?: MatchResult }[]>([]);

  const currentMatch =
    matches.data?.find((m) => m.isCurrent) ??
    matches.data?.find((m) => m.status === "live") ??
    matches.data?.find((m) => m.status === "scheduled") ??
    null;

  const completedMatches = useMemo(
    () => matches.data?.filter((m) => m.resultsPublished).sort((a, b) => a.matchNumber - b.matchNumber) ?? [],
    [matches.data],
  );

  async function openTeam(row: StandingsRow) {
    setSelected(row);
    setHistory([]);
    if (!tid) return;
    try {
      const entries = await Promise.all(
        completedMatches.map(async (m) => {
          const results = (await fetchResultsOnce(tid, m.id)) as (MatchResult & { id: string })[];
          return { matchId: m.id, matchNumber: m.matchNumber, result: results.find((r) => r.teamId === row.teamId) };
        }),
      );
      setHistory(entries.map((e) => ({ matchId: e.matchId, result: e.result })));
    } catch {
      // Riwayat gagal dimuat — panel tetap tampil dengan agregat.
    }
  }

  const overallStatus =
    standings.status === "online" ? "online" : standings.status;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6">
      <DataStatusBanner status={overallStatus} />

      {/* Judul */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-black uppercase leading-none sm:text-3xl">
          {tournament.data?.name ?? "BATTLE OFF FRIENDS"}
        </h1>
        {(tournament.data?.liveStatus === "live" || currentMatch?.status === "live") ? (
          <LiveDot />
        ) : null}
        <span className="bo-badge bg-zb-black text-white">
          {standings.data?.publishedMatchCount ?? 0} match resmi
        </span>
      </div>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[68fr_32fr]">
        {/* ===== KIRI: VIDEO + INFO ===== */}
        <div className="flex min-w-0 flex-col gap-6">
          <LiveVideoPlayer broadcast={broadcast.data} />

          <MatchInfoCard tournament={tournament.data} match={currentMatch} />

          {/* Pengumuman panitia */}
          {broadcast.data?.announcements?.length ? (
            <BoCard className="bg-zb-yellow p-4">
              <p className="flex items-center gap-2 font-display text-sm font-black uppercase tracking-wider">
                <Megaphone className="h-4 w-4" /> Pengumuman Panitia
              </p>
              <ul className="mt-2 space-y-1 text-sm font-semibold">
                {broadcast.data.announcements.map((a, i) => (
                  <li key={i}>• {a}</li>
                ))}
              </ul>
            </BoCard>
          ) : null}
        </div>

        {/* ===== KANAN: LEADERBOARD ===== */}
        <div className="flex min-w-0 flex-col gap-6">
          <BoCardLg className="overflow-hidden">
            <div className="flex items-center justify-between border-b-[3px] border-zb-black bg-zb-blue px-4 py-2.5 text-white">
              <p className="font-display text-sm font-black uppercase tracking-widest">
                Live Leaderboard
              </p>
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">
                Realtime · Kill = 2 poin
              </span>
            </div>
            <div className="thin-scroll max-h-[520px] overflow-y-auto">
              <LeaderboardTable
                standings={standings.data?.standings ?? []}
                onTeamClick={openTeam}
                selectedTeamId={selected?.teamId}
                compact
              />
            </div>
            <p className="border-t-[3px] border-zb-black bg-zb-off px-4 py-2 text-[11px] font-semibold text-zb-black/50">
              Klik baris tim untuk melihat detail. Peringkat berubah otomatis saat panitia
              mempublikasikan hasil — tanpa refresh.
            </p>
          </BoCardLg>

          {selected ? (
            <TeamDetailPanel
              row={selected}
              team={teams.data?.find((t) => t.id === selected.teamId) ?? null}
              matchHistory={completedMatches.map((m) => ({
                match: m,
                result: history.find((h) => h.matchId === m.id)?.result,
              }))}
              onClose={() => setSelected(null)}
            />
          ) : null}
        </div>
      </div>

      {/* ===== BAWAH: TOP 3 ===== */}
      <section className="mt-10">
        <h2 className="bo-title mb-6">Top 3 Saat Ini</h2>
        <Top3Podium standings={standings.data?.standings ?? []} />
      </section>
    </div>
  );
}
