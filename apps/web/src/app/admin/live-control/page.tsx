"use client";
// /admin/live-control — kontrol match berjalan
import { useActiveTournament, useMatches, useTeams, setCurrentMatch } from "@/services/firestore/hooks";
import { BoBadge, BoButton, BoCard } from "@/components/common/bo";
import { MatchStatusBadge } from "@/components/tournament/match";
import { useAdminSession } from "@/services/auth/admin";
import { useToast } from "@/hooks/use-toast";

export default function AdminLiveControlPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const matches = useMatches(tid, false);
  const teams = useTeams(tid, false);
  const session = useAdminSession();
  const { toast } = useToast();

  const sorted = [...(matches.data ?? [])].sort((a, b) => a.matchNumber - b.matchNumber);

  return (
    <div>
      <h1 className="font-display text-2xl font-black uppercase">Live Control</h1>
      <p className="mt-1 text-sm font-semibold text-zb-black/60">
        Atur match yang sedang berjalan — leaderboard publik mengikuti match ini.
      </p>

      <BoCard className="mt-4 bg-white p-5">
        <h2 className="font-display text-base font-black uppercase">Match Berjalan</h2>
        {matches.data?.find((m) => m.isCurrent) ? (
          <p className="mt-2 text-sm font-bold">
            Match {matches.data.find((m) => m.isCurrent)!.matchNumber} —{" "}
            {matches.data.find((m) => m.isCurrent)!.map}
            <BoBadge className="ml-2 bg-zb-yellow">LIVE</BoBadge>
          </p>
        ) : (
          <p className="mt-2 text-sm font-semibold text-zb-black/50">Tidak ada match yang dijadikan current.</p>
        )}
        <p className="mt-2 text-xs font-semibold text-zb-black/50">
          {teams.data?.length ?? 0} tim terdaftar · stream status diatur di Broadcast Control.
        </p>
      </BoCard>

      <div className="mt-4 space-y-2">
        {sorted.map((m) => (
          <BoCard key={m.id} className={`flex flex-wrap items-center gap-3 bg-white p-3 ${m.isCurrent ? "!border-zb-purple" : ""}`}>
            <span className="font-display text-lg font-black tabular-nums">M{m.matchNumber}</span>
            <span className="text-sm font-bold">{m.map}</span>
            <MatchStatusBadge status={m.status} />
            {m.isCurrent ? <BoBadge className="bg-zb-yellow">Current</BoBadge> : null}
            <div className="ml-auto flex gap-2">
              <BoButton
                variant={m.isCurrent ? "black" : "cyan"}
                className="!px-3 !py-1.5 !text-xs"
                disabled={m.status === "completed"}
                onClick={async () => {
                  if (!tid) return;
                  await setCurrentMatch(tid, m.id, { uid: session.user!.uid, email: session.user!.email ?? "" });
                  toast({ title: `Match ${m.matchNumber} berjalan` });
                }}
              >
                {m.isCurrent ? "Sedang Live" : "Mulai Live"}
              </BoButton>
              <BoButton
                variant="white"
                className="!px-3 !py-1.5 !text-xs"
                onClick={async () => {
                  if (!tid) return;
                  await setCurrentMatch(tid, null, { uid: session.user!.uid, email: session.user!.email ?? "" });
                  toast({ title: "Live dihentikan" });
                }}
              >
                Stop
              </BoButton>
            </div>
          </BoCard>
        ))}
      </div>
    </div>
  );
}
