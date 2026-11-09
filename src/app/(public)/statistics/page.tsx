"use client";
// ============================================================
// /statistics — statistik turnamen dari data resmi + filter
// ============================================================

import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { BoCard, BoBadge } from "@/components/common/bo";
import { DataStatusBanner, EmptyState } from "@/components/common/stat";
import { useActiveTournament, useMatches, useStandings, useTeams, fetchResultsOnce } from "@/services/firestore/hooks";
import type { MatchResult } from "@/lib/types";

const COLORS = ["#182CFF", "#8150F5", "#66F0E6", "#FFE600", "#D9B45B", "#111111"];

export default function StatisticsPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const standings = useStandings(tid);
  const matches = useMatches(tid);
  const teams = useTeams(tid);

  const completed = useMemo(
    () => matches.data?.filter((m) => m.resultsPublished).sort((a, b) => a.matchNumber - b.matchNumber) ?? [],
    [matches.data],
  );
  const [perMatch, setPerMatch] = useState<Record<string, MatchResult[]>>({});
  const [teamFilter, setTeamFilter] = useState<string>("ALL");

  const key = completed.map((c) => c.id).join(",");
  useEffect(() => {
    if (!tid || !key) return;
    (async () => {
      const out: Record<string, MatchResult[]> = {};
      for (const m of completed) {
        const list = (await fetchResultsOnce(tid, m.id)) as (MatchResult & { id: string })[];
        out[m.id] = list;
      }
      setPerMatch(out);
    })();
     
  }, [key, tid]);

  const killsPerTeam = useMemo(() => {
    const rows = (standings.data?.standings ?? [])
      .filter((r) => teamFilter === "ALL" || r.teamId === teamFilter)
      .map((r) => ({ name: r.teamTag || r.teamName.slice(0, 10), kill: r.kills, poin: r.totalPoints }));
    return rows.sort((a, b) => b.kill - a.kill);
  }, [standings.data, teamFilter]);

  const trendPerMatch = useMemo(() => {
    return completed.map((m) => {
      const results = perMatch[m.id] ?? [];
      const sorted = [...results].sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 3);
      const obj: Record<string, number | string> = { name: `M${m.matchNumber}` };
      sorted.forEach((r) => {
        const tag = r.teamTag || r.teamName.slice(0, 8);
        obj[tag] = r.totalPoints;
      });
      return obj;
    });
  }, [completed, perMatch]);

  const placementDistribution = useMemo(() => {
    const count = new Map<number, number>();
    Object.values(perMatch).flat().forEach((r) => {
      if (teamFilter !== "ALL" && r.teamId !== teamFilter) return;
      count.set(r.placement, (count.get(r.placement) ?? 0) + 1);
    });
    return [...count.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([placement, total]) => ({ name: `Rank ${placement}`, value: total }));
  }, [perMatch, teamFilter]);

  const bestMatchPoints = useMemo<{ team: string; points: number; match: string } | null>(() => {
    let best: { team: string; points: number; match: string } | null = null;
    for (const [mid, results] of Object.entries(perMatch)) {
      for (const r of results) {
        if (!best || r.totalPoints > best.points) {
          const m = completed.find((c) => c.id === mid);
          best = { team: r.teamName, points: r.totalPoints, match: `Match ${m?.matchNumber ?? ""}` };
        }
      }
    }
    return best;
  }, [perMatch, completed]);

  if (!tid || !standings.data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <DataStatusBanner status={standings.status} />
        <EmptyState title="Statistik belum tersedia" description="Menunggu data hasil resmi dari panitia." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <DataStatusBanner status={standings.status} />
      <span className="bo-kicker mb-2 inline-block bg-zb-purple">Analitik</span>
      <h1 className="bo-title mb-6">Statistik Turnamen</h1>
      <p className="mb-6 text-sm font-semibold text-fs-text/60">
        Seluruh angka dihitung dari hasil match yang telah dipublikasikan — tanpa estimasi.
      </p>

      {/* Filter */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-black uppercase tracking-wider text-fs-text/50">Filter Tim:</span>
        <button
          onClick={() => setTeamFilter("ALL")}
          className={`bo-badge ${teamFilter === "ALL" ? "bg-fs-head text-white" : "bg-fs-panel"}`}
        >
          Semua
        </button>
        {teams.data?.map((t) => (
          <button
            key={t.id}
            onClick={() => setTeamFilter(t.id)}
            className={`bo-badge ${teamFilter === t.id ? "bg-fs-head text-white" : "bg-fs-panel"}`}
          >
            {t.tag || t.name}
          </button>
        ))}
      </div>

      {/* Highlight */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <BoCard className="bg-zb-yellow p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-fs-text/60">Total Kill Resmi</p>
          <p className="font-display text-3xl font-black tabular-nums">{standings.data.totalKills}</p>
        </BoCard>
        <BoCard className="bg-zb-cyan p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-fs-text/60">Rata-rata Kill/Match</p>
          <p className="font-display text-3xl font-black tabular-nums">
            {standings.data.publishedMatchCount > 0
              ? Math.round((standings.data.totalKills / standings.data.publishedMatchCount) * 10) / 10
              : 0}
          </p>
        </BoCard>
        <BoCard className="bg-fs-panel p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-fs-text/60">Poin Tertinggi Satu Match</p>
          {bestMatchPoints ? (
            <p className="font-display text-xl font-black">
              {bestMatchPoints.points} <span className="text-xs text-fs-text/50">— {bestMatchPoints.team} ({bestMatchPoints.match})</span>
            </p>
          ) : (
            <p className="font-display text-xl font-black">—</p>
          )}
        </BoCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Kill per tim */}
        <BoCard className="p-4">
          <h2 className="mb-4 font-display text-lg font-black uppercase">Kill per Tim</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={killsPerTeam}>
                <CartesianGrid strokeDasharray="3 3" stroke="#11111122" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} interval={0} angle={-35} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip wrapperClassName="!border-[3px] !border-black !font-bold" />
                <Bar dataKey="kill" name="Kill" fill="#182CFF" stroke="#111" strokeWidth={2} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </BoCard>

        {/* Tren poin per match */}
        <BoCard className="p-4">
          <h2 className="mb-4 font-display text-lg font-black uppercase">Tren Poin (Top 3 Tiap Match)</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendPerMatch}>
                <CartesianGrid strokeDasharray="3 3" stroke="#11111122" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip wrapperClassName="!border-[3px] !border-black !font-bold" />
                <Legend wrapperStyle={{ fontWeight: 700, fontSize: 12 }} />
                {Array.from(
                  new Set(trendPerMatch.flatMap((o) => Object.keys(o).filter((k) => k !== "name"))),
                ).map((k, i) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={3}
                    connectNulls
                    isAnimationActive={false}
                    dot={{ strokeWidth: 2, r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </BoCard>

        {/* Distribusi placement */}
        <BoCard className="p-4 lg:col-span-2">
          <h2 className="mb-4 font-display text-lg font-black uppercase">Distribusi Placement</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={placementDistribution}
                  dataKey="value"
                  nameKey="name"
                  cx="50%" cy="50%"
                  outerRadius={110}
                  innerRadius={55}
                  label={(d: { name?: string; value?: number }) => `${d.name}: ${d.value}`}
                  labelLine={false}
                  isAnimationActive={false}
                >
                  {placementDistribution.map((entry, i) => (
                    <Cell key={entry.name} fill={COLORS[i % COLORS.length]} stroke="#111" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip wrapperClassName="!border-[3px] !border-black !font-bold" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </BoCard>
      </div>

      <p className="mt-6">
        <BoBadge className="bg-fs-bg">
          Sumber: {standings.data.publishedMatchCount} match resmi · {standings.data.scoringVersion}
        </BoBadge>
      </p>
    </div>
  );
}
