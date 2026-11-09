"use client";
// /results — rekap semua hasil yang sudah dipublikasikan
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BoCard } from "@/components/common/bo";
import { DataStatusBanner, EmptyState } from "@/components/common/stat";
import { useActiveTournament, useMatches, fetchResultsOnce } from "@/services/firestore/hooks";
import type { MatchResult } from "@/lib/types";
import { formatDateTime } from "@/lib/constants";

export default function ResultsPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const matches = useMatches(tid);
  const completed = useMemo(
    () => matches.data?.filter((m) => m.resultsPublished).sort((a, b) => b.matchNumber - a.matchNumber) ?? [],
    [matches.data],
  );
  const [data, setData] = useState<Record<string, MatchResult[]>>({});

  useEffect(() => {
    if (!tid || !completed.length) return;
    (async () => {
      const out: Record<string, MatchResult[]> = {};
      for (const m of completed) {
        const list = (await fetchResultsOnce(tid, m.id)) as (MatchResult & { id: string })[];
        out[m.id] = list.sort((a, b) => a.placement - b.placement);
      }
      setData(out);
    })();
     
  }, [tid, completed.map((c) => c.id).join(",")]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <DataStatusBanner status={matches.status} />
      <span className="bo-kicker mb-2 inline-block bg-zb-yellow text-fs-ink">Arsip</span>
      <h1 className="bo-title mb-6">Hasil Resmi</h1>

      {completed.length === 0 ? (
        <EmptyState title="Belum ada hasil yang dipublikasikan" />
      ) : (
        <div className="space-y-6">
          {completed.map((m) => (
            <div key={m.id}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-black uppercase">
                  Match {m.matchNumber} — {m.map}
                </h2>
                <Link
                  href={`/matches/${m.id}?tid=${tid ?? ""}`}
                  className="text-xs font-black uppercase tracking-wider text-zb-blue hover:underline"
                >
                  Detail →
                </Link>
              </div>
              <BoCard className="overflow-x-auto bg-fs-panel">
                <table className="w-full min-w-[480px] border-collapse text-sm">
                  <tbody>
                    {(data[m.id] ?? []).map((r) => (
                      <tr key={r.teamId} className="border-b-2 border-fs-edge/10 last:border-b-0">
                        <td className="w-12 px-3 py-1.5 text-center font-black tabular-nums">#{r.placement}</td>
                        <td className="px-2 py-1.5 font-bold">{r.teamName}</td>
                        <td className="w-16 px-2 py-1.5 text-center tabular-nums">{r.kills} kill</td>
                        <td className="w-20 px-2 py-1.5 text-right font-display font-black tabular-nums">
                          {r.totalPoints}
                        </td>
                      </tr>
                    ))}
                    {!data[m.id] ? (
                      <tr><td className="px-3 py-2 text-xs font-bold text-fs-text/40">Memuat hasil…</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </BoCard>
              <p className="mt-1 text-[11px] font-semibold text-fs-text/40">
                Dipublikasikan · {formatDateTime(m.scheduledAt ?? undefined)} · versi {m.scoringVersion}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
