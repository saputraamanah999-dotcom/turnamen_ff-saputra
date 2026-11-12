"use client";
// ============================================================
// STIKAR ESPORTS — PANGGUNG JUARA (Champion Podium)
// Podium Top 3 penuh animasi: emas/perak/perunggu, mahkota
// melayang, shimmer emas, confetti, gap poin & status juara
// (jujur: "JUARA RESMI" hanya bila semua match selesai
// dipublikasikan dan tidak seri — computeChampion).
// Dipakai di:
//   - overlay fullscreen TV & /live (broadcast.presentation.podium)
//   - scene "champion" TV Display
//   - halaman publik /leaderboard
// ============================================================

import { motion } from "framer-motion";
import { Crown, Trophy } from "lucide-react";
import { computeChampion } from "@/lib/scoring";
import { ORG } from "@/lib/constants";
import { useStandings, useTournament } from "@/services/firestore/hooks";
import { cn } from "@/lib/utils";
import { TeamChip } from "@/components/leaderboard/broadcast-board";
import { ConfettiBurst } from "@/components/broadcast/confetti";
import type { BroadcastSettings, StandingsRow } from "@/lib/types";

const PLATE = {
  1: { name: "emas", plate: "#FFC247", ink: "#0B0E14", glow: "rgba(255,194,71,.5)", grad: "linear-gradient(180deg,#FFD766 0%,#FFC247 55%,#C8901F 100%)" },
  2: { name: "perak", plate: "#C0C8D4", ink: "#0B0E14", glow: "rgba(192,200,212,.4)", grad: "linear-gradient(180deg,#E2E8F0 0%,#C0C8D4 55%,#8B94A3 100%)" },
  3: { name: "perunggu", plate: "#C98A4B", ink: "#0B0E14", glow: "rgba(201,138,75,.4)", grad: "linear-gradient(180deg,#E2A96B 0%,#C98A4B 55%,#8F5D2C 100%)" },
} as const;

