"use client";
// ============================================================
// STIKAR ESPORTS — Tabel leaderboard realtime broadcast-grade
// Kolom: RANK · TIM · KILL · POIN — highlight Top 3, glow juara,
// kilatan emas saat poin berubah, skeleton saat menghubungkan,
// indikator pergerakan, klik baris → detail tim.
// ============================================================

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown, ChevronUp, Crown, Medal, Minus, RefreshCw, ShieldQuestion,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { StandingsRow } from "@/lib/types";

export function MovementIcon({ movement }: { movement: StandingsRow["movement"] }) {
  if (movement === "up") return <ChevronUp className="h-4 w-4 text-emerald-600" strokeWidth={3} />;
  if (movement === "down") return <ChevronDown className="h-4 w-4 text-red-500" strokeWidth={3} />;
  return <Minus className="h-3.5 w-3.5 text-fs-text/40" strokeWidth={3} />;
}

const RANK_STYLES: Record<number, string> = {
  1: "bg-zb-yellow text-fs-ink rank-champion",
  2: "bg-zb-cyan text-fs-ink",
  3: "bg-zb-purple text-white",
};

export function RankBadge({ rank, className }: { rank: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center border border-fs-edge font-display text-sm font-black tabular-nums bo-shadow-sm",
        RANK_STYLES[rank] ?? "bg-fs-panel text-fs-text",
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
        "inline-flex shrink-0 items-center justify-center border border-fs-edge font-display font-black bo-shadow-sm",
        sizeCls,
      )}
      style={{ backgroundColor: "#66F0E6" }}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}

/**
 * Angka dengan kilatan emas saat nilainya berubah (realtime).
 * Dipakai pada sel POIN/KILL agar perubahan terlihat jelas saat siaran.
 */
function FlashNumber({ value, className }: { value: number; className?: string }) {
  const prev = useRef(value);
  const [flashAt, setFlashAt] = useState(0);
  // Pola resmi React "adjusting state during render" — tanpa setState di effect.
  if (prev.current !== value) {
    prev.current = value;
    setFlashAt(Date.now());
  }
  const flash = flashAt > 0 && Date.now() - flashAt < 900;
  useEffect(() => {
    if (!flashAt) return;
    const t = setTimeout(() => setFlashAt(0), 900);
    return () => clearTimeout(t);
  }, [flashAt]);

  return (
    <motion.span
      key={value}
      initial={flash ? { scale: 1.35 } : false}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 22 }}
      className={cn("inline-block tabular-nums", flash && "flash-up px-1", className)}
    >
      {value.toLocaleString("id-ID")}
    </motion.span>
  );
}

/** Baris skeleton saat status "connecting". */
function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-fs-edge/10 bg-fs-panel">
          <td className="px-2 py-2.5 text-center">
            <div className="bo-skel mx-auto h-8 w-8 border border-fs-edge/10" />
          </td>
          <td className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="bo-skel h-4 w-10 border border-fs-edge/10" />
              <div className="bo-skel h-4 w-28 border border-fs-edge/10" />
            </div>
          </td>
          <td className="px-2 py-2.5 text-center">
            <div className="bo-skel mx-auto h-4 w-8 border border-fs-edge/10" />
          </td>
          <td className="px-2 py-2.5 text-center">
            <div className="bo-skel mx-auto h-5 w-10 border border-fs-edge/10" />
          </td>
        </tr>
      ))}
    </>
  );
}

