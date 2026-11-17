"use client";
// /leaderboard/:tournamentId — tampilan broadcast yang sama,
// terikat pada turnamen tertentu di URL.
import { useParams, useRouter } from "next/navigation";
import { DataStatusBanner } from "@/components/common/stat";
import { BroadcastLeaderboard } from "@/components/leaderboard/broadcast";
import { useStandings, useTournament } from "@/services/firestore/hooks";
import { OFFICIAL_KILL_POINT, SCORING_VERSION } from "@/lib/constants";

export default function LeaderboardDetailPage() {
  const params = useParams<{ tournamentId: string }>();
  const router = useRouter();
  const tid = params?.tournamentId ?? null;
  const tournament = useTournament(tid);
  const standings = useStandings(tid);

  return (
    <BroadcastLeaderboard
      standings={standings.data?.standings ?? []}
      status={standings.status}
      updatedAt={standings.data?.updatedAt}
      onTeamClick={(row) => router.push(`/teams/${row.teamId}?tid=${tid ?? ""}`)}
      publishedMatchCount={standings.data?.publishedMatchCount ?? 0}
      totalKills={standings.data?.totalKills ?? 0}
      killPoint={OFFICIAL_KILL_POINT}
      scoringVersion={standings.data?.scoringVersion ?? SCORING_VERSION}
      tournamentName={tournament.data?.name ?? "BATTLE OFF FRIENDS"}
      institution={tournament.data?.institution ?? "SMK TI BALI GLOBAL KARANGASEM"}
      banner={<DataStatusBanner status={standings.status} />}
    />
  );
}