/** Podium Top 3 — varian inline (dalam halaman / scene TV). */
export function ChampionPodium({
  standings,
  totalMatches = 0,
  publishedMatchCount = 0,
  compact = false,
  className,
}: {
  standings: StandingsRow[];
  totalMatches?: number;
  publishedMatchCount?: number;
  compact?: boolean;
  className?: string;
}) {
  const top3 = standings.slice(0, 3);
  if (!top3.length) return null;
  const champion = computeChampion(standings, totalMatches, publishedMatchCount);
  // Urutan tampil: 2 - 1 - 3
  const order = [1, 0, 2].filter((i) => i < top3.length);
  const heights = compact ? ["h-16", "h-24", "h-14"] : ["h-20", "h-32", "h-16"];

  return (
    <div className={cn("w-full", className)}>
      <div className="grid grid-cols-3 items-end gap-2 sm:gap-4">
        {order.map((idx, visualIdx) => {
          const row = top3[idx];
          const plate = PLATE[(idx + 1) as 1 | 2 | 3];
          const first = idx === 0;
          return (
            <motion.div
              key={row.teamId}
              initial={{ opacity: 0, y: 42, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.12 * visualIdx, type: "spring", stiffness: 200, damping: 20 }}
              className="flex flex-col items-center text-center"
            >
              {/* Mahkota juara 1 */}
              <div className={cn("flex h-8 items-end justify-center", first ? "" : "h-6")}>
                {first ? (
                  <Crown
                    className={cn("fs-float h-7 w-7 text-fs-gold drop-shadow-[0_0_12px_rgba(255,194,71,.8)]", compact && "h-6 w-6")}
                    strokeWidth={2.2}
                    aria-label="Juara 1"
                  />
                ) : null}
              </div>

              <p className={cn("mt-1 truncate font-display font-black uppercase leading-tight", compact ? "max-w-full text-sm" : "max-w-full text-lg sm:text-xl")}>
                {row.teamName}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
                [{row.teamTag}] · {row.kills} kill
              </p>
              <p className={cn("font-stat font-black leading-none", compact ? "mt-1 text-2xl" : "mt-2 text-4xl sm:text-5xl", first ? "text-fs-gold" : "text-white")}>
                {row.totalPoints}
                <span className="ml-1 align-middle text-[10px] font-bold uppercase tracking-widest text-white/50">pts</span>
              </p>

              {/* Pedestal */}
              <div
                className={cn(
                  "relative mt-2 flex w-full items-start justify-center border-t-4 pt-1",
                  heights[visualIdx],
                )}
                style={{
                  background: plate.grad,
                  borderColor: plate.plate,
                  boxShadow: `0 0 24px ${plate.glow}, inset 0 8px 22px rgba(255,255,255,.18)`,
                  clipPath: "polygon(8% 0, 92% 0, 100% 100%, 0 100%)",
                }}
              >
                <span
                  className="font-display font-black leading-none text-fs-ink"
                  style={{ fontSize: compact ? "1.5rem" : "2.6rem" }}
                >
                  {idx + 1}
                </span>
                {first ? (
                  <span className="fs-shimmer-gold pointer-events-none absolute inset-0" aria-hidden />
                ) : null}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Status juara — jujur sesuai kemajuan turnamen */}
      <div className="mt-4 text-center">
        {champion.confirmed ? (
          <p className="inline-flex items-center gap-2 border border-fs-gold/60 bg-fs-gold/15 px-4 py-1.5 font-display text-sm font-black uppercase tracking-[0.18em] text-fs-gold">
            <Trophy className="h-4 w-4" /> Juara Resmi Terkonfirmasi — BOOYAH!
          </p>
        ) : (
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/50">
            {champion.possibleTie
              ? "Poin puncak masih seri — menunggu keputusan panitia"
              : champion.remainingMatches > 0
                ? `Juara dikonfirmasi setelah ${champion.remainingMatches} match tersisa selesai`
                : "Klasemen sementara — menunggu publikasi resmi"}
          </p>
        )}
      </div>
    </div>
  );
}

/** Overlay fullscreen "Panggung Juara" — TV & /live, dikendalikan panitia
 *  dari /admin/broadcast (toggle presentation.podium). Parent me-mount
 *  komponen ini HANYA saat podium aktif (hemat listener Firestore). */
export function ChampionsStageOverlay({ broadcast }: { broadcast: BroadcastSettings | null }) {
  const tid = broadcast?.tournamentId ?? null;
  const standings = useStandings(tid);
  const tournament = useTournament(tid);
  const rows = standings.data?.standings ?? [];
  const effects = broadcast?.presentation?.effects !== false;
  if (!tid) return null;

  return (
    <div className="fs-aurora pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 overflow-hidden px-6 text-center">
      {effects ? <ConfettiBurst trigger="podium-open" count={150} /> : null}
      <div className="pointer-events-none absolute inset-0">
        <div className="fs-pulse-glow absolute left-1/2 top-1/3 h-[45%] w-[55%] -translate-x-1/2 rounded-full bg-fs-gold/10 blur-3xl" />
      </div>

      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="relative">
        <p className="bo-kicker !border-fs-gold/50 !bg-fs-gold/15 !text-fs-gold">Panggung Juara</p>
        <p className="mt-2 font-display text-3xl font-black uppercase leading-none tracking-[0.08em] text-white drop-shadow-[0_0_26px_rgba(255,194,71,.4)] sm:text-5xl">
          TOP <span className="text-fs-gold">3</span> {ORG.tournament}
        </p>
      </motion.div>

      <ChampionPodium
        standings={rows}
        totalMatches={tournament.data?.totalMatches ?? 0}
        publishedMatchCount={standings.data?.publishedMatchCount ?? 0}
        className="relative max-w-2xl"
      />
    </div>
  );
}
