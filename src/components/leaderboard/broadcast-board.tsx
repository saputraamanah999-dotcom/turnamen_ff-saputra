"use client";
// ============================================================
// STIKAR ESPORTS — BROADCAST LEADERBOARD (PHASE 2 §14)
// Scoreboard esports profesional dengan 7 mode:
//   compact | full | broadcast | tv | mobile | top3 | results
// - Rank 1 emas, 2 silver, 3 bronze (spec resmi)
// - Angka Rajdhani besar, badge kill, indikator pergerakan
// - Animasi: layout slide saat pindah peringkat, pop + kilat emas
//   saat poin berubah — TIDAK berkedip terus-menerus
// - Sumber data tunggal: publicLeaderboards (scoring engine resmi)
// ============================================================

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, Crown, Medal, Minus, Swords } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatUpdatedAt } from "@/components/leaderboard/leaderboard";
import type { StandingsRow } from "@/lib/types";

export type BoardMode = "compact" | "full" | "broadcast" | "tv" | "mobile" | "top3" | "results";

const MEDAL = {
  1: { plate: "#FFC247", ink: "#0B0E14", glow: "rgba(255,194,71,.45)" }, // Gold
  2: { plate: "#C0C8D4", ink: "#0B0E14", glow: "rgba(192,200,212,.35)" }, // Silver
  3: { plate: "#C98A4B", ink: "#0B0E14", glow: "rgba(201,138,75,.35)" }, // Bronze
} as const;

function rankPlate(rank: number): { plate: string; ink: string; glow: string } | null {
  return MEDAL[rank as 1 | 2 | 3] ?? null;
}

/** Angka dengan pop + kilatan emas saat nilainya berubah (realtime). */
function ScoreNumber({ value, className }: { value: number; className?: string }) {
  const prev = useRef(value);
  const [flashAt, setFlashAt] = useState(0);
  // Pola resmi React "adjusting state when props change": setState saat render
  // (bukan di dalam effect) untuk mendeteksi perubahan poin realtime.
  if (prev.current !== value) {
    prev.current = value;
    setFlashAt(Date.now());
  }
  const flashing = flashAt > 0 && Date.now() - flashAt < 900;
  useEffect(() => {
    if (!flashAt) return;
    const t = setTimeout(() => setFlashAt(0), 900);
    return () => clearTimeout(t);
  }, [flashAt]);
  return (
    <span
      key={value}
      className={cn("font-stat inline-block tabular-nums", flashing && "fs-pop px-1 rounded-sm", className)}
      style={flashing ? { backgroundColor: "rgba(255,194,71,.28)" } : undefined}
    >
      {value.toLocaleString("id-ID")}
    </span>
  );
}

function Movement({ row }: { row: StandingsRow }) {
  const title =
    row.movement === "up"
      ? `Naik dari peringkat ${row.previousRank ?? "?"}`
      : row.movement === "down"
        ? `Turun dari peringkat ${row.previousRank ?? "?"}`
        : row.movement === "new"
          ? "Tim baru masuk klasemen"
          : "Peringkat tetap";
  return (
    <span title={title} aria-label={title} className="inline-flex items-center">
      {row.movement === "up" ? (
        <ChevronUp className="h-3.5 w-3.5 text-fs-ok" strokeWidth={3.5} />
      ) : row.movement === "down" ? (
        <ChevronDown className="h-3.5 w-3.5 text-fs-err" strokeWidth={3.5} />
      ) : row.movement === "new" ? (
        <span className="rounded-sm bg-fs-cyan/20 px-1 text-[9px] font-black uppercase text-fs-cyan">NEW</span>
      ) : (
        <Minus className="h-3 w-3 text-fs-muted/60" strokeWidth={3} />
      )}
    </span>
  );
}

export function TeamChip({ name, size }: { name: string; size: "sm" | "md" | "lg" }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  const cls = size === "lg" ? "h-11 w-11 text-base" : size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  // Warna deterministik dari nama tim — 6 palet arena.
  const palette = ["#FF5A1F", "#35D6FF", "#FFC247", "#FF8A00", "#22C55E", "#F0ABFC"];
  const idx = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length;
  return (
    <span
      aria-hidden
      className={cn("font-stat inline-flex shrink-0 items-center justify-center border font-black text-fs-ink", cls)}
      style={{ backgroundColor: palette[idx], borderColor: "rgba(255,255,255,.25)" }}
    >
      {initials || "?"}
    </span>
  );
}

function KillBadge({ kills, big }: { kills: number; big?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border border-fs-fire/45 bg-fs-fire/12 font-bold uppercase text-fs-fire",
        big ? "px-2 py-0.5 text-sm" : "px-1.5 py-0.5 text-[11px]",
      )}
      style={{ clipPath: "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))" }}
    >
      <Swords className={big ? "h-3.5 w-3.5" : "h-3 w-3"} /> {kills}
    </span>
  );
}

