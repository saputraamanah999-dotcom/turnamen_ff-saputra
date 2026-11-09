"use client";
// /teams/:teamId — detail tim: statistik + riwayat hasil per match
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BoBadge, BoCard } from "@/components/common/bo";
import { DataStatusBanner, EmptyState } from "@/components/common/stat";
import { RankBadge, TeamInitials } from "@/components/leaderboard/leaderboard";
import {
  useActiveTournament,
  useStandings,
  useTeams,
  useTournament,
  fetchResultsOnce,
} from "@/services/firestore/hooks";
import { useMatches } from "@/services/firestore/hooks";
import type { MatchResult } from "@/lib/types";
import { formatDateTime } from "@/lib/constants";

export default function TeamDetailPage() {
  const params = useParams<{ teamId: string }>();
  const search = useSearchParams();
  const teamId = params?.teamId ?? null;
  const { tournament: activeTournament } = useActiveTournament();
  const tid = search.get("tid") || activeTournament?.id || null;

  const tournament = useTournament(tid);
  const teams = useTeams(tid);
  const standings = useStandings(tid);
  const matches = useMatches(tid);

  const team = teams.data?.find((t) => t.id === teamId) ?? null;
  const row = standings.data?.standings.find((s) => s.teamId === teamId) ?? null;

  const completedMatches = useMemo(
    () => matches.data?.filter((m) => m.resultsPublished).sort((a, b) => a.matchNumber - b.matchNumber) ?? [],
    [matches.data],
  );
  const [results, setResults] = useState<Record<string, MatchResult | undefined>>({});

  // Muat hasil tim per match (sekali per daftar match selesai).
  const loadedKey = useMemo(() => completedMatches.map((m) => m.id).join(","), [completedMatches]);
  useEffect(() => {
    if (!tid || !teamId || !loadedKey) return;
    let cancelled = false;
    (async () => {
      const out: Record<string, MatchResult | undefined> = {};
      for (const m of completedMatches) {
        const list = (await fetchResultsOnce(tid, m.id)) as (MatchResult & { id: string })[];
        out[m.id] = list.find((r) => r.teamId === teamId);
      }
      if (!cancelled) setResults(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadedKey, tid, teamId]);

  if (!team) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState title="Tim tidak ditemukan" description="Tim mungkin telah dihapus atau tautan salah." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <DataStatusBanner status={standings.status} />
      <Link href="/teams" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-zb-blue hover:underline">
        <ArrowLeft className="h-4 w-4" /> Semua Tim
      </Link>

      <BoCard className="bg-fs-panel p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="border border-fs-edge bo-shadow">
            <TeamInitials name={team.name} size="lg" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-black uppercase leading-none">{team.name}</h1>
            <p className="mt-1 text-sm font-bold uppercase tracking-wider text-fs-text/50">
              [{team.tag || "—"}] · Tim #{team.number} · {tournament.data?.name ?? ""}
            </p>
          </div>
          {row ? <RankBadge rank={row.rank} className="!h-12 !w-12 !text-lg" /> : null}
        </div>
        {team.description ? (
          <p className="mt-4 border-l-4 border-zb-purple pl-3 text-sm italic text-fs-text/70">
            {team.description}
          </p>
        ) : null}
        {team.roster?.length ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {team.roster.map((m) => (
              <BoBadge key={m.nickname} className="bg-zb-cyan">
                {m.nickname}{m.role ? ` · ${m.role}` : ""}
              </BoBadge>
            ))}
          </div>
        ) : null}
      </BoCard>

      {row ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCell label="Total Poin" value={row.totalPoints} bg="bg-zb-yellow" />
          <StatCell label="Kill" value={row.kills} bg="bg-zb-cyan" />
          <StatCell label="Kill Points" value={row.killPoints} bg="bg-fs-panel" />
          <StatCell label="Placement Pts" value={row.placementPoints} bg="bg-fs-panel" />
          <StatCell label="Match Main" value={row.matchesPlayed} bg="bg-zb-purple text-white" />
        </div>
      ) : (
        <p className="mt-6 text-sm font-bold text-fs-text/60">
          Tim ini belum memiliki hasil yang dipublikasikan.
        </p>
      )}

      <section className="mt-8">
        <h2 className="bo-title mb-4">Riwayat Hasil</h2>
        {completedMatches.length === 0 ? (
          <EmptyState title="Belum ada match resmi" />
        ) : (
          <div className="space-y-3">
            {completedMatches.map((m) => {
              const r = results[m.id];
              return (
                <BoCard key={m.id} className="flex items-center justify-between gap-3 bg-fs-panel px-4 py-3">
                  <div>
                    <p className="font-display text-sm font-black uppercase">
                      Match {m.matchNumber} · {m.map}
                    </p>
                    <p className="text-xs font-semibold text-fs-text/50">
                      {formatDateTime(m.scheduledAt ?? undefined)} · {m.format}
                    </p>
                  </div>
                  {r ? (
                    <div className="flex items-center gap-2 text-sm font-black tabular-nums">
                      <BoBadge className="bg-zb-yellow">#{r.placement}</BoBadge>
                      <BoBadge>{r.kills} kill</BoBadge>
                      <BoBadge className="bg-fs-head text-white">{r.totalPoints} poin</BoBadge>
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-fs-text/40">—</span>
                  )}
                </BoCard>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCell({ label, value, bg }: { label: string; value: number; bg: string }) {
  return (
    <div className={`bo-card-flat px-3 py-3 text-center ${bg}`}>
      <p className="font-display text-2xl font-black tabular-nums">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-fs-text/60">{label}</p>
    </div>
  );
}
