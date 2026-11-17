"use client";
// /leaderboard — BROADCAST ESPORTS LEADERBOARD
// Tampilan panggung turnamen FF internasional: podium emas/perak/perunggu,
// rays juara, kontras tinggi, tombol MODE LAYAR TANCAP untuk projector.
// Semua data realtime dari Firestore (fallback demo diberi label jelas).
import { useRouter } from "next/navigation";
import { DataStatusBanner } from "@/components/common/stat";
import { BroadcastLeaderboard } from "@/components/leaderboard/broadcast";
import { useActiveTournament, useStandings } from "@/services/firestore/hooks";
import { OFFICIAL_KILL_POINT, SCORING_VERSION } from "@/lib/constants";

export default function LeaderboardIndexPage() {
  const router = useRouter();
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
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
      tournamentName={tournament?.name ?? "BATTLE OFF FRIENDS"}
      institution={tournament?.institution ?? "SMK TI BALI GLOBAL KARANGASEM"}
      showPoints
      banner={<DataStatusBanner status={standings.status} />}
    />
  );
}
