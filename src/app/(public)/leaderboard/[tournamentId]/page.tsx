"use client";
// /leaderboard/:tournamentId — sama dengan indeks tetapi terikat turnamen
import { useParams, useRouter } from "next/navigation";
import { BoCard } from "@/components/common/bo";
import { DataStatusBanner, EmptyState } from "@/components/common/stat";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard";
import { ChampionCertificates } from "@/components/leaderboard/certificate";
import { useStandings, useTournament } from "@/services/firestore/hooks";
import { OFFICIAL_PLACEMENT_POINTS } from "@/lib/constants";
import { computeChampion } from "@/lib/scoring";

export default function LeaderboardDetailPage() {
  const params = useParams<{ tournamentId: string }>();
  const router = useRouter();
  const tid = params?.tournamentId ?? null;
  const tournament = useTournament(tid);
  const standings = useStandings(tid);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <DataStatusBanner status={standings.status} />
      <span className="bo-kicker mb-2 inline-block bg-zb-purple">Klasemen Resmi</span>
      <h1 className="bo-title mb-6">{tournament.data?.name ?? "Leaderboard"}</h1>

      {standings.data ? (
        <BoCard className="overflow-hidden bg-fs-panel">
          <LeaderboardTable
            standings={standings.data.standings}
            status={standings.status}
            updatedAt={standings.data.updatedAt}
            onTeamClick={(row) => router.push(`/teams/${row.teamId}?tid=${tid ?? ""}`)}
          />
        </BoCard>
      ) : (
        <EmptyState title="Klasemen belum tersedia" description="Menunggu publikasi hasil pertama oleh panitia." />
      )}

      <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {OFFICIAL_PLACEMENT_POINTS.map((pts, i) => (
          <div key={i} className="bo-card-flat bg-fs-panel px-3 py-2 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-fs-text/50">Rank {i + 1}</p>
            <p className="font-display text-xl font-black tabular-nums">{pts}</p>
          </div>
        ))}
      </div>

      {/* SERTIFIKAT JUARA — muncul otomatis saat SEMUA match selesai (bawah-tengah). */}
      {standings.data ? (
        <div className="mt-10 flex justify-center">
          <div className="w-full max-w-5xl">
            <ChampionCertificates
              standings={standings.data.standings}
              tournamentName={tournament.data?.name ?? "BATTLE OFF FRIENDS"}
              ready={
                tournament.data?.status === "completed" ||
                computeChampion(
                  standings.data.standings,
                  tournament.data?.totalMatches ?? 0,
                  standings.data.publishedMatchCount ?? 0,
                ).confirmed
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
