"use client";
// /admin/rehearsal — simulasi broadcast dengan data TERPISAH (§20).
// Tidak pernah menulis ke Firestore: seluruh data simulasi hidup di
// memori halaman ini dan selalu diberi label REHEARSAL.
import { useEffect, useState } from "react";
import { Clapperboard, Play } from "lucide-react";
import { BoButton, BoCard, BoCardLg } from "@/components/common/bo";
import { useActiveTournament } from "@/services/firestore/hooks";
import { SCENE_LIST } from "@/lib/constants";
import type { StandingsRow } from "@/lib/types";

// Data simulasi — HANYA ada di memori, tidak pernah tersimpan ke database.
const SIM_ROWS: StandingsRow[] = [
  { teamId: "sim-a", teamName: "SIM Tim Alpha", teamTag: "S-A", teamNumber: 1, matchesPlayed: 2, kills: 12, placementPoints: 37, killPoints: 24, totalPoints: 61, lastPlacement: 1, rank: 1, movement: "up", previousRank: 2 },
  { teamId: "sim-b", teamName: "SIM Tim Bravo", teamTag: "S-B", teamNumber: 2, matchesPlayed: 2, kills: 9, placementPoints: 32, killPoints: 18, totalPoints: 50, lastPlacement: 2, rank: 2, movement: "down", previousRank: 1 },
  { teamId: "sim-c", teamName: "SIM Tim Charlie", teamTag: "S-C", teamNumber: 3, matchesPlayed: 2, kills: 7, placementPoints: 28, killPoints: 14, totalPoints: 42, lastPlacement: 3, rank: 3, movement: "same", previousRank: 3 },
  { teamId: "sim-d", teamName: "SIM Tim Delta", teamTag: "S-D", teamNumber: 4, matchesPlayed: 2, kills: 5, placementPoints: 22, killPoints: 10, totalPoints: 32, lastPlacement: 5, rank: 4, movement: "new", previousRank: null },
];

export default function AdminRehearsalPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const [scene, setScene] = useState<string>(SCENE_LIST[0]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Simulasi countdown 10 detik — lokal, tidak menyentuh database.
  useEffect(() => {
    if (!busy) return;
    const kick = setTimeout(() => setCountdown(10), 0);
    const t = setInterval(() => {
      setCountdown((v) => {
        if (v == null || v <= 1) { clearInterval(t); setBusy(false); return 0; }
        return v - 1;
      });
    }, 1000);
    return () => { clearTimeout(kick); clearInterval(t); };
  }, [busy]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-black uppercase">Broadcast Rehearsal Mode</h1>
        <p className="mt-1 text-sm font-semibold text-fs-text/60">
          Simulasi scene, countdown, overlay, dan leaderboard dengan data terpisah. Tidak pernah
          menimpa hasil pertandingan resmi — tidak ada tulisan ke Firestore dari halaman ini.
        </p>
      </div>

      <div className="border-[3px] border-dashed border-red-500 bg-red-50 px-4 py-3 text-center font-display text-lg font-black uppercase tracking-widest text-red-600">
        REHEARSAL MODE — NOT OFFICIAL DATA
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BoCard className="bg-fs-panel p-5">
          <p className="flex items-center gap-2 font-display text-sm font-black uppercase">
            <Clapperboard className="h-4 w-4 text-zb-purple" /> Simulasi Scene OBS
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SCENE_LIST.map((s) => (
              <button
                key={s}
                onClick={() => setScene(s)}
                className={`bo-badge ${scene === s ? "bg-fs-head text-white" : "bg-fs-panel"}`}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs font-semibold text-fs-text/50">
            Scene aktif (simulasi): <strong>{scene}</strong>. Saat OBS bridge terhubung (Broadcast Control),
            scene asli diganti dari sana — rehearsal tidak mengirim perintah ke OBS.
          </p>
        </BoCard>

        <BoCard className="bg-fs-panel p-5">
          <p className="font-display text-sm font-black uppercase">Simulasi Countdown</p>
          <p className="mt-2 font-display text-6xl font-black tabular-nums text-zb-blue">
            {countdown != null ? String(countdown).padStart(2, "0") : "—"}
          </p>
          <BoButton variant="primary" onClick={() => setBusy(true)} disabled={busy} className="mt-3">
            <Play className="h-4 w-4" /> Jalankan Countdown 10s
          </BoButton>
        </BoCard>
      </div>

      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-widest text-fs-text/60">
          Preview overlay (iframe — pakai data simulasi bila database kosong):
        </p>
        <BoCardLg className="overflow-hidden bg-fs-head p-4">
          <div className="bo-grid-bg flex min-h-64 items-center justify-center rounded-sm bg-fs-head">
            {tid ? (
              <iframe
                title="Preview overlay rehearsal"
                src={`/overlay/${tid}/top3?scale=0.8`}
                className="h-64 w-full max-w-2xl border-0"
              />
            ) : (
              <p className="text-sm font-bold text-white/60">Turnamen belum ada — preview overlay butuh turnamen aktif.</p>
            )}
          </div>
        </BoCardLg>
      </div>

      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-widest text-fs-text/60">
          Simulasi leaderboard (data memori):
        </p>
        <BoCardLg className="overflow-hidden bg-fs-panel">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="bg-fs-head text-white">
                  {["Rank", "Tim", "Kill", "Poin", "Δ"].map((h) => (
                    <th key={h} className="px-3 py-2 text-center font-display text-xs font-black uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SIM_ROWS.map((r) => (
                  <tr key={r.teamId} className="border-b-2 border-fs-edge/10">
                    <td className="px-3 py-2 text-center font-black tabular-nums">{r.rank}</td>
                    <td className="px-3 py-2 font-bold">{r.teamName}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.kills}</td>
                    <td className="px-3 py-2 text-center font-black tabular-nums">{r.totalPoints}</td>
                    <td className="px-3 py-2 text-center">
                      {r.movement === "up" ? "↑" : r.movement === "down" ? "↓" : r.movement === "new" ? "BARU" : "="}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </BoCardLg>
      </div>
    </div>
  );
}
