"use client";
// ============================================================
// ZEROID ESPORTS — Podium Top 3
// ============================================================

import { motion } from "framer-motion";
import { Crown, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { RankBadge, TeamInitials } from "./leaderboard";
import type { StandingsRow } from "@/lib/types";

const PODIUM_STYLE = [
  { bg: "bg-zb-yellow", label: "JUARA 1", order: "md:order-2", h: "md:h-60" },
  { bg: "bg-zb-cyan", label: "JUARA 2", order: "md:order-1", h: "md:h-56" },
  { bg: "bg-zb-purple", label: "JUARA 3", order: "md:order-3", h: "md:h-52" },
];

export function Top3Podium({
  standings,
  className,
}: {
  standings: StandingsRow[];
  className?: string;
}) {
  const top3 = standings.slice(0, 3);
  if (!top3.length) return null;
  return (
    <div className={cn("grid gap-4 md:grid-cols-3 md:items-end", className)}>
      {top3.map((row, i) => {
        const style = PODIUM_STYLE[i];
        return (
          <motion.div
            key={row.teamId}
            layout
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, type: "spring", stiffness: 260, damping: 24 }}
            className={cn("bo-card relative overflow-hidden p-4", style.bg, style.order, style.h)}
          >
            <div className="bo-halftone absolute inset-0" aria-hidden />
            <div className="relative flex items-start justify-between">
              <span className="bo-badge border-zb-black bg-zb-black text-white">
                {i === 0 ? <Crown className="h-3 w-3" /> : <Swords className="h-3 w-3" />} {style.label}
              </span>
              <RankBadge rank={row.rank} className="border-white !bg-white" />
            </div>
            <div className="relative mt-3 flex items-center gap-3">
              <span className="border-[3px] border-zb-black bg-white bo-shadow-sm">
                <TeamInitials name={row.teamName} size="lg" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-black uppercase leading-tight">
                  {row.teamName}
                </p>
                <p className="text-xs font-bold uppercase tracking-wider text-zb-black/70">
                  {row.kills} kill · {row.placementPoints} placement
                </p>
              </div>
            </div>
            <p className="relative mt-3 font-display text-4xl font-black tabular-nums leading-none">
              {row.totalPoints}
              <span className="ml-1 text-xs font-bold uppercase tracking-wider text-zb-black/60">poin</span>
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}
