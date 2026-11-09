"use client";
// ============================================================
// STIKAR ESPORTS — Panel detail tim (dibuka saat klik baris)
// ============================================================

import { AnimatePresence, motion } from "framer-motion";
import { X, Trophy, Swords, MapPin } from "lucide-react";
import { BoBadge } from "@/components/common/bo";
import { RankBadge, TeamInitials } from "./leaderboard";
import type { Match, MatchResult, StandingsRow, Team } from "@/lib/types";
import { formatDateTime } from "@/lib/constants";

export function TeamDetailPanel({
  row,
  team,
  matchHistory,
  onClose,
}: {
  row: StandingsRow;
  team?: Team | null;
  /** Riwayat hasil per match yang sudah dipublikasikan (terbaru dulu). */
  matchHistory: { match: Match; result?: MatchResult }[];
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.aside
        key="team-panel"
        initial={{ opacity: 0, x: 32 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 32 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="bo-card-lg sticky top-20 bg-fs-panel p-5"
        aria-label={`Detail tim ${row.teamName}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="border border-fs-edge bg-fs-panel bo-shadow-sm">
              <TeamInitials name={row.teamName} size="lg" />
            </span>
            <div>
              <p className="font-display text-xl font-black uppercase leading-none">{row.teamName}</p>
              {row.teamTag ? (
                <p className="mt-1 text-xs font-bold uppercase tracking-wider text-fs-text/60">
                  [{row.teamTag}] · Tim #{row.teamNumber}
                </p>
              ) : null}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center border border-fs-edge bg-fs-panel bo-shadow-sm hover:bg-zb-yellow"
            aria-label="Tutup panel detail tim"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="bo-card-flat bg-fs-head p-3 text-white">
            <p className="font-display text-3xl font-black tabular-nums">{row.rank}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Peringkat</p>
          </div>
          <div className="bo-card-flat bg-zb-yellow p-3">
            <p className="font-display text-3xl font-black tabular-nums">{row.totalPoints}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-fs-text/70">Total Poin</p>
          </div>
          <div className="bo-card-flat bg-zb-cyan p-3">
            <p className="font-display text-2xl font-black tabular-nums">{row.kills}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-fs-text/70">Total Kill</p>
          </div>
          <div className="bo-card-flat bg-fs-panel p-3">
            <p className="font-display text-2xl font-black tabular-nums">{row.placementPoints}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-fs-text/70">Poin Placement</p>
          </div>
        </div>

        <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-fs-text/50">
          Kill points = {row.kills} × 2 = {row.killPoints}
        </p>

        {team?.description ? (
          <p className="mt-2 border-l-4 border-zb-purple pl-3 text-sm italic text-fs-text/70">
            {team.description}
          </p>
        ) : null}

        {team?.roster?.length ? (
          <div className="mt-3">
            <p className="bo-kicker mb-2 inline-block bg-zb-blue">Roster</p>
            <div className="flex flex-wrap gap-1.5">
              {team.roster.map((m) => (
                <BoBadge key={m.nickname}>{m.nickname}</BoBadge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5">
          <p className="mb-2 font-display text-sm font-black uppercase tracking-wider">
            Riwayat Match
          </p>
          {matchHistory.length === 0 ? (
            <p className="text-sm text-fs-text/50">Belum ada match yang dipublikasikan.</p>
          ) : (
            <ul className="thin-scroll max-h-56 space-y-2 overflow-y-auto pr-1">
              {matchHistory.map(({ match, result }) => (
                <li key={match.id} className="bo-card-flat flex items-center justify-between gap-2 bg-fs-bg px-3 py-2">
                  <span className="text-xs font-bold">
                    MATCH {match.matchNumber}
                    <span className="ml-1 inline-flex items-center gap-1 text-fs-text/50">
                      <MapPin className="h-3 w-3" /> {match.map}
                    </span>
                  </span>
                  {result ? (
                    <span className="flex items-center gap-2 text-xs font-black tabular-nums">
                      <span className="inline-flex items-center gap-1 text-fs-text/70">
                        <Trophy className="h-3.5 w-3.5" /> #{result.placement}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Swords className="h-3.5 w-3.5" /> {result.kills}
                      </span>
                      <span className="bg-fs-head px-2 py-0.5 text-white">{result.totalPoints}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-fs-text/40">—</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10px] text-fs-text/40">
            Terakhir diperbarui {formatDateTime(Date.now())} · mengikuti data publikasi resmi
          </p>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
