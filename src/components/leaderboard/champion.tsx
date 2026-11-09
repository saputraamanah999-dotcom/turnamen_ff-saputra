"use client";
// ============================================================
// STIKAR ESPORTS — Champion tracking banner (§30 master prompt)
// Jujur: juara hanya dinyatakan bila SEMUA match format selesai
// dipublikasikan dan peringkat 1 tidak seri. Sebelum itu:
// CHAMPION NOT CONFIRMED + kandidat + sisa match.
// ============================================================

import { motion } from "framer-motion";
import { Crown, Lock, TrendingUp } from "lucide-react";
import { computeChampion } from "@/lib/scoring";
import type { StandingsRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ChampionBanner({
  standings,
  totalMatches,
  publishedMatchCount,
  className,
}: {
  standings: StandingsRow[];
  totalMatches: number;
  publishedMatchCount: number;
  className?: string;
}) {
  const champion = computeChampion(standings, totalMatches, publishedMatchCount);
  const { confirmed, candidate, gap, remainingMatches, possibleTie } = champion;

  if (!candidate) return null;

  if (confirmed) {
    return (
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={cn(
          "relative overflow-hidden border border-fs-edge bg-fs-head px-6 py-8 text-center text-white bo-shadow",
          className,
        )}
      >
        <div className="bo-stripe absolute inset-x-0 top-0 h-2" aria-hidden />
        <p className="inline-flex items-center gap-2 bo-kicker bg-[#d9b45b] !text-fs-text">
          <Crown className="h-4 w-4" /> CHAMPION CONFIRMED
        </p>
        <motion.p
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="mt-4 font-display text-4xl font-black uppercase leading-tight sm:text-5xl"
        >
          {candidate.teamName}
        </motion.p>
        <p className="mt-2 font-display text-xl font-black text-[#f4d374] tabular-nums">
          {candidate.totalPoints} POIN
        </p>
        <p className="mt-1 text-xs font-bold uppercase tracking-widest text-white/60">
          [{candidate.teamTag}] · {candidate.kills} kill · seluruh {totalMatches} match resmi telah dipublikasikan
        </p>
      </motion.div>
    );
  }

  return (
    <div className={cn("border-[3px] border-dashed border-fs-edge/40 bg-fs-panel px-6 py-6 text-center bo-card-flat", className)}>
      <p className="inline-flex items-center gap-2 bo-kicker bg-fs-bg !text-fs-text/70">
        <Lock className="h-3.5 w-3.5" /> CHAMPION NOT CONFIRMED
      </p>
      <p className="mt-3 font-display text-2xl font-black uppercase leading-tight">
        Kandidat Juara: <span className="text-zb-blue">{candidate.teamName}</span>
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm font-bold text-fs-text/70">
        <span className="inline-flex items-center gap-1.5">
          <TrendingUp className="h-4 w-4 text-zb-purple" /> Selisih #{2}: {gap} poin
        </span>
        <span>Sisa match: <strong className="tabular-nums">{remainingMatches}</strong></span>
        <span>Kandidat: <strong className="tabular-nums">{candidate.totalPoints} poin</strong></span>
      </div>
      {possibleTie ? (
        <p className="mt-3 text-xs font-black uppercase tracking-wider text-amber-700">
          ⚠ Poin puncak masih seri — keputusan akhir menunggu review panitia.
        </p>
      ) : (
        <p className="mt-3 text-xs font-semibold text-fs-text/50">
          Juara akan dikonfirmasi otomatis setelah semua {totalMatches} match resmi selesai &amp; dipublikasikan.
        </p>
      )}
    </div>
  );
}
