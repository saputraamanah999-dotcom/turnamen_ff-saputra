"use client";
// ============================================================
// /awards — Penghargaan resmi turnamen (§31 master prompt).
// Semua award DIHITUNG dari data resmi yang dipublikasikan,
// bukan dikarang. MVP pemain individu ditampilkan jujur sebagai
// belum tersedia bila tidak ada statistik pemain terverifikasi.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Crown, Crosshair, Medal, ShieldCheck, Star, Target } from "lucide-react";
import { BoBadge, BoCard, BoCardLg } from "@/components/common/bo";
import { DataStatusBanner, EmptyState } from "@/components/common/stat";
import { ChampionBanner } from "@/components/leaderboard/champion";
import { RankBadge } from "@/components/leaderboard/leaderboard";
import {
  fetchResultsOnce, useActiveTournament, useMatches, useStandings, useTeams,
} from "@/services/firestore/hooks";
import type { MatchResult } from "@/lib/types";

export default function AwardsPage() {
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

  // Most Kills — total kill tertinggi (dari klasemen resmi).
  const mostKills = useMemo(() => [...rows].sort((a, b) => b.kills - a.kills)[0] ?? null, [rows]);

  // Highest Kill Match — satu match dengan kill terbanyak oleh satu tim.
  const highestKillMatch = useMemo(() => {
    let best: { team: string; kills: number; match: string } | null = null;
    for (const [mid, results] of Object.entries(perMatch)) {
      for (const r of results) {
        if (!best || r.kills > best.kills) {
          const m = completed.find((c) => c.id === mid);
          best = { team: r.teamName, kills: r.kills, match: `Match ${m?.matchNumber ?? "?"}` };
        }
      }
    }
    return best;
  }, [perMatch, completed]);

  // Most Consistent Team — varians placement terkecil (min. 2 match).
  const mostConsistent = useMemo(() => {
    const placements = new Map<string, number[]>();
    for (const results of Object.values(perMatch)) {
      for (const r of results) {
        const arr = placements.get(r.teamId) ?? [];
        arr.push(r.placement);
        placements.set(r.teamId, arr);
      }
    }
    let best: { teamId: string; team: string; variance: number; n: number } | null = null;
    for (const [teamId, arr] of placements) {
      if (arr.length < 2) continue;
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
      const row = rows.find((r) => r.teamId === teamId);
      if (!best || variance < best.variance) {
        best = { teamId, team: row?.teamName ?? teamId, variance, n: arr.length };
      }
    }
    return best;
  }, [perMatch, rows]);

  if (!tid || !standings.data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <DataStatusBanner status={standings.status} />
        <EmptyState title="Penghargaan belum tersedia" description="Award dihitung dari hasil resmi setelah panitia mempublikasikan match." />
      </div>
    );
  }

  const totalMatches = tournament?.totalMatches ?? 0;
  const published = standings.data.publishedMatchCount;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <DataStatusBanner status={standings.status} />
      <span className="bo-kicker mb-2 inline-block bg-[#d9b45b] !text-zb-black">Penghargaan Resmi</span>
      <h1 className="bo-title mb-2">Awards BATTLE OFF FRIENDS</h1>
      <p className="mb-8 text-sm font-semibold text-zb-black/60">
        Dihitung otomatis dari {published} match resmi ({standings.data.scoringVersion}) — tanpa estimasi, tanpa data karangan.
      </p>

      {/* Champion tracking (juara hanya dikonfirmasi bila semua match selesai) */}
      <ChampionBanner standings={rows} totalMatches={totalMatches} publishedMatchCount={published} />

      {/* Podium */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {rows.slice(0, 3).map((r, i) => (
          <BoCard key={r.teamId} className={`p-5 ${i === 0 ? "bg-zb-yellow" : i === 1 ? "bg-zb-cyan" : "bg-zb-purple text-white"}`}>
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zb-black/60">
              {i === 0 ? <Crown className="h-4 w-4" /> : <Medal className="h-4 w-4" />}
              {i === 0 ? "Champion" : i === 1 ? "Runner-Up" : "Third Place"}
            </p>
            <p className="mt-1 font-display text-2xl font-black uppercase leading-tight">{r.teamName}</p>
            <p className="mt-1 text-sm font-bold opacity-70">[{r.teamTag}] · {r.totalPoints} poin · {r.kills} kill</p>
          </BoCard>
        ))}
      </div>

      {/* Award lainnya */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <BoCardLg className="bg-white p-5">
          <p className="flex items-center gap-2 font-display text-sm font-black uppercase tracking-wider">
            <Crosshair className="h-4 w-4 text-zb-blue" /> Most Kills
          </p>
          {mostKills ? (
            <div className="mt-3 flex items-center gap-3">
              <RankBadge rank={mostKills.rank} />
              <div>
                <p className="font-display text-lg font-black">{mostKills.teamName}</p>
                <p className="text-xs font-bold text-zb-black/60">{mostKills.kills} kill total · {mostKills.matchesPlayed} match</p>
              </div>
            </div>
          ) : <p className="mt-3 text-sm font-semibold text-zb-black/50">Belum ada data.</p>}
        </BoCardLg>

        <BoCardLg className="bg-white p-5">
          <p className="flex items-center gap-2 font-display text-sm font-black uppercase tracking-wider">
            <Target className="h-4 w-4 text-zb-purple" /> Highest Kill Match
          </p>
          {highestKillMatch ? (
            <p className="mt-3 font-display text-lg font-black">
              {highestKillMatch.kills} kill
              <span className="ml-2 text-xs font-bold text-zb-black/50">{highestKillMatch.team} · {highestKillMatch.match}</span>
            </p>
          ) : <p className="mt-3 text-sm font-semibold text-zb-black/50">Belum ada data.</p>}
        </BoCardLg>

        <BoCardLg className="bg-white p-5">
          <p className="flex items-center gap-2 font-display text-sm font-black uppercase tracking-wider">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> Most Consistent Team
          </p>
          {mostConsistent ? (
            <p className="mt-3 font-display text-lg font-black">
              {mostConsistent.team}
              <span className="ml-2 text-xs font-bold text-zb-black/50">
                varians placement {mostConsistent.variance.toFixed(2)} · {mostConsistent.n} match
              </span>
            </p>
          ) : <p className="mt-3 text-sm font-semibold text-zb-black/50">Butuh minimal 2 match resmi.</p>}
        </BoCardLg>

        <BoCardLg className="bg-zb-off p-5">
          <p className="flex items-center gap-2 font-display text-sm font-black uppercase tracking-wider">
            <Star className="h-4 w-4 text-[#d9b45b]" /> MVP Pemain
          </p>
          <p className="mt-3 text-sm font-semibold text-zb-black/60">
            Statistik pemain individu (kill per pemain) belum tersedia dari sumber resmi. Sesuai aturan platform,
            MVP <strong>tidak dikarang dari total kill tim</strong> — award ini muncul otomatis bila data individu
            terverifikasi tersedia.
          </p>
          <BoBadge className="mt-3 bg-zb-yellow text-zb-black">Menunggu data individu terverifikasi</BoBadge>
        </BoCardLg>
      </div>

      <p className="mt-8 text-xs font-semibold text-zb-black/50">
        Sumber: klasemen resmi {standings.data.scoringVersion} · {teams.data?.length ?? 0} tim terdaftar ·
        diperbarui otomatis realtime oleh sistem ZEROID ESPORTS.
      </p>
    </div>
  );
}
