"use client";
// /matches/:matchId — hasil lengkap satu match
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BoBadge, BoCard } from "@/components/common/bo";
import { DataStatusBanner, EmptyState } from "@/components/common/stat";
import { MatchStatusBadge } from "@/components/tournament/match";
import { useActiveTournament, useMatches, useTournament, fetchResultsOnce } from "@/services/firestore/hooks";
import type { MatchResult } from "@/lib/types";
import { formatDateTime } from "@/lib/constants";

export default function MatchDetailPage() {
  const params = useParams<{ matchId: string }>();
  const search = useSearchParams();
  const matchId = params?.matchId ?? null;
  const { tournament: activeTournament } = useActiveTournament();
  const tid = search.get("tid") || activeTournament?.id || null;

  const tournament = useTournament(tid);
  const matches = useMatches(tid);
  const match = matches.data?.find((m) => m.id === matchId) ?? null;

  const [results, setResults] = useState<MatchResult[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!tid || !matchId || !match?.resultsPublished) return;
    let cancelled = false;
    fetchResultsOnce(tid, matchId).then((list) => {
      if (cancelled) return;
      setResults((list as (MatchResult & { id: string })[]).sort((a, b) => a.placement - b.placement));
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [tid, matchId, match?.resultsPublished]);

  const published = Boolean(match?.resultsPublished);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <DataStatusBanner status={matches.status} />
      <Link href="/matches" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-zb-blue hover:underline">
        <ArrowLeft className="h-4 w-4" /> Semua Match
      </Link>

      {!match ? (
        <EmptyState title="Match tidak ditemukan" />
      ) : (
        <>
          <BoCard className="bg-fs-panel p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bo-kicker bg-zb-purple">Match {match.matchNumber}</span>
              <MatchStatusBadge status={match.status} />
              {published ? <BoBadge className="bg-zb-yellow">Hasil Resmi</BoBadge> : null}
              <span className="ml-auto text-xs font-bold uppercase tracking-wider text-fs-text/40">
                {match.format} · {formatDateTime(match.scheduledAt ?? undefined)}
              </span>
            </div>
            <h1 className="mt-3 font-display text-3xl font-black uppercase">{match.map}</h1>
            <p className="mt-1 text-sm font-semibold text-fs-text/60">
              Turnamen {tournament.data?.name ?? ""} · versi aturan {match.scoringVersion}
            </p>
          </BoCard>

          <section className="mt-6">
            <h2 className="bo-title mb-4">Hasil</h2>
            {!published ? (
              <EmptyState
                title="Hasil belum dipublikasikan"
                description="Hasil resmi akan muncul setelah panitia mempublikasikan dari panel admin."
              />
            ) : loaded && results.length === 0 ? (
              <EmptyState title="Belum ada entri hasil" />
            ) : (
              <BoCard className="overflow-hidden bg-fs-panel">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-fs-head text-white">
                      <th className="px-2 py-2 text-center font-display text-xs uppercase tracking-wider w-14">Rank</th>
                      <th className="px-3 py-2 text-left font-display text-xs uppercase tracking-wider">Tim</th>
                      <th className="px-2 py-2 text-center font-display text-xs uppercase tracking-wider w-16">Kill</th>
                      <th className="px-2 py-2 text-center font-display text-xs uppercase tracking-wider w-24">Poin Placement</th>
                      <th className="px-2 py-2 text-center font-display text-xs uppercase tracking-wider w-20">Poin Kill</th>
                      <th className="px-2 py-2 text-center font-display text-xs uppercase tracking-wider w-20">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.teamId} className="border-b border-fs-edge/15 bg-fs-panel">
                        <td className="px-2 py-2 text-center font-black tabular-nums">#{r.placement}</td>
                        <td className="px-3 py-2 font-bold">
                          {r.teamName}
                          {r.teamTag ? <span className="ml-1 text-xs text-fs-text/50">[{r.teamTag}]</span> : null}
                        </td>
                        <td className="px-2 py-2 text-center tabular-nums">{r.kills}</td>
                        <td className="px-2 py-2 text-center tabular-nums">{r.placementPoints}</td>
                        <td className="px-2 py-2 text-center tabular-nums">{r.killPoints}</td>
                        <td className="px-2 py-2 text-center font-display text-base font-black tabular-nums">
                          {r.totalPoints}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </BoCard>
            )}
          </section>
        </>
      )}
    </div>
  );
}
