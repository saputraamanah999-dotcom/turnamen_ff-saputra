"use client";
// ============================================================
// STIKAR ESPORTS — BROADCAST ESPORTS LEADERBOARD
// Tampilan klasemen gaya turnamen internasional Free Fire
// (FFWS/PSL): podium emas/perak/perunggu dengan rays juara,
// watermark angka raksasa, sweep cahaya, kontras tinggi untuk
// layar tancap / projector / siaran langsung, siap di-screenshot.
// ============================================================

import { AnimatePresence, motion } from "framer-motion";
import {
  ClipboardCheck, Coins, Crown, Crosshair, MapPinned, Maximize, Medal,
  Minimize, RefreshCw, ShieldQuestion, Swords, Trophy,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { OFFICIAL_KILL_POINT, OFFICIAL_PLACEMENT_POINTS } from "@/lib/constants";
import {
  FlashNumber, MovementIcon, RankBadge, TeamInitials, formatUpdatedAt,
} from "./leaderboard";
import type { StandingsRow } from "@/lib/types";

/* ============================================================
   PODIUM JUARA 1 / 2 / 3
   ============================================================ */

const TIER = {
  1: {
    card: "es-podium-gold",
    chip: "bg-[#1A1002]/85 text-[#FFD97A]",
    order: "md:order-2",
    label: "Juara 1",
    avatar: "bg-[#140D02] text-[#FFD97A] border-[#FFDF8C]",
    pointsCls: "es-glow-gold",
    divider: "divide-[#1A1002]/25",
    borderT: "border-[#1A1002]/25",
  },
  2: {
    card: "es-podium-silver",
    chip: "bg-[#10151C]/85 text-[#D9E1EC]",
    order: "md:order-1",
    label: "Juara 2",
    avatar: "bg-[#0F141B] text-[#E6EDF5] border-[#C9D3E0]",
    pointsCls: "",
    divider: "divide-[#10151C]/25",
    borderT: "border-[#10151C]/25",
  },
  3: {
    card: "es-podium-bronze",
    chip: "bg-[#2E1602]/85 text-[#F7C993]",
    order: "md:order-3",
    label: "Juara 3",
    avatar: "bg-[#1E0F03] text-[#F7C993] border-[#F7C993]",
    pointsCls: "",
    divider: "divide-[#FFF7EE]/30",
    borderT: "border-[#FFF7EE]/30",
  },
} as const;

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function PodiumStat({
  icon, label, value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-1 py-2">
      <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.14em] opacity-70">
        {icon}
        {label}
      </span>
      <span className="font-stat text-lg font-bold tabular-nums leading-none">{value}</span>
    </div>
  );
}

function PodiumCard({ row, tierIdx }: { row: StandingsRow; tierIdx: 1 | 2 | 3 }) {
  const t = TIER[tierIdx];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: (tierIdx - 1) * 0.12, type: "spring", stiffness: 240, damping: 22 }}
      className={cn(
        "es-podium relative p-4 pb-5 md:p-5",
        t.card,
        t.order,
        tierIdx === 1 && "fs-float z-10",
      )}
    >
      {tierIdx === 1 ? <div className="es-rays" aria-hidden /> : null}
      <span className={cn("es-watermark", tierIdx !== 1 && "es-watermark-ink")} aria-hidden>
        {tierIdx}
      </span>

      <div className="relative flex items-start justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-1 font-display text-[11px] font-black uppercase tracking-[0.18em]",
            t.chip,
          )}
        >
          {tierIdx === 1 ? (
            <Crown className="es-crown-anim h-4 w-4" strokeWidth={2.5} aria-hidden />
          ) : (
            <Medal className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          )}
          {t.label}
        </span>
        <span className="font-stat text-5xl font-bold leading-none tabular-nums opacity-90">
          {tierIdx}
        </span>
      </div>

      <div className="relative mt-4 flex items-center gap-3">
        <span
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center border-2 font-display text-xl font-black bo-shadow-sm",
            t.avatar,
          )}
          aria-hidden
        >
          {initialsOf(row.teamName)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-black uppercase leading-tight md:text-2xl">
            {row.teamName}
          </p>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-75">
            [{row.teamTag}] · {row.matchesPlayed} match
          </p>
        </div>
      </div>

      <div className="relative mt-3 flex items-end gap-1.5">
        <span
          className={cn(
            "font-stat text-6xl font-bold leading-none tabular-nums md:text-7xl",
            t.pointsCls,
          )}
        >
          {row.totalPoints}
        </span>
        <span className="pb-1.5 font-display text-xs font-black uppercase tracking-[0.22em] opacity-70">
          poin
        </span>
      </div>

      <div className={cn("relative mt-4 grid grid-cols-3 border-t divide-x", t.borderT, t.divider)}>
        <PodiumStat icon={<Crosshair className="h-3.5 w-3.5" aria-hidden />} label="Kill" value={row.kills} />
        <PodiumStat icon={<MapPinned className="h-3.5 w-3.5" aria-hidden />} label="Placement" value={row.placementPoints} />
        <PodiumStat icon={<Swords className="h-3.5 w-3.5" aria-hidden />} label="Match" value={row.matchesPlayed} />
      </div>
    </motion.div>
  );
}

