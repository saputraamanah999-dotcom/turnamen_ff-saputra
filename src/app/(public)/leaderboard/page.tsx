"use client";
// /leaderboard — daftar turnamen + klasemen lengkap dengan detail skor
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BoCard } from "@/components/common/bo";
import { DataStatusBanner, EmptyState } from "@/components/common/stat";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard";
import { Top3Podium } from "@/components/leaderboard/top3";
import { ChampionBanner } from "@/components/leaderboard/champion";
import { ChampionCertificates } from "@/components/leaderboard/certificate";
import { useActiveTournament, useStandings } from "@/services/firestore/hooks";
import { OFFICIAL_PLACEMENT_POINTS } from "@/lib/constants";
import { computeChampion } from "@/lib/scoring";

export default function LeaderboardIndexPage() {
  const router = useRouter();
  const { tournament, status } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const standings = useStandings(tid);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <DataStatusBanner status={standings.status} />
      <span className="bo-kicker mb-2 inline-block bg-zb-purple">Klasemen Resmi</span>
      <h1 className="bo-title mb-6">Leaderboard {tournament?.name ?? ""}</h1>

      {standings.data && standings.data.standings.length ? (
        <div className="mb-6 space-y-4">
          <Top3Podium standings={standings.data.standings} />
          <ChampionBanner
            standings={standings.data.standings}
            totalMatches={tournament?.totalMatches ?? 0}
            publishedMatchCount={standings.data.publishedMatchCount ?? 0}
          />
        </div>
      ) : null}

      {standings.data ? (
        <BoCard className="overflow-hidden bg-fs-panel">
          <LeaderboardTable
            standings={standings.data.standings}
            status={standings.status}
            updatedAt={standings.data.updatedAt}
            onTeamClick={(row) => router.push(`/teams/${row.teamId}?tid=${tid ?? ""}`)}
          />
          <div className="grid grid-cols-2 gap-px border-t border-fs-edge bg-fs-head sm:grid-cols-4">
            <MiniStat label="Match Resmi" value={String(standings.data.publishedMatchCount)} bg="bg-fs-panel" />
            <MiniStat label="Total Kill" value={String(standings.data.totalKills)} bg="bg-zb-cyan" />
            <MiniStat label="Poin Kill/Kill" value="2" bg="bg-zb-yellow" />
            <MiniStat label="Versi Aturan" value={standings.data.scoringVersion ?? "-"} bg="bg-fs-panel" />
          </div>
        </BoCard>
      ) : (
        <EmptyState
          title="Klasemen belum tersedia"
          description="Klasemen resmi akan muncul setelah panitia mempublikasikan hasil match pertama."
        />
      )}

      {/* SERTIFIKAT JUARA — muncul otomatis saat SEMUA match selesai (bawah-tengah). */}
      {standings.data ? (
        <div className="flex justify-center">
          <div className="w-full max-w-5xl">
            <ChampionCertificates
              standings={standings.data.standings}
              tournamentName={tournament?.name ?? "BATTLE OFF FRIENDS"}
              ready={
                tournament?.status === "completed" ||
                computeChampion(
                  standings.data.standings,
                  tournament?.totalMatches ?? 0,
                  standings.data.publishedMatchCount ?? 0,
                ).confirmed
              }
            />
          </div>
        </div>
      ) : null}

      <section className="mt-8">
        <h2 className="font-display text-xl font-black uppercase">Sistem Poin Resmi BOF</h2>
        <p className="mt-2 text-sm font-semibold text-fs-text/60">
          Poin placement resmi + 2 poin per kill. Tiebreaker: total poin → placement points → placement game terakhir sesuai format.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {OFFICIAL_PLACEMENT_POINTS.map((pts, i) => (
            <div key={i} className="bo-card-flat bg-fs-panel px-3 py-2 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-fs-text/50">Rank {i + 1}</p>
              <p className="font-display text-xl font-black tabular-nums">{pts}</p>
            </div>
          ))}
          <div className="bo-card-flat bg-fs-head px-3 py-2 text-center text-white">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Per Kill</p>
            <p className="font-display text-xl font-black tabular-nums">+2</p>
          </div>
        </div>
      </section>

      {status === "offline" ? (
        <p className="mt-6 text-sm font-bold text-fs-text/60">
          Sedang menampilkan mode demo. <Link className="underline" href="/guide">Lihat panduan setup Firebase</Link> untuk menghubungkan data resmi.
        </p>
      ) : null}
    </div>
  );
}

function MiniStat({ label, value, bg }: { label: string; value: string; bg: string }) {
  return (
    <div className={`${bg} px-4 py-3`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-fs-text/50">{label}</p>
      <p className="font-display text-lg font-black tabular-nums">{value}</p>
    </div>
  );
}
