"use client";
// /matches — daftar semua match (riwayat + jadwal)
import { BoCard } from "@/components/common/bo";
import { DataStatusBanner, EmptyState } from "@/components/common/stat";
import { MatchCard } from "@/components/tournament/match";
import { useActiveTournament, useMatches } from "@/services/firestore/hooks";

export default function MatchesPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const matches = useMatches(tid);
  const sorted = [...(matches.data ?? [])].sort((a, b) => a.matchNumber - b.matchNumber);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <DataStatusBanner status={matches.status} />
      <span className="bo-kicker mb-2 inline-block bg-zb-blue">Pertandingan</span>
      <h1 className="bo-title mb-6">Jadwal &amp; Riwayat Match</h1>
      <p className="mb-6 text-sm font-semibold text-zb-black/60">
        Format {tournament?.format ?? "-"} · {tournament?.totalMatches ?? 0} match · hasil lama tetap tersimpan.
      </p>

      {sorted.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {sorted.map((m) => (
            <MatchCard key={m.id} match={m} href={`/matches/${m.id}?tid=${tid ?? ""}`} />
          ))}
        </div>
      ) : (
        <EmptyState title="Belum ada match" description="Panitia membuat match melalui Admin → Match." />
      )}
    </div>
  );
}
