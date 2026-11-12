"use client";
// ============================================================
// STIKAR ESPORTS — LIVE VIEWER (PHASE 2 §8)
// Halaman live publik: gameplay + info match + leaderboard +
// status koneksi stream. Video auto-connect ke sumber yang
// benar-benar tersedia (WHE lokal → HLS → YouTube publik).
// Jika tidak ada video yang benar-benar live, tampilan memakai
// Starting Soon / panduan — TIDAK ADA VIDEO KOSONG SEOLAH LIVE.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Info, MapPin, RadioTower, Signal, Smartphone } from "lucide-react";
import { BroadcastLeaderboard } from "@/components/leaderboard/broadcast-board";
import { LiveVideoPlayer, type PlayerStatus } from "@/components/video/player";
import { PresenceBadge } from "@/components/broadcast/presence-badge";
import { SmkLogoBadge } from "@/components/broadcast/brand-logo";
import { useLivePresence } from "@/services/broadcast/presence";
import { useAutoFullscreen } from "@/lib/fullscreen";
import {
  useActiveTournament, useBroadcast, useMatches, useStandings, useTeams, useTournament,
} from "@/services/firestore/hooks";
import { ORG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { BroadcastState } from "@/lib/types";

/** Ajakan membuka siaran lokal bagi penonton yang sedang di venue (browser memblokir deteksi otomatis HTTPS→HTTP LAN). */
function LocalStreamBanner({ url }: { url: string }) {
  const [here, setHere] = useState(false);
  useEffect(() => {
    try { setHere(window.location.origin === new URL(url).origin); } catch { /* abaikan */ }
  }, [url]);
  if (here) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-fs-cyan/40 bg-fs-cyan/10 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-bold text-fs-cyan">
        <Smartphone className="h-4 w-4 shrink-0" />
        Sedang di lokasi turnamen (Wi-Fi yang sama dengan laptop panitia)? Siaran lokal lebih lancar dan tanpa internet.
      </p>
      <a
        href={`${url.replace(/\/$/, "")}/live`}
        className="border border-fs-cyan px-3 py-1.5 font-display text-xs font-black uppercase tracking-[0.15em] text-fs-cyan hover:bg-fs-cyan/20"
      >
        Buka siaran lokal
      </a>
    </div>
  );
}

