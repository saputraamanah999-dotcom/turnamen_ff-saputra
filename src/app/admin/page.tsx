"use client";
// /admin — Dashboard Control Room (PHASE 2 §4)
// Kartu status: LIVE, turnamen, match, viewer, sumber stream,
// OBS, jaringan lokal, AI Observer, leaderboard — semuanya dari
// kondisi koneksi NYATA (bridge WebSocket / Firestore), bukan palsu.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity, ArrowRight, CheckCircle2, Cpu, Database, ListOrdered, MonitorPlay,
  Radio, Trophy, Users, Wifi,
} from "lucide-react";
import { BoCard } from "@/components/common/bo";
import { useActiveTournament, useBroadcast, useMatches, useStandings, useTeams } from "@/services/firestore/hooks";
import { formatDateTime } from "@/lib/constants";
import { connectBridge, disconnectBridge, subscribeBridge, type BridgeState } from "@/services/broadcast/bridge";
import { cn } from "@/lib/utils";
import type { BroadcastState } from "@/lib/types";

const LIVE_LABEL: Record<BroadcastState, string> = {
  offline: "OFFLINE", preparing: "PREPARING", ready: "READY", connecting: "CONNECTING",
  starting: "STARTING", live: "LIVE", paused: "PAUSED", reconnecting: "RECONNECTING",
  error: "ERROR", stopping: "STOPPING",
};