export function EsportsPodium({
  standings,
  className,
}: {
  standings: StandingsRow[];
  className?: string;
}) {
  const top3 = standings.slice(0, 3);
  if (!top3.length) return null;
  // DOM: 1,2,3 (urutan mobile rapi). Desktop: peringkat 2 kiri,
  // peringkat 1 tengah (paling tinggi), peringkat 3 kanan.
  const ordered = top3.map((row, i) => ({ row, tierIdx: (i + 1) as 1 | 2 | 3 }));
  return (
    <div className={cn("grid gap-3 md:grid-cols-3 md:items-stretch md:gap-4", className)}>
      {ordered.map(({ row, tierIdx }) => (
        <PodiumCard key={row.teamId} row={row} tierIdx={tierIdx} />
      ))}
    </div>
  );
}

/* ============================================================
   BARIS KLASEMEN (peringkat 4 dst) — kontras tinggi
   ============================================================ */

function tierBarColor(rank: number): string {
  if (rank === 1) return "bg-[#FFC247]";
  if (rank === 2) return "bg-[#C9D3E0]";
  if (rank === 3) return "bg-[#D98E45]";
  if (rank <= 6) return "bg-fs-cyan";
  if (rank <= 9) return "bg-fs-flame";
  return "bg-fs-edge-strong";
}

function movementTitle(row: StandingsRow): string {
  if (row.movement === "up") return `Naik dari peringkat ${row.previousRank ?? "?"}`;
  if (row.movement === "down") return `Turun dari peringkat ${row.previousRank ?? "?"}`;
  if (row.movement === "new") return "Tim baru masuk klasemen";
  return "Peringkat tetap";
}

