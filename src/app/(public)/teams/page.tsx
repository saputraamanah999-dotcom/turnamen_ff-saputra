"use client";
// /teams — galeri semua tim
import Link from "next/link";
import { BoBadge } from "@/components/common/bo";
import { DataStatusBanner, EmptyState } from "@/components/common/stat";
import { TeamInitials } from "@/components/leaderboard/leaderboard";
import { useActiveTournament, useStandings, useTeams } from "@/services/firestore/hooks";

export default function TeamsPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const teams = useTeams(tid);
  const standings = useStandings(tid);

  const rankOf = (teamId: string) =>
    standings.data?.standings.find((s) => s.teamId === teamId);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <DataStatusBanner status={teams.status} />
      <span className="bo-kicker mb-2 inline-block bg-zb-cyan text-zb-black">Peserta</span>
      <h1 className="bo-title mb-6">Tim Berpartisipasi</h1>

      {teams.data?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {teams.data.map((team) => {
            const row = rankOf(team.id);
            return (
              <Link
                key={team.id}
                href={`/teams/${team.id}?tid=${tid ?? ""}`}
                className="bo-card bo-press flex items-center gap-3 bg-white p-4"
              >
                <TeamInitials name={team.name} />
                <div className="min-w-0">
                  <p className="truncate font-display text-base font-black uppercase">
                    {team.name}
                  </p>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zb-black/50">
                    #{team.number} {team.tag ? `· [${team.tag}]` : ""}
                  </p>
                  {row ? (
                    <div className="mt-1.5 flex gap-1.5">
                      <BoBadge className="bg-zb-yellow">Rank {row.rank}</BoBadge>
                      <BoBadge>{row.totalPoints} poin</BoBadge>
                    </div>
                  ) : (
                    <BoBadge className="mt-1.5 bg-zb-off">Belum bertanding</BoBadge>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Belum ada tim terdaftar"
          description="Panitia mendaftarkan tim melalui Admin → Tim."
        />
      )}
    </div>
  );
}