export default function AdminDashboard() {
  const { tournament, status } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const teams = useTeams(tid);
  const matches = useMatches(tid);
  const standings = useStandings(tid);
  const broadcast = useBroadcast(tid);
  const [bridge, setBridge] = useState<BridgeState | null>(null);
  const [now, setNow] = useState("");

  useEffect(() => {
    const first = setTimeout(() => setNow(formatDateTime(Date.now())), 0);
    const t = setInterval(() => setNow(formatDateTime(Date.now())), 30000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);

  useEffect(() => {
    connectBridge();
    const unsub = subscribeBridge((s) => setBridge(s));
    return () => { unsub(); disconnectBridge(); };
  }, []);

  const currentMatch = matches.data?.find((m) => m.isCurrent) ?? null;
  const live = broadcast.data?.live;
  const liveState = live?.state ?? "offline";
  const bridgeOnline = Boolean(bridge?.connected);
  const viewers = liveState === "live" && bridgeOnline
    ? `${bridge?.viewers ?? 0} perangkat` // dari bridge lokal (bukan palsu)
    : "N/A";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide">Dashboard Control Room</h1>
          <p className="mt-1 text-sm font-semibold text-fs-muted">Pembaruan terakhir diperiksa: {now}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/live-control"><BoDashLink icon={<Radio className="h-3.5 w-3.5" />} label="Live Control" /></Link>
          <Link href="/admin/local-network"><BoDashLink icon={<Wifi className="h-3.5 w-3.5" />} label="Local Network" /></Link>
        </div>
      </div>

      {/* Baris 1: status utama siaran */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Radio className="h-4 w-4" />}
          label="Status Siaran"
          value={LIVE_LABEL[liveState]}
          accent={liveState === "live" ? "text-fs-err" : liveState === "offline" ? "text-fs-muted" : "text-fs-gold"}
          glow={liveState === "live"}
          sub={live?.message || (liveState === "live" ? `Sejak ${formatDateTime(live?.startedAt ?? null)}` : "Tekan Prepare di Live Control")}
        />
        <StatCard icon={<Trophy className="h-4 w-4" />} label="Turnamen Aktif" value={tournament?.name ?? "—"} accent="text-fs-gold" sub={status === "online" ? "Database realtime online" : "Mode demo (database offline)"} />
        <StatCard icon={<Activity className="h-4 w-4" />} label="Match Berjalan" value={currentMatch ? `Match ${currentMatch.matchNumber}` : "—"} accent="text-fs-fire" sub={currentMatch ? `${currentMatch.map} · BOF format ${currentMatch.format}` : "Belum ada match current"} />
        <StatCard icon={<Users className="h-4 w-4" />} label="Perangkat Penonton" value={viewers} accent="text-fs-cyan" sub={bridgeOnline ? "Data bridge lokal" : "Bridge lokal tidak tersambung → N/A"} />
      </div>

      {/* Baris 2: infrastruktur siaran */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<MonitorPlay className="h-4 w-4" />} label="Sumber Stream" value={live?.source ?? (broadcast.data?.streamMode === "youtube" ? "YouTube" : broadcast.data?.streamMode === "mediamtx" ? "MediaMTX" : "N/A")} accent="text-fs-flame" sub={live?.destination ? `Tujuan: ${live.destination.toUpperCase().replace("+", " + ")}` : "Pilih di Live Control"} />
        <StatCard icon={<Radio className="h-4 w-4" />} label="OBS Studio" value={bridge?.obsConnected ? `v${bridge.obsVersion ?? "?"}` : "Tidak tersambung"} accent={bridge?.obsConnected ? "text-fs-ok" : "text-fs-muted"} sub={bridge?.obsConnected ? (bridge.streaming ? "Output streaming aktif" : "Output idle") : "Jalankan bridge di laptop + token"} />
        <StatCard icon={<Wifi className="h-4 w-4" />} label="Jaringan Lokal" value={bridgeOnline ? "Gateway aktif" : "N/A"} accent={bridgeOnline ? "text-fs-ok" : "text-fs-muted"} sub={bridgeOnline ? "Laptop = pusat siaran LAN" : "Bridge 127.0.0.1:8078 offline"} />
        <StatCard icon={<Cpu className="h-4 w-4" />} label="AI Observer" value="Service lokal" accent="text-fs-muted" sub="Opsional — Python service di laptop (observer-ai)" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BoCard className="p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-bold uppercase tracking-wide">
            <Database className="h-4 w-4 text-fs-cyan" /> Status Sistem
          </h2>
          <ul className="mt-3 space-y-2.5 text-sm font-bold">
            <StatusRow label="Database realtime" ok={status === "online"} note={status === "online" ? "Firestore listener aktif" : "Tidak terjangkau — tampilan memakai data demo"} />
            <StatusRow label="Leaderboard publik" ok={Boolean(standings.data)} note={standings.data ? `${standings.data.standings.length} tim terklasemen · ${standings.data.publishedMatchCount} match` : "Belum ada publikasi"} />
            <StatusRow label="Security rules" ok={status === "online"} note={status === "online" ? "Akses publik/patuh rules" : "Cek di halaman setup"} />
            <StatusRow label="Bridge lokal" ok={bridgeOnline} note={bridgeOnline ? "OBS + gateway LAN siap dikendalikan" : "Fitur OBS/LAN menunggu bridge di laptop produksi"} />
          </ul>
        </BoCard>

        <BoCard className="p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-bold uppercase tracking-wide">
            <ListOrdered className="h-4 w-4 text-fs-gold" /> Klasemen Ringkas
          </h2>
          {standings.data?.standings.length ? (
            <ul className="mt-3 space-y-1.5">
              {standings.data.standings.slice(0, 5).map((r) => (
                <li key={r.teamId} className="flex items-center gap-3 border-b border-fs-edge/50 pb-1.5 text-sm last:border-0">
                  <span className={cn("font-stat inline-flex h-7 w-7 items-center justify-center text-sm font-bold",
                    r.rank === 1 ? "bg-fs-gold text-fs-ink" : r.rank === 2 ? "bg-[#C0C8D4] text-fs-ink" : r.rank === 3 ? "bg-[#C98A4B] text-fs-ink" : "border border-fs-edge bg-fs-bg")}>
                    {r.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold">{r.teamName}</span>
                  <span className="text-xs font-bold text-fs-fire">{r.kills} kill</span>
                  <span className="font-stat w-10 text-right text-base font-bold text-fs-gold">{r.totalPoints}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm font-semibold text-fs-muted">Belum ada publikasi hasil.</p>
          )}
          {standings.data?.updatedAt ? (
            <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-fs-muted">
              Terakhir dipublikasikan {formatDateTime(standings.data.updatedAt)} · {teams.data?.length ?? 0} tim terdaftar
            </p>
          ) : null}
        </BoCard>
      </div>
    </div>
  );
}

function BoDashLink({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="bo-btn bo-btn-fire !px-3 !py-1.5 !text-[11px]">
      {icon} {label} <ArrowRight className="h-3 w-3" />
    </span>
  );
}

function StatCard({
  icon, label, value, sub, accent, glow,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: string; glow?: boolean;
}) {
  return (
    <div className={cn("bo-card fs-cut-sm px-4 py-3.5", glow && "fs-onair border-fs-fire/60")}>
      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-fs-muted">
        {icon} {label}
      </p>
      <p className={cn("mt-1.5 truncate font-display text-xl font-black uppercase", accent ?? "text-fs-text")}>{value}</p>
      {sub ? <p className="mt-1 text-[11px] font-semibold leading-snug text-fs-muted">{sub}</p> : null}
    </div>
  );
}

function StatusRow({ label, ok, note }: { label: string; ok: boolean; note: string }) {
  return (
    <li className="flex items-start gap-2.5">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-fs-ok" />
      ) : (
        <span className="mt-1 inline-block h-3 w-3 shrink-0 border border-fs-edge bg-fs-muted/20" aria-hidden />
      )}
      <span>
        {label} <span className="ml-1 text-xs font-semibold text-fs-muted">— {note}</span>
      </span>
    </li>
  );
}