export function EsportsStandings({
  standings,
  onTeamClick,
  selectedTeamId,
  title = "Klasemen Lengkap",
  className,
}: {
  standings: StandingsRow[];
  onTeamClick?: (row: StandingsRow) => void;
  selectedTeamId?: string | null;
  title?: string;
  className?: string;
}) {
  const rows = standings;
  if (!rows.length) return null;
  return (
    <div className={cn("overflow-hidden border border-fs-edge bo-card", className)}>
      <div className="fs-shine flex items-center gap-2 border-b border-fs-edge bg-fs-head px-3 py-2">
        <Trophy className="h-3.5 w-3.5 text-fs-gold" aria-hidden />
        <p className="font-display text-xs font-black uppercase tracking-[0.2em] text-white">
          {title}
        </p>
        <span className="ml-auto font-stat text-[10px] font-bold uppercase tracking-widest text-white/60">
          {rows.length} tim
        </span>
      </div>

      {/* Header kolom — sejajar dengan lebar kolom angka di bawah */}
      <div className="flex items-center gap-2.5 border-b border-fs-edge bg-fs-char px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-fs-muted">
        <span className="w-1" aria-hidden />
        <span className="w-10 text-center">Rank</span>
        <span className="hidden w-8 shrink-0 sm:block" aria-hidden />
        <span className="min-w-0 flex-1 pl-1">Tim</span>
        <span className="w-5 text-center" aria-hidden />
        <span className="w-14 text-center">Kill</span>
        <span className="w-16 text-center">Poin</span>
      </div>

      <AnimatePresence initial={false}>
        {rows.map((row, i) => (
          <motion.div
            key={row.teamId}
            layout
            onClick={() => onTeamClick?.(row)}
            className={cn(
              "es-row fs-row-in flex items-center gap-2.5 border-b border-fs-edge/50 bg-fs-panel px-3 py-2.5 last:border-b-0",
              onTeamClick ? "cursor-pointer" : "",
              selectedTeamId === row.teamId && "bg-fs-cyan/15",
            )}
            style={{ animationDelay: `${Math.min(i * 60, 600)}ms` }}
          >
            <span className={cn("h-9 w-1 shrink-0 rounded-full", tierBarColor(row.rank))} aria-hidden />
            <div className="w-10 text-center">
              <RankBadge rank={row.rank} />
            </div>
            <span className="hidden sm:block" aria-hidden>
              <TeamInitials name={row.teamName} size="sm" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-bold uppercase leading-tight">
                {row.teamName}
                {row.needsManualReview ? (
                  <ShieldQuestion className="ml-1 inline h-3.5 w-3.5 text-amber-500" aria-label="Perlu review manual" />
                ) : null}
                {row.disciplineStatus === "DISQUALIFIED" ? (
                  <span
                    className="ml-1.5 inline-block border border-red-500/70 bg-red-500/15 px-1 py-px align-middle font-display text-[9px] font-black uppercase tracking-[0.12em] text-red-400"
                    title="Tim didiskualifikasi — seluruh poin dihapus (juknis §G)"
                  >
                    DISQUALIFIED
                  </span>
                ) : row.disciplineStatus === "SUSPENDED" ? (
                  <span className="ml-1.5 inline-block border border-amber-500/70 bg-amber-500/15 px-1 py-px align-middle font-display text-[9px] font-black uppercase tracking-[0.12em] text-amber-400">
                    SUSPENDED
                  </span>
                ) : null}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-fs-muted">
                [{row.teamTag}] · main {row.matchesPlayed}x
              </p>
            </div>
            <span className="w-5 text-center" title={movementTitle(row)}>
              <MovementIcon movement={row.movement} />
            </span>
            <div className="w-14 text-center font-stat text-base font-bold tabular-nums text-fs-cyan">
              <FlashNumber value={row.kills} />
            </div>
            <div className="w-16 text-center font-stat text-lg font-bold tabular-nums text-fs-gold">
              <FlashNumber value={row.totalPoints} />
              {row.violationPenalty ? (
                <span
                  className="ml-0.5 align-middle text-[10px] font-black text-red-400"
                  title={`Raw ${row.rawPoints ?? "?"} poin − penalti ${row.violationPenalty} poin (sanksi tercatat)`}
                >
                  −{row.violationPenalty}
                </span>
              ) : null}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ============================================================
   STAT STRIP BROADCAST — match, kill, poin/kill, versi aturan
   ============================================================ */

export function BroadcastStats({
  publishedMatchCount,
  totalKills,
  killPoint = OFFICIAL_KILL_POINT,
  scoringVersion,
  className,
}: {
  publishedMatchCount: number;
  totalKills: number;
  killPoint?: number;
  scoringVersion?: string;
  className?: string;
}) {
  const items = [
    { icon: <Swords className="h-4 w-4" aria-hidden />, label: "Match Resmi", value: String(publishedMatchCount), accent: "from-fs-fire to-fs-flame" },
    { icon: <Crosshair className="h-4 w-4" aria-hidden />, label: "Total Kill", value: String(totalKills), accent: "from-fs-cyan to-transparent" },
    { icon: <Coins className="h-4 w-4" aria-hidden />, label: "Poin / Kill", value: `+${killPoint}`, accent: "from-fs-gold to-transparent" },
    { icon: <ClipboardCheck className="h-4 w-4" aria-hidden />, label: "Versi Aturan", value: scoringVersion || "-", accent: "from-fs-edge-strong to-transparent" },
  ];
  return (
    <div className={cn("grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3", className)}>
      {items.map((it) => (
        <div key={it.label} className="bo-card bo-press relative overflow-hidden px-3.5 py-3">
          <span className={cn("absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r", it.accent)} aria-hidden />
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-fs-muted">{it.label}</p>
            <span className="text-fs-muted">{it.icon}</span>
          </div>
          <p
            className={cn(
              "mt-1 font-stat font-bold tabular-nums text-fs-gold",
              it.value.length > 6 ? "text-lg md:text-xl" : "text-2xl md:text-3xl",
            )}
          >
            {it.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   TICKER REALTIME — baris status siaran tipis
   ============================================================ */

export function RealtimeTicker({
  updatedAt,
  right,
  className,
}: {
  updatedAt?: unknown;
  right?: string;
  className?: string;
}) {
  const updated = formatUpdatedAt(updatedAt);
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-y border-fs-edge bg-fs-head px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-white/85",
        className,
      )}
    >
      <RefreshCw className="fs-connecting h-3.5 w-3.5 text-fs-cyan" aria-hidden />
      <span>Realtime {updated ? `· terakhir diperbarui ${updated}` : "· tersambung"}</span>
      {right ? <span className="ml-auto text-white/55">{right}</span> : null}
    </div>
  );
}

/* ============================================================
   STAND BY — layar tunggu saat klasemen masih kosong
   ============================================================ */

export function StandbyIdle({
  connecting = false,
  className,
}: {
  connecting?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bo-card relative flex min-h-[300px] flex-col items-center justify-center overflow-hidden px-6 py-12 text-center fs-scanline",
        className,
      )}
    >
      <div className="bo-halftone absolute inset-0" aria-hidden />
      <div className="relative mb-5 flex h-24 w-24 items-center justify-center">
        <span className="es-radar-ring" aria-hidden />
        <span className="es-radar-ring" style={{ animationDelay: "0.8s" }} aria-hidden />
        <span className="es-radar-ring" style={{ animationDelay: "1.6s" }} aria-hidden />
        <Trophy className="fs-glow-text h-10 w-10 text-fs-gold" aria-hidden />
      </div>
      <p className="fs-glow-text relative font-display text-3xl font-black uppercase tracking-[0.3em] text-white md:text-4xl">
        {connecting ? "Connecting" : "Stand By"}
      </p>
      <p className="relative mt-2 max-w-md text-sm font-semibold text-fs-muted">
        {connecting
          ? "Menghubungkan ke server klasemen realtime…"
          : "Klasemen resmi otomatis tampil realtime begitu panitia mempublikasikan hasil match pertama."}
      </p>
      <span className="bo-badge relative mt-4 border-fs-cyan/50 bg-fs-cyan/10 text-fs-cyan">
        <RefreshCw className="fs-connecting h-3 w-3" aria-hidden /> Realtime aktif — menunggu data
      </span>
    </div>
  );
}

/* ============================================================
   SISTEM POIN RESMI — referensi 1–12 + per kill
   ============================================================ */

const RANK_CHIP: Record<number, string> = {
  1: "bg-[#FFC247] text-[#231400]",
  2: "bg-[#C9D3E0] text-[#0F141B]",
  3: "bg-[#D98E45] text-[#FFF7EE]",
};

export function PointReference({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-center gap-3">
        <div className="bo-stripe h-1 w-10" aria-hidden />
        <h2 className="font-display text-xl font-black uppercase tracking-wide text-white md:text-2xl">
          Sistem Poin Resmi BOF
        </h2>
        <div className="h-px flex-1 bg-fs-edge" aria-hidden />
      </div>
      <p className="mb-4 text-xs font-semibold text-fs-muted md:text-sm">
        Poin placement resmi + {OFFICIAL_KILL_POINT} poin per kill. Tiebreaker: total poin →
        placement points → placement game terakhir sesuai format.
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 md:gap-3">
        {OFFICIAL_PLACEMENT_POINTS.map((pts, i) => {
          const rank = i + 1;
          return (
            <div key={rank} className="bo-card-flat bo-press relative overflow-hidden px-3 py-2.5 text-center">
              {rank <= 3 ? (
                <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-current to-transparent opacity-60" aria-hidden
                  style={{ color: rank === 1 ? "#FFC247" : rank === 2 ? "#C9D3E0" : "#D98E45" }}
                />
              ) : null}
              <span
                className={cn(
                  "inline-block px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest",
                  RANK_CHIP[rank] ?? "bg-fs-edge-strong text-fs-text",
                )}
              >
                Rank {rank}
              </span>
              <p className="mt-1 font-stat text-2xl font-bold tabular-nums leading-none">{pts}</p>
            </div>
          );
        })}
        <div
          className="relative overflow-hidden px-3 py-2.5 text-center text-[#231400] border border-[#FFDF8C]/80"
          style={{
            background: "linear-gradient(135deg, #FFC247 0%, #E8960A 100%)",
            boxShadow: "0 0 16px rgba(255,194,71,0.3)",
          }}
        >
          <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Per Kill</p>
          <p className="mt-1 font-stat text-2xl font-bold tabular-nums leading-none">+{OFFICIAL_KILL_POINT}</p>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   MODE LAYAR TANCAP — fullscreen 1 klik untuk projector
   ============================================================ */

export function FullscreenButton({ className }: { className?: string }) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const onChange = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className={cn("bo-btn bo-btn-cyan", className)}
      title="Tampilkan penuh untuk layar tancap / projector — klik lagi untuk keluar"
    >
      {active ? <Minimize className="h-4 w-4" aria-hidden /> : <Maximize className="h-4 w-4" aria-hidden />}
      {active ? "Keluar Layar" : "Mode Layar Tancap"}
    </button>
  );
}

/* ============================================================
   HERO BROADCAST — judul panggung ala turnamen internasional
   ============================================================ */

export function BroadcastHero({
  tournamentName,
  institution,
  scoringVersion,
  actions,
}: {
  tournamentName: string;
  institution?: string;
  scoringVersion?: string;
  actions?: ReactNode;
}) {
  return (
    <section className="fs-arena-bg relative overflow-hidden border-b border-fs-edge">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(53,214,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(53,214,255,.05) 1px, transparent 1px)",
          backgroundSize: "34px 34px",
        }}
        aria-hidden
      />
      <div className="bo-halftone absolute inset-0" aria-hidden />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-5 px-4 pb-7 pt-9 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="bo-badge fs-live-badge border-red-500/60 bg-red-500/10 text-red-400">
              <span className="ov-live-dot" aria-hidden /> Live Standings
            </span>
            <span className="bo-badge">Klasemen Resmi</span>
            {scoringVersion ? (
              <span className="bo-badge border-fs-gold/50 bg-fs-gold/10 text-fs-gold">{scoringVersion}</span>
            ) : null}
          </div>
          <h1 className="mt-4 font-display font-black uppercase leading-[0.92]">
            <span className="es-title-fire block text-[clamp(2.6rem,8vw,4.6rem)]">Leaderboard</span>
            <span className="block text-[clamp(1.5rem,4.4vw,2.6rem)] text-white">{tournamentName}</span>
          </h1>
          {institution ? (
            <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.28em] text-fs-muted md:text-xs">
              {institution}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-start md:justify-end">{actions}</div> : null}
      </div>
      <div className="bo-stripe relative h-1.5 w-full" aria-hidden />
    </section>
  );
}

/* ============================================================
   JUDUL SEKSI — garis stripe + heading broadcast
   ============================================================ */

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="bo-stripe h-1 w-10" aria-hidden />
      <h2 className="font-display text-xl font-black uppercase tracking-wide text-white md:text-2xl">
        {children}
      </h2>
      <div className="h-px flex-1 bg-fs-edge" aria-hidden />
    </div>
  );
}

/* ============================================================
   KOMPOSISI UTAMA — dipakai /leaderboard dan /leaderboard/:tid
   ============================================================ */

export function BroadcastLeaderboard({
  standings,
  status,
  updatedAt,
  onTeamClick,
  selectedTeamId,
  publishedMatchCount,
  totalKills,
  killPoint = OFFICIAL_KILL_POINT,
  scoringVersion,
  tournamentName,
  institution,
  showPoints = false,
  banner,
  extraAfterPodium,
  extraBottom,
}: {
  standings: StandingsRow[];
  status?: "connecting" | "online" | "offline";
  updatedAt?: unknown;
  onTeamClick?: (row: StandingsRow) => void;
  selectedTeamId?: string | null;
  publishedMatchCount: number;
  totalKills: number;
  killPoint?: number;
  scoringVersion?: string;
  tournamentName: string;
  institution?: string;
  showPoints?: boolean;
  banner?: ReactNode;
  /** Konten tambahan tepat setelah podium (mis. banner juara turnamen selesai). */
  extraAfterPodium?: ReactNode;
  /** Konten tambahan sebelum referensi poin (mis. sertifikat juara). */
  extraBottom?: ReactNode;
}) {
  const rows = standings ?? [];
  const rest = rows.slice(3);
  const empty = rows.length === 0;
  return (
    <div>
      <BroadcastHero
        tournamentName={tournamentName}
        institution={institution}
        scoringVersion={scoringVersion}
        actions={<FullscreenButton />}
      />
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:py-8">
        {banner ? <div className="-mt-1">{banner}</div> : null}

        <div className="space-y-2">
          <BroadcastStats
            publishedMatchCount={publishedMatchCount}
            totalKills={totalKills}
            killPoint={killPoint}
            scoringVersion={scoringVersion}
          />
          <RealtimeTicker updatedAt={updatedAt} right={`${rows.length} tim terpantau`} />
        </div>

        {empty ? (
          <StandbyIdle connecting={status === "connecting"} />
        ) : (
          <>
            <section className="space-y-3">
              <SectionTitle>Podium Juara</SectionTitle>
              <EsportsPodium standings={rows} />
            </section>
            {extraAfterPodium ? <div className="space-y-3">{extraAfterPodium}</div> : null}
            {rest.length ? (
              <section className="space-y-3">
                <SectionTitle>Peringkat 4 — {rows.length}</SectionTitle>
                <EsportsStandings
                  standings={rest}
                  onTeamClick={onTeamClick}
                  selectedTeamId={selectedTeamId}
                />
              </section>
            ) : null}
          </>
        )}

        {extraBottom ? <div>{extraBottom}</div> : null}

        {showPoints ? <PointReference /> : null}
      </div>
    </div>
  );
}
