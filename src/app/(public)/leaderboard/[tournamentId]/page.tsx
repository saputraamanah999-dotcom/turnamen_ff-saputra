"use client";
// /leaderboard/:tournamentId — tampilan broadcast yang sama,
// terikat pada turnamen tertentu di URL + sertifikat juara otomatis.
import { useParams, useRouter } from "next/navigation";
import { DataStatusBanner } from "@/components/common/stat";
import { BroadcastLeaderboard } from "@/components/leaderboard/broadcast";
import { ChampionCertificates } from "@/components/leaderboard/certificate";
import { useStandings, useTournament } from "@/services/firestore/hooks";
import { OFFICIAL_KILL_POINT, SCORING_VERSION } from "@/lib/constants";
import { computeChampion } from "@/lib/scoring";

export default function LeaderboardDetailPage() {
  const params = useParams<{ tournamentId: string }>();
  const router = useRouter();
  const tid = params?.tournamentId ?? null;
  const tournament = useTournament(tid);
  const standings = useStandings(tid);
  const sd = standings.data;

  return (
    <BroadcastLeaderboard
      standings={sd?.standings ?? []}
      status={standings.status}
      updatedAt={sd?.updatedAt}
      onTeamClick={(row) => router.push(`/teams/${row.teamId}?tid=${tid ?? ""}`)}
      publishedMatchCount={sd?.publishedMatchCount ?? 0}
      totalKills={sd?.totalKills ?? 0}
      killPoint={OFFICIAL_KILL_POINT}
      scoringVersion={sd?.scoringVersion ?? SCORING_VERSION}
      tournamentName={tournament.data?.name ?? "BATTLE OFF FRIENDS"}
      institution={tournament.data?.institution ?? "SMK TI BALI GLOBAL KARANGASEM"}
      banner={<DataStatusBanner status={standings.status} />}
      extraBottom={
        sd ? (
          <ChampionCertificates
            standings={sd.standings}
            tournamentName={tournament.data?.name ?? "BATTLE OFF FRIENDS"}
            ready={
              tournament.data?.status === "completed" ||
              computeChampion(
                sd.standings,
                tournament.data?.totalMatches ?? 0,
                sd.publishedMatchCount ?? 0,
              ).confirmed
            }
          />
        ) : null
      }
    />
  );
}