/* ---------------- Baris utama ---------------- */
function BoardRow({
  row, mode, onTeamClick, selected,
}: {
  row: StandingsRow;
  mode: BoardMode;
  onTeamClick?: (row: StandingsRow) => void;
  selected?: boolean;
}) {
  const plate = rankPlate(row.rank);
  const big = mode === "tv" || mode === "results";
  const showBreakdown = mode === "results" || mode === "full";
  return (
    <motion.tr
      layout
      initial={{ opacity: 0.5 }}
      animate={{ opacity: 1 }}
      transition={{ type: "spring", stiffness: 340, damping: 32 }}
      onClick={() => onTeamClick?.(row)}
      className={cn(
        "group relative border-b border-fs-edge/70 transition-colors",
        onTeamClick && "cursor-pointer",
        plate ? "" : "bg-[#141B24] hover:bg-[#1A2430]",
        selected && "!bg-fs-cyan/10",
        row.movement === "up" && "shadow-[inset_3px_0_0_var(--fs-ok)]",
        row.movement === "down" && "shadow-[inset_3px_0_0_var(--fs-err)]",
      )}
      style={
        plate
          ? {
              background: `linear-gradient(90deg, ${plate.plate}26 0%, transparent 55%), #141B24`,
              boxShadow: `inset 3px 0 0 ${plate.plate}`,
            }
          : undefined
      }
    >
      {/* RANK */}
      <td className={cn("w-14 px-2 py-2 text-center", big && "py-2.5")}>
        <div className="flex items-center justify-center gap-1">
          <span
            className={cn(
              "font-stat inline-flex h-8 w-8 items-center justify-center border text-sm font-bold tabular-nums",
              big && "h-9 w-9 text-lg",
              plate ? "border-transparent" : "border-fs-edge-strong bg-[#0E131A] text-fs-text",
            )}
            style={
              plate
                ? {
                    background: plate.plate,
                    color: plate.ink,
                    boxShadow: `0 0 12px ${plate.glow}`,
                  }
                : undefined
            }
          >
            {row.rank}
          </span>
          {row.rank === 1 ? (
            <Crown className="h-4 w-4 text-fs-gold" strokeWidth={2.5} aria-label="Peringkat satu" />
          ) : row.rank <= 3 ? (
            <Medal className="h-3.5 w-3.5 text-fs-muted" strokeWidth={2.5} aria-label="Top 3" />
          ) : null}
        </div>
      </td>
      {/* TIM */}
      <td className={cn("px-3 py-2", big && "py-2.5")}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex w-5 items-center justify-center"><Movement row={row} /></span>
          <TeamChip name={row.teamName} size={big ? "lg" : "md"} />
          <div className="min-w-0">
            <p className={cn("truncate leading-tight font-bold tracking-wide", big ? "text-lg" : "text-sm")}>
              {row.teamName}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-fs-muted">
              [{row.teamTag}] · main {row.matchesPlayed}x
            </p>
          </div>
        </div>
      </td>
      {/* KILL */}
      <td className={cn("px-2 py-2 text-center", big && "py-2.5")}>
        <KillBadge kills={row.kills} big={big} />
      </td>
      {showBreakdown ? (
        <>
          <td className="hidden px-2 py-2 text-center md:table-cell">
            <ScoreNumber value={row.placementPoints} className="text-sm text-fs-muted" />
          </td>
          <td className="hidden px-2 py-2 text-center md:table-cell">
            <ScoreNumber value={row.killPoints} className="text-sm text-fs-muted" />
          </td>
        </>
      ) : null}
      {/* POIN */}
      <td className={cn("px-3 py-2 text-right", big && "py-2.5")}>
        <ScoreNumber
          value={row.totalPoints}
          className={cn(
            "font-bold",
            big ? "text-2xl" : "text-lg",
            row.rank === 1 ? "text-fs-gold" : row.rank <= 3 ? "text-fs-flame" : "text-fs-text",
          )}
        />
      </td>
    </motion.tr>
  );
}

function HeaderRow({ mode }: { mode: BoardMode }) {
  const showBreakdown = mode === "results" || mode === "full";
  const th = "px-2 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-fs-muted";
  return (
    <thead>
      <tr className="border-b border-fs-edge bg-[#0C1117]">
        <th className={cn(th, "w-14 text-center")}>Rank</th>
        <th className={cn(th, "text-left")}>Tim</th>
        <th className={cn(th, "text-center")}>Kill</th>
        {showBreakdown ? (
          <>
            <th className={cn(th, "hidden text-center md:table-cell")}>Place</th>
            <th className={cn(th, "hidden text-center md:table-cell")}>Kill Pts</th>
          </>
        ) : null}
        <th className={cn(th, "text-right text-fs-gold")}>Poin</th>
      </tr>
    </thead>
  );
}