/** Format "terakhir diperbarui" dari Firestore Timestamp / Date / string. */
export function formatUpdatedAt(value: unknown): string | null {
  let d: Date | null = null;
  if (value && typeof value === "object" && "seconds" in (value as Record<string, unknown>)) {
    const s = (value as { seconds: number }).seconds;
    d = new Date(s * 1000);
  } else if (value instanceof Date) d = value;
  else if (typeof value === "string" || typeof value === "number") d = new Date(value);
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function LeaderboardTable({
  standings,
  onTeamClick,
  compact = false,
  maxRows,
  selectedTeamId,
  status,
  updatedAt,
}: {
  standings: StandingsRow[];
  onTeamClick?: (row: StandingsRow) => void;
  compact?: boolean;
  maxRows?: number;
  selectedTeamId?: string | null;
  status?: "connecting" | "online" | "offline";
  updatedAt?: unknown;
}) {
  const connecting = status === "connecting" && standings.length === 0;
  const rows = maxRows ? standings.slice(0, maxRows) : standings;
  const updated = formatUpdatedAt(updatedAt);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr className="bg-fs-head text-white">
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
          {connecting ? (
            <SkeletonRows rows={compact ? 6 : 8} />
          ) : (
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
                    "border-b border-fs-edge/15 bg-fs-panel transition-colors",
                    onTeamClick ? "cursor-pointer" : "",
                    selectedTeamId === row.teamId ? "bg-zb-cyan/40" : "hover:bg-zb-yellow/25",
                  )}
                >
                  <td className="px-2 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <RankBadge rank={row.rank} />
                      {row.rank === 1 ? (
                        <Crown className="h-4 w-4 text-amber-500" strokeWidth={2.5} aria-label="Juara sementara" />
                      ) : row.rank <= 3 ? (
                        <Medal className="h-3.5 w-3.5 text-zb-purple" strokeWidth={2.5} aria-label="Top 3" />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center border border-fs-edge/20 bg-fs-panel",
                          row.movement === "up" && "border-emerald-600 bg-emerald-100",
                          row.movement === "down" && "border-red-500 bg-red-100",
                        )}
                        title={
                          row.movement === "up"
                            ? `Naik dari peringkat ${row.previousRank ?? "?"}`
                            : row.movement === "down"
                              ? `Turun dari peringkat ${row.previousRank ?? "?"}`
                              : row.movement === "new"
                                ? "Tim baru masuk klasemen"
                                : "Peringkat tetap"
                        }
                      >
                        <MovementIcon movement={row.movement} />
                      </span>
                      <div className={cn(compact ? "" : "min-w-0")}>
                        <p className="truncate font-display text-sm font-bold leading-tight">
                          {row.teamName}
                          {row.needsManualReview ? (
                            <ShieldQuestion className="ml-1 inline h-3.5 w-3.5 text-amber-600" aria-label="Perlu review manual" />
                          ) : null}
                          {row.disciplineStatus === "DISQUALIFIED" ? (
                            <span className="ml-1.5 inline-block border border-red-500/70 bg-red-500/15 px-1 py-px align-middle font-display text-[9px] font-black uppercase tracking-[0.12em] text-red-400" title="Tim didiskualifikasi — seluruh poin dihapus (juknis §G)">
                              DISQUALIFIED
                            </span>
                          ) : row.disciplineStatus === "SUSPENDED" ? (
                            <span className="ml-1.5 inline-block border border-amber-500/70 bg-amber-500/15 px-1 py-px align-middle font-display text-[9px] font-black uppercase tracking-[0.12em] text-amber-400">
                              SUSPENDED
                            </span>
                          ) : null}
                        </p>
                        {row.teamTag ? (
                          <p className="text-[10px] font-bold uppercase tracking-wider text-fs-text/50">
                            [{row.teamTag}] · Main {row.matchesPlayed}x
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center font-bold">
                    <FlashNumber value={row.kills} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <FlashNumber
                      value={row.totalPoints}
                      className="font-display text-base font-black"
                    />
                    {row.violationPenalty ? (
                      <span
                        className="ml-1 align-middle text-[10px] font-black text-red-400"
                        title={`Raw ${row.rawPoints ?? "?"} poin − penalti ${row.violationPenalty} poin (sanksi tercatat)`}
                      >
                        −{row.violationPenalty}
                      </span>
                    ) : null}
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          )}
        </tbody>
      </table>

      {/* Ticker status broadcast — hanya bila waktu update tersedia */}
      {updated ? (
        <div className="flex items-center gap-2 border-t border-fs-edge bg-fs-head px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white/80">
          <RefreshCw className="h-3.5 w-3.5 text-zb-cyan" />
          Realtime · terakhir diperbarui {updated}
        </div>
      ) : null}
    </div>
  );
}
