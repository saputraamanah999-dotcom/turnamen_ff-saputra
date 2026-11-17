"use client";
// /leaderboard — BROADCAST ESPORTS LEADERBOARD
// Tampilan panggung turnamen FF internasional: podium emas/perak/perunggu,
// rays juara, kontras tinggi, tombol MODE LAYAR TANCAP untuk projector.
// Data realtime Firestore + banner juara & sertifikat otomatis saat turnamen selesai.
import { useRouter } from "next/navigation";
import { DataStatusBanner } from "@/components/common/stat";
import { BroadcastLeaderboard } from "@/components/leaderboard/broadcast";
import { ChampionBanner } from "@/components/leaderboard/champion";
import { ChampionCertificates } from "@/components/leaderboard/certificate";
import { useActiveTournament, useStandings } from "@/services/firestore/hooks";
import { OFFICIAL_KILL_POINT, SCORING_VERSION } from "@/lib/constants";
import { computeChampion } from "@/lib/scoring";

export default function LeaderboardIndexPage() {
  const router = useRouter();
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const standings = useStandings(tid);
  const sd = standings.data;
  const championReady =
    tournament?.status === "completed" ||
    computeChampion(
      sd?.standings ?? [],
      tournament?.totalMatches ?? 0,
      sd?.publishedMatchCount ?? 0,
    ).confirmed;

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
      tournamentName={tournament?.name ?? "BATTLE OFF FRIENDS"}
      institution={tournament?.institution ?? "SMK TI BALI GLOBAL KARANGASEM"}
      showPoints
      banner={<DataStatusBanner status={standings.status} />}
      extraAfterPodium={
        sd && sd.standings.length ? (
          <ChampionBanner
            standings={sd.standings}
            totalMatches={tournament?.totalMatches ?? 0}
            publishedMatchCount={sd.publishedMatchCount ?? 0}
          />
        ) : null
      }
      extraBottom={
        sd ? (
          <ChampionCertificates
            standings={sd.standings}
            tournamentName={tournament?.name ?? "BATTLE OFF FRIENDS"}
            ready={championReady}
          />
        ) : null
      }
    />
  );
}
