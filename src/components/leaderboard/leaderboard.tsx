"use client";
// ============================================================
// ZEROID ESPORTS — Tabel leaderboard realtime
// Kolom: RANK · TIM · KILLS · POIN — highlight Top 3,
// indikator pergerakan, klik baris → detail tim.
// ============================================================

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Minus, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StandingsRow } from "@/lib/types";

export function MovementIcon({ movement }: { movement: StandingsRow["movement"] }) {
  if (movement === "up") return <ChevronUp className="h-4 w-4 text-emerald-600" strokeWidth={3} />;
  if (movement === "down") return <ChevronDown className="h-4 w-4 text-red-500" strokeWidth={3} />;
  return <Minus className="h-3.5 w-3.5 text-zb-black/40" strokeWidth={3} />;
}

const RANK_STYLES: Record<number, string> = {
  1: "bg-zb-yellow text-zb-black",
  2: "bg-zb-cyan text-zb-black",
  3: "bg-zb-purple text-white",
};

export function RankBadge({ rank, className }: { rank: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center border-[3px] border-zb-black font-display text-sm font-black tabular-nums bo-shadow-sm",
        RANK_STYLES[rank] ?? "bg-white text-zb-black",
        className,
      )}
    >
      {rank}
    </span>
  );
}

export function TeamInitials({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const sizeCls = size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-14 w-14 text-xl" : "h-10 w-10 text-sm";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center border-[3px] border-zb-black font-display font-black bo-shadow-sm",
        sizeCls,
      )}
      style={{ backgroundColor: "#66F0E6" }}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}

export function LeaderboardTable({
  standings,
  onTeamClick,
  compact = false,
  maxRows,
  selectedTeamId,
}: {
  standings: StandingsRow[];
  onTeamClick?: (row: StandingsRow) => void;
  compact?: boolean;
  maxRows?: number;
  selectedTeamId?: string | null;
}) {
  const rows = maxRows ? standings.slice(0, maxRows) : standings;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr className="bg-zb-black text-white">
            <th className="border-r border-white/20 px-2 py-2 text-center font-display text-xs font-black uppercase tracking-wider w-14">
              Rank
            </th>
            <th className="border-r border-white/20 px-3 py-2 text-left font-display text-xs font-black uppercase tracking-wider">
              Tim
            </th>
            <th className="border-r border-white/20 px-2 py-2 text-center font-display text-xs font-black uppercase tracking-wider w-16">
              Kill
            </th>
            <th className="px-2 py-2 text-center font-display text-xs font-black uppercase tracking-wider w-16">
              Poin
            </th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {rows.map((row) => (
              <motion.tr
                key={row.teamId}
                layout
                initial={{ opacity: 0.6 }}
                animate={{ opacity: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 30 }}
                onClick={() => onTeamClick?.(row)}
                className={cn(
                  "border-b-[3px] border-zb-black/15 bg-white transition-colors",
                  onTeamClick ? "cursor-pointer" : "",
                  selectedTeamId === row.teamId ? "bg-zb-cyan/40" : "hover:bg-zb-yellow/25",
                  row.rank === 1 ? "bg-zb-yellow/20" : "",
                )}
              >
                <td className="px-2 py-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <RankBadge rank={row.rank} />
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <MovementIcon movement={row.movement} />
                    <div className={cn(compact ? "" : "min-w-0")}>
                      <p className="truncate font-display text-sm font-bold leading-tight">
                        {row.teamName}
                        {row.needsManualReview ? (
                          <ShieldQuestion className="ml-1 inline h-3.5 w-3.5 text-amber-600" aria-label="Perlu review manual" />
                        ) : null}
                      </p>
                      {row.teamTag ? (
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zb-black/50">
                          [{row.teamTag}] · Main {row.matchesPlayed}x
                        </p>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2 text-center font-bold tabular-nums">{row.kills}</td>
                <td className="px-2 py-2 text-center">
                  <span className="font-display text-base font-black tabular-nums">{row.totalPoints}</span>
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}
