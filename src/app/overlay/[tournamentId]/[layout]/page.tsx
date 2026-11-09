"use client";
// ============================================================
// ZEROID ESPORTS — OVERLAY ENGINE (OBS Browser Source)
// /overlay/:tournamentId/:layout
// Layouts: full | compact | top3 | match-info | lower-third |
//          score-bug | winner
// Transparan, tanpa navigasi, realtime via onSnapshot.
// ============================================================

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, MapPin, Radio, Swords, Trophy } from "lucide-react";
import { useBroadcast, useMatches, useStandings, useTournament } from "@/services/firestore/hooks";
import { formatTime } from "@/lib/constants";
import type { OverlayLayout } from "@/lib/constants";

export default function OverlayPage() {
  const params = useParams<{ tournamentId: string; layout: string }>();
  const search = useSearchParams();
  const tid = params?.tournamentId ?? null;
  const layout = (params?.layout ?? "compact") as OverlayLayout;
  const scale = Number(search.get("scale") ?? 1);

  const tournament = useTournament(tid);
  const standings = useStandings(tid);
  const matches = useMatches(tid);
  const broadcast = useBroadcast(tid);

  const currentMatch =
    matches.data?.find((m) => m.isCurrent) ??
    matches.data?.find((m) => m.status === "live") ??
    null;
  const rows = standings.data?.standings ?? [];
  const winner = rows[0];

  // Skala berdasarkan lebar bila param w diberikan (rasio aspek dipertahankan).
  const style = useMemo<React.CSSProperties>(() => {
    const w = Number(search.get("w") ?? 0);
    if (w > 0 && typeof window !== "undefined") {
      const s = Math.min(1, window.innerWidth / w);
      return { transform: `scale(${s * scale})`, transformOrigin: "top left" };
    }
    return { transform: `scale(${scale})`, transformOrigin: "top left" };
  }, [search, scale]);

  return (
    <div className="ov-root fixed inset-0 p-2" style={style} aria-label={`Overlay ${layout}`}>
      <AnimatePresence mode="wait">
        {layout === "full" ? <FullBoard key="full" rows={rows} /> : null}
        {layout === "compact" ? <CompactBoard key="compact" rows={rows} matchLabel={currentMatch ? `MATCH ${currentMatch.matchNumber}` : undefined} /> : null}
        {layout === "top3" ? <Top3Overlay key="top3" rows={rows} /> : null}
        {layout === "match-info" ? (
          <MatchInfoOverlay
            key="match-info"
            tournamentName={tournament.data?.name ?? "BATTLE OFF FRIENDS"}
            matchNumber={currentMatch?.matchNumber}
            map={currentMatch?.map}
            format={currentMatch?.format ?? tournament.data?.format}
            status={currentMatch?.status ?? "scheduled"}
            announcements={broadcast.data?.announcements ?? []}
          />
        ) : null}
        {layout === "lower-third" ? (
          <LowerThird key="lower" announcements={broadcast.data?.announcements ?? []} />
        ) : null}
        {layout === "score-bug" ? (
          <ScoreBug key="bug" rows={rows} matchLabel={currentMatch ? `M${currentMatch.matchNumber}` : ""} map={currentMatch?.map} />
        ) : null}
        {layout === "winner" ? <WinnerOverlay key="winner" winner={winner} tournamentName={tournament.data?.name ?? ""} /> : null}
      </AnimatePresence>
    </div>
  );
}

function MatchLabel({ text }: { text: string }) {
  return (
    <span className="ov-chip">
      <Radio className="h-3 w-3" /> {text}
    </span>
  );
}