/* ---------------- Komponen publik ---------------- */
export function BroadcastLeaderboard({
  standings,
  mode = "broadcast",
  status,
  updatedAt,
  maxRows,
  onTeamClick,
  selectedTeamId,
  className,
}: {
  standings: StandingsRow[];
  mode?: BoardMode;
  status?: "connecting" | "online" | "offline";
  updatedAt?: unknown;
  maxRows?: number;
  onTeamClick?: (row: StandingsRow) => void;
  selectedTeamId?: string | null;
  className?: string;
}) {
  const connecting = status === "connecting" && standings.length === 0;
  const rows = maxRows ? standings.slice(0, maxRows) : standings;
  const updated = formatUpdatedAt(updatedAt);
  const showBreakdown = mode === "results" || mode === "full";
  const dense = mode === "compact" || mode === "mobile" || mode === "broadcast";

  return (
    <div className={cn("overflow-hidden border border-fs-edge bg-[#0C1117]", className)}>
      {/* Bar judul */}
      <div className="fs-shine flex items-center justify-between border-b border-fs-fire/35 bg-[#0C1117] px-3 py-2">
        <p className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.2em] text-fs-gold">
          <span className="inline-block h-3 w-1 bg-gradient-to-b from-fs-fire to-fs-flame" />
          LIVE STANDINGS
        </p>
        {status === "online" ? (
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-fs-ok">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-fs-ok" /> Realtime
          </span>
        ) : status === "offline" ? (
          <span className="text-[10px] font-bold uppercase tracking-widest text-fs-gold">Cached / Demo</span>
        ) : (
          <span className="fs-connecting text-[10px] font-bold uppercase tracking-widest text-fs-cyan">Connecting…</span>
        )}
      </div>

      <div className={cn("thin-scroll overflow-x-auto", dense ? "max-h-[520px] overflow-y-auto" : "")}>
        <table className="w-full min-w-[380px] border-collapse">
          <HeaderRow mode={mode} />
          <tbody>
            {connecting
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-fs-edge/60">
                    <td className="px-2 py-2.5"><div className="bo-skel mx-auto h-7 w-7" /></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="bo-skel h-8 w-8" />
                        <div className="bo-skel h-4 w-32" />
                      </div>
                    </td>
                    <td className="px-2 py-2.5"><div className="bo-skel mx-auto h-5 w-10" /></td>
                    <td className="px-3 py-2.5"><div className="bo-skel ml-auto h-5 w-10" /></td>
                  </tr>
                ))
              : (
                <AnimatePresence initial={false}>
                  {rows.map((row) => (
                    <BoardRow
                      key={row.teamId}
                      row={row}
                      mode={mode}
                      onTeamClick={onTeamClick}
                      selected={selectedTeamId === row.teamId}
                    />
                  ))}
                </AnimatePresence>
              )}
          </tbody>
        </table>
      </div>

      {updated ? (
        <div className="flex items-center justify-between border-t border-fs-edge bg-[#0C1117] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-fs-muted">
          <span>Scoring resmi {mode === "results" ? "· rincian poin" : "BOF-OFFICIAL"}</span>
          <span className="tabular-nums">Update {updated}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Top 3 khusus — kartu podium horizontal untuk TV/overlay. */
export function Top3Strip({ standings, className }: { standings: StandingsRow[]; className?: string }) {
  const top = standings.slice(0, 3);
  if (!top.length) return null;
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {top.map((row, i) => {
        const plate = rankPlate(row.rank)!;
        return (
          <motion.div
            key={row.teamId}
            layout
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: i * 0.08 }}
            className={cn(
              "relative border bg-[#141B24] px-3 py-3",
              row.rank === 1 && "fs-float",
            )}
            style={{
              borderColor: plate.plate,
              boxShadow: `0 0 18px ${plate.glow}, inset 0 0 22px ${plate.plate}14`,
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="font-stat inline-flex h-8 w-8 items-center justify-center text-lg font-bold"
                style={{ background: plate.plate, color: plate.ink }}
              >
                {row.rank}
              </span>
              {row.rank === 1 ? <Crown className="h-4 w-4 text-fs-gold" /> : null}
            </div>
            <p className="mt-2 truncate font-display text-lg font-bold uppercase tracking-wide">{row.teamName}</p>
            <div className="mt-1.5 flex items-center justify-between">
              <KillBadge kills={row.kills} />
              <span className="font-stat text-xl font-bold text-fs-gold">{row.totalPoints}</span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
