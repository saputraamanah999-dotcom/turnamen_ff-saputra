"use client";
// /admin/leaderboard — monitor klasemen lengkap + hitung ulang resmi.
// "Hitung Ulang" membaca ulang SEMUA hasil publish dan menulis ulang
// publicLeaderboards — tidak pernah mengubah hasil match.
import { useState } from "react";
import { RefreshCcw, ShieldQuestion } from "lucide-react";
import { BoBadge, BoButton, BoCard, BoCardLg } from "@/components/common/bo";
import { DataStatusBanner, EmptyState } from "@/components/common/stat";
import { MovementIcon, RankBadge, formatUpdatedAt } from "@/components/leaderboard/leaderboard";
import { useAdminSession } from "@/services/auth/admin";
import { useActiveTournament, useStandings } from "@/services/firestore/hooks";
import { recomputeStandings } from "@/services/scoring/publish";

export default function AdminLeaderboardPage() {
  const session = useAdminSession();
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const standings = useStandings(tid);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const rows = standings.data?.standings ?? [];
  const updated = formatUpdatedAt(standings.data?.updatedAt);

  async function recompute() {
    if (!tid) return;
    setBusy(true);
    setMsg(null);
    try {
      await recomputeStandings(tid, {
        uid: session.user?.uid ?? "",
        email: session.user?.email ?? "",
      });
      setMsg("✅ Klasemen dihitung ulang dari semua hasil resmi & dipublikasikan (realtime ke semua perangkat).");
    } catch (e) {
      setMsg("❌ " + (e instanceof Error ? e.message : "Gagal menghitung ulang."));
    } finally {
      setBusy(false);
    }
  }

  if (!tid || !standings.data) {
    return (
      <div>
        <h1 className="font-display text-2xl font-black uppercase">Klasemen</h1>
        <DataStatusBanner status={standings.status} />
        <EmptyState title="Klasemen belum ada" description="Publish hasil match pertama melalui Match → Entri Hasil." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black uppercase">Klasemen Resmi</h1>
          <p className="mt-1 text-sm font-semibold text-fs-text/60">
            {standings.data.publishedMatchCount} match dipublikasikan · {standings.data.scoringVersion}
            {updated ? ` · update ${updated}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BoBadge className={standings.status === "online" ? "bg-emerald-300" : "bg-zb-yellow"}>
            {standings.status === "online" ? "REALTIME" : "OFFLINE/DEMO"}
          </BoBadge>
          <BoButton variant="black" onClick={() => void recompute()} disabled={busy}>
            <RefreshCcw className="h-4 w-4" /> {busy ? "Menghitung…" : "Hitung Ulang & Publikasikan"}
          </BoButton>
        </div>
      </div>

      {msg ? <BoCard className="bg-zb-yellow p-3 text-sm font-bold">{msg}</BoCard> : null}

      <BoCardLg className="overflow-hidden bg-fs-panel">
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="bg-fs-head text-white">
                {["Rank", "Δ", "Tim", "Main", "Kill", "Placement Pts", "Kill Pts", "Total", "Rank Sebelum", "Status"].map((h, i) => (
                  <th key={h} className={`border-r border-white/15 px-3 py-2 font-display text-xs font-black uppercase tracking-wider ${i === 2 ? "text-left" : "text-center"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.teamId} className="border-b-2 border-fs-edge/10 bg-fs-panel">
                  <td className="px-3 py-2 text-center"><RankBadge rank={r.rank} /></td>
                  <td className="px-3 py-2 text-center">
                    <span className="inline-flex h-5 w-5 items-center justify-center border border-fs-edge/20 bg-fs-panel">
                      <MovementIcon movement={r.movement} />
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-display text-sm font-bold">
                      {r.teamName}
                      {r.needsManualReview ? (
                        <ShieldQuestion className="ml-1 inline h-3.5 w-3.5 text-amber-600" aria-label="Perlu review manual" />
                      ) : null}
                    </p>
                    <p className="text-[10px] font-bold uppercase text-fs-text/50">[{r.teamTag}]</p>
                  </td>
                  <td className="px-3 py-2 text-center font-bold tabular-nums">{r.matchesPlayed}</td>
                  <td className="px-3 py-2 text-center font-bold tabular-nums">{r.kills}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-fs-text/70">{r.placementPoints}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-fs-text/70">{r.killPoints}</td>
                  <td className="px-3 py-2 text-center font-display text-base font-black tabular-nums">{r.totalPoints}</td>
                  <td className="px-3 py-2 text-center font-bold tabular-nums text-fs-text/60">
                    {r.previousRank ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.needsManualReview ? (
                      <BoBadge className="bg-amber-300 text-fs-text">REVIEW MANUAL</BoBadge>
                    ) : (
                      <BoBadge className="bg-emerald-300">OFFICIAL</BoBadge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </BoCardLg>

      <p className="text-xs font-semibold text-fs-text/50">
        Status PROVISIONAL hanya berlaku saat match berjalan sebelum publish — setelah publish, baris di atas
        adalah klasemen resmi. Baris REVIEW MANUAL = tie yang tidak selesai oleh 3 tiebreaker resmi.
      </p>
    </div>
  );
}
