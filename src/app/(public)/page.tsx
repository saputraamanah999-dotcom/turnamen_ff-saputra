"use client";
// ============================================================
// ZEROID ESPORTS — HOMEPAGE (Battle Off Friends)
// ============================================================

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  Eye,
  Radio,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { BoButton, BoCard, BoCardLg } from "@/components/common/bo";
import { DataStatusBanner, LiveDot, StatCounter } from "@/components/common/stat";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard";
import { Top3Podium } from "@/components/leaderboard/top3";
import { MatchCard, MatchInfoCard } from "@/components/tournament/match";
import {
  useActiveTournament,
  useMatches,
  useStandings,
  useTeams,
} from "@/services/firestore/hooks";
import { ORG } from "@/lib/constants";

export default function HomePage() {
  const router = useRouter();
  const { tournament, status } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const standings = useStandings(tid);
  const matches = useMatches(tid);
  const teams = useTeams(tid);

  const currentMatch =
    matches.data?.find((m) => m.isCurrent) ??
    matches.data?.find((m) => m.status === "live") ??
    null;
  const upcoming = matches.data?.filter((m) => m.status === "scheduled").slice(0, 3) ?? [];
  const latestCompleted = matches.data?.filter((m) => m.status === "completed").slice(-3).reverse() ?? [];
  const isLive = tournament?.liveStatus === "live" || currentMatch?.status === "live";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <DataStatusBanner status={status === "online" && standings.status === "online" ? "online" : standings.status} />

      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden border-[4px] border-zb-black bg-white bo-shadow-lg">
        <div className="bo-halftone absolute inset-0" aria-hidden />
        <div className="absolute -right-10 -top-10 h-56 w-56 rotate-12 border-[4px] border-zb-black bg-zb-cyan" aria-hidden />
        <div className="absolute -bottom-16 -left-14 h-52 w-52 -rotate-6 border-[4px] border-zb-black bg-zb-yellow" aria-hidden />
        <div className="absolute right-24 top-24 hidden h-16 w-16 rotate-45 border-[4px] border-zb-black bg-zb-purple lg:block" aria-hidden />

        <div className="relative px-5 py-12 sm:px-10 lg:px-14 lg:py-16">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="bo-kicker bg-zb-blue">{ORG.tournament}</span>
              <span className="bo-kicker bg-zb-purple">{ORG.institution}</span>
              {isLive ? <LiveDot /> : (
                <span className="bo-badge bg-white text-zb-black/70">
                  <Radio className="h-3 w-3" /> Stream Offline
                </span>
              )}
            </div>

            <h1 className="mt-5 font-display text-5xl font-black uppercase leading-[0.95] sm:text-6xl lg:text-7xl">
              ZEROID
              <span className="block text-zb-blue">ESPORTS</span>
            </h1>
            <p className="mt-4 max-w-2xl text-base font-semibold leading-relaxed text-zb-black/70 sm:text-lg">
              Platform manajemen turnamen Free Fire, leaderboard realtime, dan broadcast
              profesional untuk panggung esports sekolah. Dibangun dengan infrastruktur
              <strong> 100% gratis-first</strong> — tanpa server berbayar, tanpa API berbayar.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={tid ? `/live/${tid}` : "/live"}>
                <BoButton variant="primary" className="!px-6 !py-3 !text-base">
                  <Eye className="h-5 w-5" /> Tonton Live
                </BoButton>
              </Link>
              <Link href="/leaderboard">
                <BoButton variant="yellow" className="!px-6 !py-3 !text-base">
                  <Trophy className="h-5 w-5" /> Leaderboard
                </BoButton>
              </Link>
              <Link href="/about">
                <BoButton variant="white" className="!px-6 !py-3 !text-base">
                  Tentang Platform
                </BoButton>
              </Link>
            </div>
          </motion.div>

          {/* Stat strip */}
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeroStat icon={<Users className="h-5 w-5" />} label="Tim Berpartisipasi" value={teams.data?.length ?? 0} bg="bg-white" />
            <HeroStat icon={<Swords className="h-5 w-5" />} label="Total Kill Resmi" value={standings.data?.totalKills ?? 0} bg="bg-zb-cyan" />
            <HeroStat icon={<ShieldCheck className="h-5 w-5" />} label="Match Dipublikasikan" value={standings.data?.publishedMatchCount ?? 0} bg="bg-zb-yellow" />
            <HeroStat icon={<CalendarDays className="h-5 w-5" />} label="Total Match Format" value={tournament?.totalMatches ?? 0} bg="bg-white" />
          </div>
        </div>
      </section>

      {/* ============ TOP 3 ============ */}
      <section className="mt-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <span className="bo-kicker mb-2 inline-block bg-zb-purple">Klasemen Resmi</span>
            <h2 className="bo-title">Peringkat Teratas</h2>
          </div>
          <Link href="/leaderboard" className="bo-btn bo-btn-white hidden sm:inline-flex">
            Semua Peringkat <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <Top3Podium standings={standings.data?.standings ?? []} />
      </section>

      {/* ============ MATCH BERJALAN + LEADERBOARD ============ */}
      <section className="mt-12 grid min-w-0 gap-6 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <h2 className="bo-title mb-6">Match Berjalan</h2>
          <MatchInfoCard tournament={tournament} match={currentMatch} />
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {latestCompleted.map((m) => (
              <MatchCard key={m.id} match={m} href={`/matches/${m.id}?tid=${tid ?? ""}`} />
            ))}
          </div>
          {latestCompleted.length === 0 ? (
            <BoCard className="bg-white p-6 text-sm font-semibold text-zb-black/60">
              Belum ada match selesai. Hasil resmi akan muncul setelah panitia mempublikasikan.
            </BoCard>
          ) : null}
        </div>
        <div className="min-w-0 lg:col-span-2">
          <h2 className="bo-title mb-6">Live Leaderboard</h2>
          <BoCardLg className="overflow-hidden">
            <div className="border-b-[3px] border-zb-black bg-zb-blue px-4 py-2.5 text-white">
              <p className="font-display text-sm font-black uppercase tracking-widest">
                Klasemen {tournament?.shortName ?? "BOF"} · {standings.data?.publishedMatchCount ?? 0} match resmi
              </p>
            </div>
            <LeaderboardTable
              standings={standings.data?.standings ?? []}
              maxRows={8}
              compact
              status={standings.status}
              updatedAt={standings.data?.updatedAt}
              onTeamClick={(row) => router.push(`/teams/${row.teamId}?tid=${tid ?? ""}`)}
            />
            <div className="border-t-[3px] border-zb-black bg-zb-off px-4 py-2.5 text-center">
              <Link href="/leaderboard" className="text-xs font-black uppercase tracking-wider text-zb-blue hover:underline">
                Lihat klasemen lengkap →
              </Link>
            </div>
          </BoCardLg>
        </div>
      </section>

      {/* ============ UPCOMING ============ */}
      <section className="mt-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <span className="bo-kicker mb-2 inline-block bg-zb-cyan text-zb-black">Jadwal</span>
            <h2 className="bo-title">Match Berikutnya</h2>
          </div>
          <Link href="/matches" className="bo-btn bo-btn-white hidden sm:inline-flex">
            Semua Jadwal <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {upcoming.map((m) => (
            <MatchCard key={m.id} match={m} href={`/matches/${m.id}?tid=${tid ?? ""}`} />
          ))}
          {upcoming.length === 0 ? (
            <BoCard className="bg-white p-6 text-sm font-semibold text-zb-black/60 sm:col-span-3">
              Semua match telah berjalan atau jadwal belum diatur panitia.
            </BoCard>
          ) : null}
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="mt-12">
        <BoCardLg className="relative overflow-hidden bg-zb-black p-8 text-white sm:p-10">
          <div className="bo-stripe absolute inset-x-0 top-0 h-2" aria-hidden />
          <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <h2 className="font-display text-3xl font-black uppercase leading-tight">
                Siap Jadi Operator <span className="text-zb-yellow">BOF?</span>
              </h2>
              <p className="mt-2 max-w-xl text-sm font-semibold text-white/70">
                Panduan lengkap Bahasa Indonesia tersedia: setup Firebase, mirroring scrcpy,
                OBS Studio, overlay, streaming, sampai AI Observer.
              </p>
            </div>
            <div className="flex gap-3">
              <Link href="/guide">
                <BoButton variant="yellow" className="!px-5 !py-3">Buka Panduan</BoButton>
              </Link>
              <Link href="/admin">
                <BoButton variant="white" className="!px-5 !py-3">Panel Admin</BoButton>
              </Link>
            </div>
          </div>
        </BoCardLg>
      </section>
    </div>
  );
}

function HeroStat({
  icon,
  label,
  value,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  bg: string;
}) {
  return (
    <div className={`bo-card border-[3px] px-4 py-3 ${bg}`}>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zb-black/60">
        {icon} {label}
      </p>
      <p className="mt-1 font-display text-3xl font-black tabular-nums leading-none">
        <StatCounter value={value} />
      </p>
    </div>
  );
}
