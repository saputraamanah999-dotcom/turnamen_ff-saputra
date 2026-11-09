"use client";
// ============================================================
// /live/status — Status siaran publik (PHASE 2 §8)
// Papan status jujur: state mesin siaran, event terakhir,
// koneksi database, dan (bila pairing tersimpan) kesehatan
// gateway lokal. Dipakai operator & penonton untuk debugging cepat.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Database, RefreshCcw, Server, Signal } from "lucide-react";
import { BoBadge, BoCard, BoButton } from "@/components/common/bo";
import { useActiveTournament, useBroadcast, useStandings } from "@/services/firestore/hooks";
import { ORG, formatTime } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { BroadcastState } from "@/lib/types";

const LABEL: Record<BroadcastState, { text: string; cls: string }> = {
  offline: { text: "OFFLINE", cls: "text-fs-muted" },
  preparing: { text: "PREPARING", cls: "text-fs-cyan" },
  ready: { text: "READY", cls: "text-fs-cyan" },
  connecting: { text: "CONNECTING", cls: "text-fs-gold" },
  starting: { text: "STARTING", cls: "text-fs-gold" },
  live: { text: "LIVE", cls: "text-fs-err" },
  paused: { text: "PAUSED", cls: "text-fs-gold" },
  reconnecting: { text: "RECONNECTING", cls: "text-fs-gold" },
  error: { text: "ERROR", cls: "text-fs-err" },
  stopping: { text: "STOPPING", cls: "text-fs-muted" },
};

export default function LiveStatusPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const broadcast = useBroadcast(tid);
  const standings = useStandings(tid);
  const [gwStatus, setGwStatus] = useState<Record<string, unknown> | null>(null);
  const [tick, setTick] = useState(0);

  const live = broadcast.data?.live;
  const state = live?.state ?? "offline";
  const info = LABEL[state];

  // Probe gateway lokal bila pairing tersimpan (boleh gagal — tampil jujur).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = localStorage.getItem("zeroid.pairing");
        if (!raw) return;
        const p = JSON.parse(raw) as { gw?: string };
        if (!p.gw) return;
        const res = await fetch(`${p.gw}/api/status`, { signal: AbortSignal.timeout(3000) });
        if (!cancelled && res.ok) setGwStatus(await res.json());
        else if (!cancelled) setGwStatus(null);
      } catch {
        if (!cancelled) setGwStatus(null);
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  return (
    <div className="fs-arena-bg min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <p className="bo-kicker">System Status</p>
        <h1 className="mt-3 font-display text-3xl font-black uppercase tracking-wide">Live Status</h1>
        <p className="mt-2 text-sm font-semibold text-fs-muted">
          Papan kondisi siaran {ORG.tournament} — diperbarui realtime.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <BoCard className="p-4">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-fs-muted">
              <Activity className="h-3.5 w-3.5" /> Mesin Siaran
            </p>
            <p className={cn("mt-2 font-display text-3xl font-black uppercase", info.cls)}>{info.text}</p>
            {live?.message ? <p className="mt-1 text-xs font-semibold text-fs-muted">{live.message}</p> : null}
            {live?.startedAt ? (
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-fs-muted">
                Sejak {formatTime(live.startedAt)}
              </p>
            ) : null}
          </BoCard>

          <BoCard className="p-4">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-fs-muted">
              <Database className="h-3.5 w-3.5" /> Data Pertandingan
            </p>
            <p className={cn("mt-2 font-display text-3xl font-black uppercase", standings.status === "online" ? "text-fs-ok" : standings.status === "connecting" ? "text-fs-gold" : "text-fs-gold")}>
              {standings.status === "online" ? "REALTIME" : standings.status === "connecting" ? "CONNECTING" : "CACHED/DEMO"}
            </p>
            <p className="mt-1 text-xs font-semibold text-fs-muted">
              {standings.data ? `${standings.data.standings.length} tim · ${standings.data.publishedMatchCount} match dipublikasikan` : "Menunggu data…"}
            </p>
          </BoCard>

          <BoCard className="p-4 sm:col-span-2">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-fs-muted">
              <Server className="h-3.5 w-3.5" /> Gateway Lokal (venue)
            </p>
            {gwStatus ? (
              <>
                <p className="mt-2 flex flex-wrap items-center gap-2">
                  <BoBadge className="bg-fs-ok/15 text-fs-ok">TERJANGKAU</BoBadge>
                  <span className="text-xs font-bold text-fs-muted">
                    IP {(gwStatus.lanIp as string) ?? "—"} · MediaMTX {(gwStatus.mediamtx as boolean) ? "BERJALAN" : "MATI"} · {(gwStatus.viewers as number) ?? 0} perangkat
                  </span>
                </p>
                <p className="mt-1.5 text-[11px] font-semibold text-fs-muted">
                  Display: <code className="text-fs-cyan">http://{(gwStatus.lanIp as string) ?? ""}:{(gwStatus.gatewayPort as number) ?? ""}/display</code>
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs font-semibold text-fs-muted">
                Tidak terdeteksi dari perangkat ini. Normal bila kamu tidak berada di jaringan venue,
                atau belum melakukan <Link href="/live/connect" className="text-fs-cyan underline">pairing</Link>.
              </p>
            )}
          </BoCard>

          {broadcast.data?.event ? (
            <BoCard className="p-4 sm:col-span-2">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-fs-muted">
                <Signal className="h-3.5 w-3.5" /> Event Broadcast Terakhir
              </p>
              <p className="mt-2 font-display text-lg font-black uppercase text-fs-flame">
                {broadcast.data.event.type.replaceAll("_", " ")}
              </p>
              <p className="text-[11px] font-bold text-fs-muted">
                {new Date(broadcast.data.event.at).toLocaleTimeString("id-ID")}
                {broadcast.data.event.message ? ` — ${broadcast.data.event.message}` : ""}
              </p>
            </BoCard>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <BoButton variant="white" className="!px-4 !py-2 text-xs" onClick={() => setTick((t) => t + 1)}>
            <RefreshCcw className="h-3.5 w-3.5" /> Segarkan Status
          </BoButton>
          <Link href="/live" className="text-xs font-bold uppercase tracking-widest text-fs-cyan hover:underline">Buka halaman LIVE →</Link>
        </div>
      </div>
    </div>
  );
}