export function LiveViewerPage({ tidOverride }: { tidOverride?: string }) {
  const active = useActiveTournament();
  const tid = tidOverride ?? active.tournament?.id ?? null;
  const tournament = useTournament(tid);
  const standings = useStandings(tid);
  const matches = useMatches(tid, false);
  const teams = useTeams(tid, false);
  const broadcast = useBroadcast(tid, false);
  // Indikator penonton realtime (berapa & siapa yang online).
  const presence = useLivePresence(tid, { heartbeat: true });

  // Konfigurasi pairing (Mode B) — tersimpan saat viewer /live/connect.
  const [pairing, setPairing] = useState<{ gw: string; whe: string; hls: string } | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem("stikar.pairing");
        if (raw) setPairing(JSON.parse(raw));
      } catch { /* abaikan */ }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Buka /live?fs=1 → layar penuh otomatis (dipakai link/QR mode TV).
  useAutoFullscreen();

  const currentMatch =
    matches.data?.find((m) => m.isCurrent) ?? matches.data?.find((m) => m.status === "live") ?? null;
  const live = broadcast.data?.live;
  const emergency = broadcast.data?.emergency;
  const rows = standings.data?.standings ?? [];
  const liveState: BroadcastState = live?.state ?? "offline";

  const wheOverride = pairing?.whe?.trim() || undefined;

  return (
    <div className="fs-arena-bg min-h-screen">
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6">
        {/* Header halaman */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Logo resmi sekolah — konsisten dengan header siaran TV */}
            <SmkLogoBadge size={44} className="hidden sm:inline-flex" />
            <div>
              <p className="bo-kicker">Live Broadcast</p>
              <h1 className="mt-2 font-display text-3xl font-black uppercase leading-none sm:text-4xl">
                {tournament.data?.name ?? ORG.tournament}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {liveState === "live" ? (
              <span className="fs-live-badge inline-flex items-center gap-1.5 bg-fs-err px-3 py-1.5 font-display text-sm font-black uppercase tracking-[0.2em] text-white">
                <span className="inline-block h-2 w-2 rounded-full bg-white" /> LIVE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 border border-fs-edge px-3 py-1.5 font-display text-xs font-black uppercase tracking-[0.2em] text-fs-muted">
                {liveState === "reconnecting" ? "RECONNECTING" : "STANDBY"}
              </span>
            )}
            {currentMatch ? (
              <span className="border border-fs-edge bg-fs-panel px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wider text-fs-gold">
                ROUND {String(currentMatch.matchNumber).padStart(2, "0")} · {currentMatch.map || "UNKNOWN"}
              </span>
            ) : null}
            <PresenceBadge count={presence.count} viewers={presence.viewers} className="!border-fs-cyan/45 !bg-fs-cyan/10 !text-fs-cyan" />
          </div>
        </div>

        {/* Status banner darurat */}
        {emergency?.active ? (
          <div className="mt-4 flex items-center gap-3 border border-fs-err/60 bg-fs-err/10 px-4 py-3">
            <RadioTower className="h-5 w-5 shrink-0 text-fs-err" />
            <p className="text-sm font-bold text-fs-err">
              {emergency.preset} — {emergency.message || "Siaran mengalami gangguan sementara."}
            </p>
          </div>
        ) : liveState === "reconnecting" ? (
          <div className="mt-4 flex items-center gap-3 border border-fs-gold/50 bg-fs-gold/10 px-4 py-3">
            <Signal className="fs-connecting h-5 w-5 shrink-0 text-fs-gold" />
            <p className="text-sm font-bold text-fs-gold">
              Stream sedang dipulihkan operator — video akan kembali otomatis.
            </p>
          </div>
        ) : null}

        {broadcast.data?.streamMode === "mediamtx" && broadcast.data.localGatewayUrl ? (
          <LocalStreamBanner url={broadcast.data.localGatewayUrl} />
        ) : null}

        {/* Video + leaderboard */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
          <div>
            <LiveVideoPlayer
              broadcast={broadcast.data}
              wheUrlOverride={wheOverride}
              className="w-full"
              idleContent={
                <div className="flex flex-col items-center gap-4 px-6 text-center">
                  <p className="fs-live-in font-display text-4xl font-black uppercase tracking-[0.14em] text-fs-fire">Starting Soon</p>
                  <p className="max-w-md text-sm font-semibold text-white/60">
                    {currentMatch
                      ? `Match ${currentMatch.matchNumber} · ${currentMatch.map} dijadwalkan berjalan.`
                      : "Belum ada match yang berjalan. Cek kembali saat jadwal siaran."}
                  </p>
                  <Link href="/live/connect" className="bo-btn bo-btn-cyan !px-4 !py-2 text-xs">
                    <Smartphone className="h-3.5 w-3.5" /> Pairing Stream Lokal
                  </Link>
                </div>
              }
            />

            {/* Petunjuk khusus mode P2P — video dikirim laptop → perangkat lewat Wi-Fi lokal */}
            {broadcast.data?.streamMode === "p2p" ? (
              <p className="mt-2 flex items-start gap-2 border border-fs-cyan/40 bg-fs-cyan/10 px-3 py-2 text-[11px] font-bold text-fs-cyan">
                <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Mode P2P: video dikirim langsung dari laptop panitia ke perangkatmu. Pastikan
                perangkat terhubung ke Wi-Fi yang sama dengan laptop panitia. Maks
                {" "}{broadcast.data.p2pMaxViewers ?? 2} penonton bersamaan — bila slot penuh, coba lagi beberapa saat.
              </p>
            ) : null}

            {/* Info bar */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <InfoChip icon={<MapPin className="h-3.5 w-3.5" />} label="Map" value={currentMatch?.map ?? "NOT SET"} />
              <InfoChip icon={<RadioTower className="h-3.5 w-3.5" />} label="Format" value={currentMatch?.format ?? tournament.data?.format ?? "—"} />
              <InfoChip icon={<Signal className="h-3.5 w-3.5" />} label="Sumber" value={pairing ? "Local stream (paired)" : broadcast.data?.streamMode === "youtube" ? "YouTube" : broadcast.data?.streamMode === "mediamtx" ? "MediaMTX" : broadcast.data?.streamMode === "p2p" ? "P2P (langsung)" : "N/A"} />
              <InfoChip icon={<Info className="h-3.5 w-3.5" />} label="Tim" value={`${teams.data?.length ?? 0} tim`} />
            </div>

            {broadcast.data?.announcements?.length ? (
              <motion.div
                key={broadcast.data.announcements[0]}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 flex items-center gap-3 border border-fs-flame/50 bg-fs-flame/10 px-4 py-3"
              >
                <span className="bo-kicker shrink-0">Pengumuman</span>
                <p className="truncate text-sm font-bold">{broadcast.data.announcements[0]}</p>
              </motion.div>
            ) : null}
          </div>

          <div>
            <BroadcastLeaderboard
              standings={rows}
              mode="broadcast"
              status={standings.status}
              updatedAt={standings.data?.updatedAt}
            />
            <p className="mt-2 text-[11px] font-semibold leading-snug text-fs-muted">
              Data dari scoring engine resmi {ORG.tournament} — diperbarui realtime sepanjang panitia
              mempublikasikan hasil. {standings.status === "offline" ? "Saat ini tampil data cache/demo (database tidak terjangkau)." : ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="border border-fs-edge bg-fs-panel px-3 py-2">
      <p className="flex items-center gap-1.5 text-[9.5px] font-black uppercase tracking-[0.18em] text-fs-muted">
        {icon} {label}
      </p>
      <p className={cn("mt-1 truncate font-display text-sm font-bold uppercase", value === "N/A" ? "text-fs-muted/60" : "text-fs-text")}>{value}</p>
    </div>
  );
}
