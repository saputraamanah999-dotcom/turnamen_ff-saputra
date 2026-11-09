"use client";
// ============================================================
// /admin/statistics — Statistik & analitik turnamen untuk admin.
// Sebelumnya item menu ini 404 karena halamannya tidak ada.
// Seluruh angka dihitung dari data resmi Firestore realtime
// (publicLeaderboards + subcollection results), tanpa estimasi.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Activity, Crosshair, ExternalLink, RefreshCw, Swords, Timer, TrendingUp, Trophy, Users,
} from "lucide-react";
import { BoBadge, BoButton, BoCard, BoCardLg } from "@/components/common/bo";
import { DataStatusBanner, EmptyState, StatCounter } from "@/components/common/stat";
import { MovementIcon, RankBadge, formatUpdatedAt } from "@/components/leaderboard/leaderboard";
import {
  fetchResultsOnce, useActiveTournament, useMatches, useStandings, useTeams,
} from "@/services/firestore/hooks";
import type { MatchResult } from "@/lib/types";

const COLORS = ["#182CFF", "#8150F5", "#66F0E6", "#FFE600", "#D9B45B", "#111111"];

export default function AdminStatisticsPage() {
  const router = useRouter();
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
  const key = completed.map((c) => c.id).join(",");
  useEffect(() => {
    if (!tid || !key) return;
    let cancelled = false;
    (async () => {
      const out: Record<string, MatchResult[]> = {};
      for (const m of completed) {
        const list = (await fetchResultsOnce(tid, m.id)) as (MatchResult & { id: string })[];
        out[m.id] = list;
      }
      if (!cancelled) setPerMatch(out);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tid]);

  const rows = standings.data?.standings ?? [];

  // ---------- Agregasi ----------
  const totalPoints = useMemo(() => rows.reduce((a, r) => a + r.totalPoints, 0), [rows]);

  const bestMatchPoints = useMemo<{ team: string; points: number; match: string } | null>(() => {
    let best: { team: string; points: number; match: string } | null = null;
    for (const [mid, results] of Object.entries(perMatch)) {
      for (const r of results) {
        if (!best || r.totalPoints > best.points) {
          const m = completed.find((c) => c.id === mid);
          best = { team: r.teamName, points: r.totalPoints, match: `Match ${m?.matchNumber ?? "?"}` };
        }
      }
    }
    return best;
  }, [perMatch, completed]);

  const killsPerTeam = useMemo(
    () => [...rows]
      .map((r) => ({ name: r.teamTag || r.teamName.slice(0, 10), kill: r.kills, poin: r.totalPoints }))
      .sort((a, b) => b.kill - a.kill),
    [rows],
  );

  // Tren poin KUMULATIF 5 tim teratas per match resmi (bukan per-match terpisah).
  const trendTop5 = useMemo(() => {
    const top5 = rows.slice(0, 5);
    const cum = new Map(top5.map((r) => [r.teamId, 0]));
    const tagOf = new Map(top5.map((r) => [r.teamId, r.teamTag || r.teamName.slice(0, 8)]));
    return completed.map((m) => {
      const obj: Record<string, number | string> = { name: `M${m.matchNumber}` };
      for (const r of perMatch[m.id] ?? []) {
        if (!cum.has(r.teamId)) continue;
        const nv = (cum.get(r.teamId) ?? 0) + r.totalPoints;
        cum.set(r.teamId, nv);
        obj[tagOf.get(r.teamId) ?? r.teamId] = nv;
      }
      return obj;
    });
  }, [completed, perMatch, rows]);

  const placementDistribution = useMemo(() => {
    const count = new Map<number, number>();
    for (const results of Object.values(perMatch)) {
      for (const r of results) count.set(r.placement, (count.get(r.placement) ?? 0) + 1);
    }
    return [...count.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([placement, value]) => ({ name: `Rank ${placement}`, value }));
  }, [perMatch]);

  const movers = useMemo(
    () => rows.filter((r) => r.movement === "up" || r.movement === "down").slice(0, 4),
    [rows],
  );
  const updated = formatUpdatedAt(standings.data?.updatedAt);

  if (!tid || !standings.data) {
    return (
      <div>
        <h1 className="font-display text-2xl font-black uppercase">Statistik</h1>
        <DataStatusBanner status={standings.status} />
        <EmptyState
          title="Statistik belum tersedia"
          description="Buat turnamen, tambahkan tim, lalu publish hasil match pertama melalui menu Match → Entri Hasil."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="bo-kicker mb-2 inline-block bg-zb-purple">Analitik Admin</span>
          <h1 className="font-display text-2xl font-black uppercase leading-none">
            Statistik {tournament?.name ?? "Turnamen"}
          </h1>
          <p className="mt-1 text-sm font-semibold text-zb-black/60">
            Semua angka realtime dari data resmi — {standings.data.scoringVersion}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {updated ? (
            <BoBadge className="bg-white">
              <RefreshCw className="mr-1 inline h-3 w-3" /> Update {updated}
            </BoBadge>
          ) : null}
          <Link href="/statistics">
            <BoButton variant="white">
              <ExternalLink className="h-4 w-4" /> Statistik Publik
            </BoButton>
          </Link>
        </div>
      </div>

      <DataStatusBanner status={standings.status} />

      {/* KPI utama */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <BoCard className="bg-white p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zb-black/60">
            <Users className="h-3.5 w-3.5" /> Total Tim
          </p>
          <p className="font-display text-3xl font-black tabular-nums">
            <StatCounter value={teams.data?.length ?? rows.length} />
          </p>
        </BoCard>
        <BoCard className="bg-zb-cyan p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zb-black/60">
            <Timer className="h-3.5 w-3.5" /> Match Resmi
          </p>
          <p className="font-display text-3xl font-black tabular-nums">
            <StatCounter value={standings.data.publishedMatchCount} />
            <span className="text-base text-zb-black/50">/{tournament?.totalMatches ?? "-"}</span>
          </p>
        </BoCard>
        <BoCard className="bg-zb-yellow p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zb-black/60">
            <Crosshair className="h-3.5 w-3.5" /> Total Kill
          </p>
          <p className="font-display text-3xl font-black tabular-nums">
            <StatCounter value={standings.data.totalKills} />
          </p>
        </BoCard>
        <BoCard className="bg-zb-purple p-4 text-white">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/70">
            <TrendingUp className="h-3.5 w-3.5" /> Total Poin
          </p>
          <p className="font-display text-3xl font-black tabular-nums">
            <StatCounter value={totalPoints} />
          </p>
        </BoCard>
        <BoCard className="bg-white p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zb-black/60">
            <Activity className="h-3.5 w-3.5" /> Rata Kill/Match
          </p>
          <p className="font-display text-3xl font-black tabular-nums">
            {standings.data.publishedMatchCount > 0
              ? Math.round((standings.data.totalKills / standings.data.publishedMatchCount) * 10) / 10
              : 0}
          </p>
        </BoCard>
        <BoCard className="bg-white p-4">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zb-black/60">
            <Swords className="h-3.5 w-3.5" /> Poin Tertinggi
          </p>
          {bestMatchPoints ? (
            <p className="font-display text-xl font-black leading-tight">
              {bestMatchPoints.points}
              <span className="ml-1 text-[10px] font-bold text-zb-black/50">
                {bestMatchPoints.team} · {bestMatchPoints.match}
              </span>
            </p>
          ) : (
            <p className="font-display text-xl font-black">—</p>
          )}
        </BoCard>
      </div>

      {/* Pergerakan terkini */}
      {movers.length ? (
        <BoCard className="bg-white p-4">
          <p className="mb-3 flex items-center gap-2 font-display text-sm font-black uppercase tracking-wider">
            <Activity className="h-4 w-4 text-zb-blue" /> Pergerakan Peringkat Terkini
          </p>
          <div className="flex flex-wrap gap-2">
            {movers.map((m) => (
              <span key={m.teamId} className="bo-badge inline-flex items-center gap-1.5 bg-zb-off">
                <RankBadge rank={m.rank} className="h-6 w-6 !border-2 text-xs" />
                {m.teamName}
                <span className="inline-flex items-center gap-0.5 font-black">
                  <MovementIcon movement={m.movement} />
                  {m.movement === "up" ? `naik ke #${m.rank}` : `turun ke #${m.rank}`}
                </span>
              </span>
            ))}
          </div>
        </BoCard>
      ) : null}

      {/* Grafik */}
      <div className="grid gap-4 lg:grid-cols-2">
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

        <BoCard className="p-4">
          <h2 className="mb-4 font-display text-lg font-black uppercase">Tren Poin Kumulatif (Top 5)</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendTop5}>
                <CartesianGrid strokeDasharray="3 3" stroke="#11111122" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip wrapperClassName="!border-[3px] !border-black !font-bold" />
                {Array.from(
                  new Set(trendTop5.flatMap((o) => Object.keys(o).filter((k) => k !== "name"))),
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

        <BoCard className="p-4 lg:col-span-2">
          <h2 className="mb-4 font-display text-lg font-black uppercase">Distribusi Placement (semua match resmi)</h2>
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

      {/* Tabel detail lengkap */}
      <BoCardLg className="overflow-hidden">
        <div className="flex items-center justify-between border-b-[3px] border-zb-black bg-zb-black px-4 py-2.5 text-white">
          <p className="flex items-center gap-2 font-display text-sm font-black uppercase tracking-widest">
            <Trophy className="h-4 w-4 text-zb-yellow" /> Rincian Klasemen Lengkap
          </p>
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">
            Klik baris → profil tim
          </span>
        </div>
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-zb-off">
                {["Rank", "Tim", "Main", "Kill", "Placement Pts", "Kill Pts", "Total", "Δ"].map((h, i) => (
                  <th
                    key={h}
                    className={`border-b-[3px] border-zb-black px-3 py-2 font-display text-xs font-black uppercase tracking-wider ${i === 1 ? "text-left" : "text-center"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.teamId}
                  onClick={() => router.push(`/teams/${r.teamId}?tid=${tid}`)}
                  className="cursor-pointer border-b-2 border-zb-black/10 bg-white transition-colors hover:bg-zb-yellow/25"
                >
                  <td className="px-3 py-2 text-center"><RankBadge rank={r.rank} /></td>
                  <td className="px-3 py-2">
                    <p className="font-display text-sm font-bold">{r.teamName}</p>
                    {r.teamTag ? <p className="text-[10px] font-bold uppercase text-zb-black/50">[{r.teamTag}]</p> : null}
                  </td>
                  <td className="px-3 py-2 text-center font-bold tabular-nums">{r.matchesPlayed}</td>
                  <td className="px-3 py-2 text-center font-bold tabular-nums">{r.kills}</td>
                  <td className="px-3 py-2 text-center font-semibold tabular-nums text-zb-black/70">{r.placementPoints}</td>
                  <td className="px-3 py-2 text-center font-semibold tabular-nums text-zb-black/70">{r.killPoints}</td>
                  <td className="px-3 py-2 text-center font-display text-base font-black tabular-nums">{r.totalPoints}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="inline-flex h-5 w-5 items-center justify-center border-[2px] border-zb-black/20 bg-white">
                      <MovementIcon movement={r.movement} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </BoCardLg>
    </div>
  );
}