/* ---------- FULL LEADERBOARD ---------- */
function FullBoard({ rows }: { rows: ReturnType<typeof useStandings>["data"] extends null ? never : NonNullable<ReturnType<typeof useStandings>["data"]>["standings"] }) {
  return (
    <div className="ov-frame ov-cut ml-auto h-full w-full max-w-[520px] overflow-hidden rounded-sm">
      <div className="flex items-center justify-between border-b-2 border-[rgba(217,180,91,0.5)] bg-[rgba(0,0,0,0.75)] px-4 py-2.5">
        <p className="ov-gold font-display text-sm font-black uppercase tracking-[0.2em]">
          Battle Off Friends · Klasemen
        </p>
        <MatchLabel text="LIVE RANK" />
      </div>
      <div className="thin-scroll h-[calc(100%-44px)] overflow-y-auto">
        {rows.map((r) => (
          <motion.div key={r.teamId} layout className="ov-row" style={rowAccent(r.rank)}>
            <span className="ov-gold w-7 font-display font-black tabular-nums">{r.rank}</span>
            <span className="flex-1 truncate font-bold">{r.teamName}</span>
            <span className="w-8 text-center tabular-nums text-white/70">{r.kills}</span>
            <span className="w-10 text-right font-display text-base font-black tabular-nums text-[#f4d374]">
              {r.totalPoints}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ---------- COMPACT ---------- */
function CompactBoard({ rows, matchLabel }: { rows: NonNullable<ReturnType<typeof useStandings>["data"]>["standings"]; matchLabel?: string }) {
  return (
    <div className="ov-frame ov-cut max-w-[380px] overflow-hidden rounded-sm">
      <div className="flex items-center justify-between bg-[rgba(0,0,0,0.75)] px-3 py-1.5">
        <p className="ov-gold font-display text-xs font-black uppercase tracking-[0.2em]">BOF Standings</p>
        {matchLabel ? <MatchLabel text={matchLabel} /> : null}
      </div>
      {rows.slice(0, 5).map((r) => (
        <motion.div key={r.teamId} layout className="ov-row" style={rowAccent(r.rank)}>
          <span className="ov-gold w-6 font-display font-black tabular-nums">{r.rank}</span>
          <span className="flex-1 truncate text-sm font-bold">{r.teamName}</span>
          <span className="w-10 text-right font-display font-black tabular-nums text-[#f4d374]">{r.totalPoints}</span>
        </motion.div>
      ))}
    </div>
  );
}

/* ---------- TOP 3 ---------- */
function Top3Overlay({ rows }: { rows: NonNullable<ReturnType<typeof useStandings>["data"]>["standings"] }) {
  const top3 = rows.slice(0, 3);
  return (
    <div className="flex items-end justify-center gap-4">
      {top3.map((r, i) => (
        <motion.div
          key={r.teamId}
          layout
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: i * 0.1 }}
          className="ov-frame ov-cut w-52 px-4 py-3"
          style={rowAccent(r.rank)}
        >
          <div className="flex items-center gap-2">
            {i === 0 ? <Crown className="h-4 w-4 text-[#f4d374]" /> : <Trophy className="h-4 w-4 text-white/60" />}
            <span className="ov-gold font-display text-2xl font-black">#{r.rank}</span>
          </div>
          <p className="mt-1 truncate font-display text-lg font-black uppercase">{r.teamName}</p>
          <p className="text-xs text-white/70">
            {r.kills} kill · <span className="font-black text-[#f4d374]">{r.totalPoints} PTS</span>
          </p>
        </motion.div>
      ))}
    </div>
  );
}

/* ---------- MATCH INFO ---------- */
function MatchInfoOverlay({
  tournamentName, matchNumber, map, format, status, announcements,
}: {
  tournamentName: string; matchNumber?: number; map?: string; format?: string;
  status?: string; announcements?: string[];
}) {
  return (
    <div className="ov-frame ov-cut flex max-w-[560px] items-center gap-5 px-5 py-3">
      <div>
        <p className="ov-gold font-display text-[11px] font-black uppercase tracking-[0.24em]">{tournamentName}</p>
        <p className="font-display text-2xl font-black uppercase leading-tight">
          {matchNumber ? `MATCH ${matchNumber}` : "SIAP MEMULAI"}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-xs font-bold text-white/70">
          <MapPin className="h-3.5 w-3.5" /> {map ?? "—"} · {format ?? ""} · {status === "live" ? "LIVE" : status === "completed" ? "SELESAI" : "TERJADWAL"}
        </p>
      </div>
      {announcements[0] ? (
        <div className="border-l-2 border-[rgba(217,180,91,0.5)] pl-3 text-xs font-semibold text-white/80">
          {announcements[0]}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- LOWER THIRD ---------- */
function LowerThird({ announcements }: { announcements?: string[] }) {
  const text = announcements[0];
  if (!text) return null;
  return (
    <motion.div
      key={text}
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="ov-frame ov-cut mx-auto flex max-w-[720px] items-center gap-3 px-5 py-3"
    >
      <span className="bg-[#6c2bd9] px-2.5 py-1 font-display text-[11px] font-black uppercase tracking-[0.18em] text-white">
        Pengumuman
      </span>
      <p className="truncate font-display text-lg font-bold">{text}</p>
    </motion.div>
  );
}

/* ---------- SCORE BUG ---------- */
function ScoreBug({ rows, matchLabel, map }: { rows: NonNullable<ReturnType<typeof useStandings>["data"]>["standings"]; matchLabel?: string; map?: string }) {
  const top2 = rows.slice(0, 2);
  return (
    <div className="ov-frame ov-cut flex w-fit items-center divide-x divide-[rgba(217,180,91,0.4)]">
      <span className="bg-[#6c2bd9] px-2.5 py-1.5 font-display text-[11px] font-black uppercase tracking-widest text-white">
        BOF {matchLabel} {map ? `· ${map}` : ""}
      </span>
      {top2.map((r) => (
        <span key={r.teamId} className="flex items-center gap-2 px-3 py-1.5">
          <span className="ov-gold font-display font-black tabular-nums">#{r.rank}</span>
          <span className="text-sm font-bold">{r.teamTag || r.teamName.slice(0, 8)}</span>
          <span className="font-display text-sm font-black tabular-nums text-[#f4d374]">{r.totalPoints}</span>
        </span>
      ))}
    </div>
  );
}

/* ---------- WINNER ---------- */
function WinnerOverlay({ winner, tournamentName }: { winner?: NonNullable<ReturnType<typeof useStandings>["data"]>["standings"][0]; tournamentName: string }) {
  if (!winner) return null;
  return (
    <motion.div
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="ov-frame ov-cut mx-auto w-[560px] px-10 py-8 text-center"
    >
      <p className="ov-gold font-display text-sm font-black uppercase tracking-[0.3em]">
        {tournamentName} · Juara
      </p>
      <Crown className="mx-auto mt-3 h-10 w-10 text-[#f4d374]" />
      <motion.p
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="mt-2 font-display text-4xl font-black uppercase leading-tight"
      >
        {winner.teamName}
      </motion.p>
      <p className="mt-3 flex items-center justify-center gap-4 text-sm font-bold text-white/80">
        <span className="flex items-center gap-1.5"><Swords className="h-4 w-4" /> {winner.kills} kill</span>
        <span className="font-display text-xl font-black text-[#f4d374]">{winner.totalPoints} PTS</span>
      </p>
    </motion.div>
  );
}

function rowAccent(rank: number): React.CSSProperties {
  if (rank === 1) return { background: "rgba(217,180,91,0.16)", borderLeft: "3px solid #f4d374" };
  if (rank === 2) return { background: "rgba(108,43,217,0.22)", borderLeft: "3px solid #6c2bd9" };
  if (rank === 3) return { borderLeft: "3px solid rgba(217,180,91,0.5)" };
  return { borderLeft: "3px solid transparent" };
}

// formatTime dipakai bila timeline publik diaktifkan di overlay.
void formatTime;
