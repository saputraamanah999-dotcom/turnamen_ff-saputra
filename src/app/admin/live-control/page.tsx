"use client";
// ============================================================
// /admin/live-control — PUSAT KENDALI SIARAN (PHASE 2 §5)
// Mesin status: OFFLINE → PREPARING → READY → CONNECTING →
// STARTING → LIVE ⇄ PAUSED → RECONNECTING → STOPPING → OFFLINE.
// Sumber: capture window/fullscreen (getDisplayMedia) atau OBS.
// Tujuan: LOCAL / PUBLIC / LOCAL+PUBLIC via WHIP → MediaMTX.
// Semua status & statistik dari koneksi nyata — tanpa kepalsuan.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Camera, CheckCircle2, CircleDot, ListVideo, Loader2,
  Monitor, Pause, Play, Plug, RefreshCw, RotateCcw, Send, Square,
  Tv, Volume2, Wifi, XCircle,
} from "lucide-react";
import { BoBadge, BoButton, BoCard } from "@/components/common/bo";
import { useActiveTournament, useBroadcast, useMatches } from "@/services/firestore/hooks";
import {
  captureSource, StreamPublisher, type SourceQuality, type StreamStats,
} from "@/services/broadcast/stream";
import { P2PHost, cleanupStaleP2PSessions } from "@/services/broadcast/p2p";
import { clampP2pMaxViewers } from "@/services/broadcast/p2p";
import { setLiveState, publishBroadcastEvent } from "@/services/scoring/publish";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { useAdminSession } from "@/services/auth/admin";
import { useToast } from "@/hooks/use-toast";
import {
  autoConnectBridge, disconnectBridge, sendBridgeCommand, subscribeBridge, type BridgeState,
} from "@/services/broadcast/bridge";
import { cn } from "@/lib/utils";
import type { BroadcastEventType, BroadcastState, BroadcastDestination, P2PViewerInfo } from "@/lib/types";

const FLOW: BroadcastState[] = ["offline", "preparing", "ready", "connecting", "starting", "live", "paused", "reconnecting", "stopping", "error"];

const ANNOUNCEMENTS: { type: BroadcastEventType; label: string }[] = [
  { type: "LIVE_STARTING", label: "LIVE STARTING" },
  { type: "LIVE_NOW", label: "LIVE NOW" },
  { type: "MATCH_STARTED", label: "MATCH STARTED" },
  { type: "MATCH_PAUSED", label: "MATCH PAUSED" },
  { type: "MATCH_RESUMED", label: "MATCH RESUMED" },
  { type: "MATCH_COMPLETED", label: "MATCH COMPLETED" },
  { type: "RESULT_PUBLISHED", label: "RESULT PUBLISHED" },
  { type: "NEXT_ROUND", label: "NEXT ROUND" },
  { type: "STREAM_RECONNECTING", label: "STREAM RECONNECTING" },
  { type: "TECHNICAL_DIFFICULTIES", label: "TECHNICAL DIFFICULTIES" },
  { type: "BROADCAST_ENDED", label: "BROADCAST ENDED" },
];

export default function AdminLiveControlPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const matches = useMatches(tid, false);
  const broadcast = useBroadcast(tid, false);
  const session = useAdminSession();
  const { toast } = useToast();

  const [state, setState] = useState<BroadcastState>("offline");
  const [message, setMessage] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [destination, setDestination] = useState<BroadcastDestination | "">("");
  const [stats, setStats] = useState<StreamStats | null>(null);
  const [quality, setQuality] = useState<SourceQuality | null>(null);
  const [bridge, setBridge] = useState<BridgeState | null>(null);
  const [whipProbe, setWhipProbe] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [confirmStop, setConfirmStop] = useState(false);
  const [annType, setAnnType] = useState<BroadcastEventType>("LIVE_NOW");
  const [annMsg, setAnnMsg] = useState("");
  const [annPreview, setAnnPreview] = useState(false);
  const [busy, setBusy] = useState(false);

  const publisherRef = useRef<StreamPublisher | null>(null);
  const p2pHostRef = useRef<P2PHost | null>(null);
  const [p2pViewers, setP2pViewers] = useState<P2PViewerInfo[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const whipUrl = broadcast.data?.whipUrl?.trim() ?? "";

  const isP2P = broadcast.data?.streamMode === "p2p";
  const p2pMax = clampP2pMaxViewers(broadcast.data?.p2pMaxViewers);

  const currentMatch = matches.data?.find((m) => m.isCurrent) ?? null;

  // Mesin status → tampilan + Firestore (realtime ke TV/viewer).
  const go = useCallback(async (next: BroadcastState, msg = "") => {
    setState(next);
    setMessage(msg);
    if (tid) {
      try {
        await setLiveState(tid, {
          state: next,
          source: source ?? undefined,
          destination: destination || undefined,
          startedAt: next === "live" ? Date.now() : undefined,
          endedAt: next === "offline" ? Date.now() : null,
          message: msg,
        });
      } catch { /* Firestore offline — status tetap lokal */ }
    }
  }, [tid, source, destination]);

  // Publisher callbacks
  useEffect(() => {
    const pub = new StreamPublisher({
      onState: (s, m) => { setState(s); setMessage(m ?? ""); if (tid) void setLiveState(tid, { state: s, message: m, source: source ?? undefined, destination: destination || undefined }).catch(() => {}); },
      onStats: (st) => setStats(st),
      onQuality: (q) => setQuality(q),
    });
    publisherRef.current = pub;
    return () => { void pub.stop(); publisherRef.current = null; };
  }, [tid]);

  // Host P2P (mode tanpa bridge) — event status/stats/daftar penonton.
  useEffect(() => {
    if (!tid) return;
    const host = new P2PHost(tid, {
      onState: (s, m) => { setState(s); setMessage(m ?? ""); void setLiveState(tid, { state: s, message: m, destination: destination || undefined }).catch(() => {}); },
      onStats: (st) => setStats(st),
      onViewers: (list) => setP2pViewers(list),
    });
    host.maxViewers = p2pMax;
    p2pHostRef.current = host;
    void cleanupStaleP2PSessions(tid); // buka Live Control → bersihkan sesi waiting/closed > 2 menit
    return () => { p2pHostRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tid]);

  // Sinkronkan batas penonton P2P dari pengaturan broadcast.
  useEffect(() => {
    if (p2pHostRef.current) p2pHostRef.current.maxViewers = p2pMax;
  }, [p2pMax]);

  // Bridge status (OBS + viewer count nyata)
  useEffect(() => {
    void autoConnectBridge();
    return subscribeBridge((s) => setBridge(s));
  }, []);
  useEffect(() => () => disconnectBridge(), []);

  // Unmount: hentikan track capture supaya lampu kamera/screen share mati.
  useEffect(() => () => {
    publisherRef.current?.localStream?.getTracks().forEach((t) => t.stop());
    p2pHostRef.current?.localStream?.getTracks().forEach((t) => t.stop());
  }, []);

  // Pasang stream ke elemen video preview
  useEffect(() => {
    const v = videoRef.current;
    const s = (isP2P ? p2pHostRef.current?.localStream : publisherRef.current?.localStream) ?? null;
    if (v && s && v.srcObject !== s) v.srcObject = s;
  });

  // ---------- Preflight checks (semua nyata) ----------
  const preflight = useMemo(() => {
    const items: { label: string; ok: boolean | null; note: string }[] = [
      { label: "Sumber video terpilih", ok: Boolean(source), note: source ?? "Belum ada capture — pilih jendela/layar" },
      { label: "Tujuan siaran dipilih", ok: Boolean(destination), note: destination ? `Kirim ke: ${destination.toUpperCase()}` : "Pilih LOCAL / PUBLIC / keduanya" },
      isP2P
        ? { label: "Signaling Firestore (P2P)", ok: tid ? true : false, note: tid ? "Firestore siap — tanpa bridge/MediaMTX/OBS" : "Tidak ada turnamen aktif" }
        : { label: "Endpoint WHIP tersedia", ok: whipProbe === "ok" ? true : whipProbe === "fail" ? false : null, note: whipUrl || "Atur WHIP URL di Broadcast (gateway lokal / MediaMTX)" },
      { label: "Database realtime", ok: tid ? true : false, note: tid ? `Turnamen ${tid}` : "Tidak ada turnamen aktif" },
      { label: "Match current", ok: Boolean(currentMatch), note: currentMatch ? `Match ${currentMatch.matchNumber} — ${currentMatch.map}` : "Set match current agar TV tahu ronde" },
      { label: "OBS (opsional)", ok: bridge?.connected ? Boolean(bridge.obsConnected) : null, note: bridge?.obsConnected ? `OBS v${bridge.obsVersion ?? "?"}` : "Tidak wajib — mode tanpa OBS didukung" },
    ];
    return items;
  }, [source, destination, whipProbe, whipUrl, tid, currentMatch, bridge, isP2P]);
  const preflightOk = preflight.every((p) => p.ok !== false) && Boolean(source) && Boolean(destination) && (isP2P ? Boolean(tid) : Boolean(whipUrl));

  // ---------- Aksi kontrol ----------
  async function pickSource(kind: "window" | "monitor") {
    try {
      setBusy(true);
      const { stream, source: info } = await captureSource({ selfBrowserSurface: "exclude", p2p: isP2P });
      if (isP2P) p2pHostRef.current?.attach(stream);
      else publisherRef.current?.attach(stream);
      setSource(`${kind === "window" ? "Window" : "Fullscreen"}: ${info.label}`);
      toast({ title: "Sumber video siap", description: info.label });
      if (state !== "live") await go("ready", "Sumber video ditangkap");
      // Sinkronkan preview
      const v = videoRef.current;
      if (v) v.srcObject = stream;
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setSource(null);
        if (state === "live") void go("reconnecting", "Sumber berhenti dibagikan");
      });
    } catch (e) {
      toast({ title: "Capture dibatalkan", description: e instanceof Error ? e.message : String(e), variant: "destructive" as never });
    } finally {
      setBusy(false);
    }
  }

  function useObsAsSource() {
    if (!bridge?.obsConnected) {
      toast({ title: "OBS belum tersambung", description: "Jalankan broadcast-bridge di laptop lalu Connect OBS.", variant: "destructive" as never });
      return;
    }
    setSource("OBS Studio output");
    if (state === "offline") void go("ready", "Sumber dari OBS Studio");
  }

  async function probeWhip() {
    if (!whipUrl) { setWhipProbe("fail"); return; }
    setWhipProbe("testing");
    try {
      await fetch(whipUrl, { method: "OPTIONS", mode: "no-cors", signal: AbortSignal.timeout(3500) });
      setWhipProbe("ok");
    } catch {
      setWhipProbe("fail");
    }
  }

  // Isi WHIP default gateway lokal & simpan ke Firestore (merge) — valid di laptop bridge.
  async function quickSetWhip() {
    if (!tid || !db) return;
    const path = bridge?.bootstrap?.mediamtxPath ?? "bof-main";
    const whip = `http://127.0.0.1:8080/mediamtx/${path}/whip`;
    try {
      await setDoc(doc(db, `broadcastSettings/${tid}`), { whipUrl: whip, tournamentId: tid, updatedAt: serverTimestamp() }, { merge: true });
      toast({ title: "WHIP tersimpan", description: `${whip} — jalankan MediaMTX (start-bridge.bat) lalu PREPARE lagi.` });
    } catch (e) {
      toast({ title: "Gagal menyimpan WHIP", description: String((e as Error).message ?? e), variant: "destructive" as never });
    }
  }

  async function prepare() {
    setBusy(true);
    await go("preparing", "Preflight check dijalankan…");
    if (isP2P) {
      await go("ready", "Preflight selesai — mode P2P aktif (tanpa WHIP/MediaMTX)");
    } else {
      await probeWhip();
      if (!whipUrl) {
        await go("ready", "Preflight selesai — WHIP belum diatur (atur di Broadcast dulu)");
        toast({ title: "WHIP URL belum diatur", description: "Isi WHIP URL di menu Broadcast sebelum START LIVE.", variant: "destructive" as never });
      } else {
        await go("ready", "Preflight selesai — siap START LIVE");
      }
    }
    await publishBroadcastEvent(tid ?? "", "LIVE_STARTING", { matchNumber: currentMatch?.matchNumber ?? null, map: currentMatch?.map ?? null }).catch(() => {});
    setBusy(false);
  }

  async function startLive() {
    if (!tid) return;
    const stream = (isP2P ? p2pHostRef.current?.localStream : publisherRef.current?.localStream) ?? null;
    if (!stream) { toast({ title: "Tidak ada sumber video", variant: "destructive" as never }); return; }
    if (!isP2P && !whipUrl) { toast({ title: "WHIP URL belum diatur", variant: "destructive" as never }); return; }
    setBusy(true);
    try {
      await go("starting", isP2P ? "Mengaktifkan signaling P2P…" : "Mengirim stream ke server siaran…");
      await publishBroadcastEvent(tid, "LIVE_STARTING", { matchNumber: currentMatch?.matchNumber ?? null, map: currentMatch?.map ?? null });
      if (isP2P) {
        await p2pHostRef.current!.publish(stream); // tidak butuh URL — signaling Firestore
      } else {
        await publisherRef.current!.publish(stream, whipUrl);
      }
      // status "live" ditetapkan callback onState saat koneksi benar-benar terhubung
      await publishBroadcastEvent(tid, "LIVE_NOW", { matchNumber: currentMatch?.matchNumber ?? null, map: currentMatch?.map ?? null });
      toast({ title: "Siaran berjalan", description: isP2P ? "Penonton di /live akan tersambung langsung ke laptop ini (maks " + p2pMax + ")." : "TV & halaman /live akan menampilkan gameplay otomatis." });
    } catch (e) {
      await go("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pauseLive() {
    if (isP2P) p2pHostRef.current?.pause();
    else publisherRef.current?.pause();
    await go("paused");
    await publishBroadcastEvent(tid ?? "", "MATCH_PAUSED").catch(() => {});
  }

  async function resumeLive() {
    if (isP2P) p2pHostRef.current?.resume();
    else publisherRef.current?.resume();
    await go("live");
    await publishBroadcastEvent(tid ?? "", "MATCH_RESUMED").catch(() => {});
  }

  async function reconnectLive() {
    if (isP2P) {
      setBusy(true);
      await go("reconnecting", "Menyalakan ulang signaling P2P…");
      await publishBroadcastEvent(tid ?? "", "STREAM_RECONNECTING").catch(() => {});
      const ok = await p2pHostRef.current?.reconnect();
      if (!ok) {
        await go("error", "Gagal pulih — gunakan RESTART SOURCE atau EMERGENCY SCREEN");
      }
      setBusy(false);
      return;
    }
    if (!whipUrl) return;
    setBusy(true);
    await go("reconnecting", "Pemulihan otomatis berjalan…");
    await publishBroadcastEvent(tid ?? "", "STREAM_RECONNECTING").catch(() => {});
    const ok = await publisherRef.current?.reconnect(whipUrl);
    if (!ok) {
      await go("error", "Gagal pulih — gunakan RESTART SOURCE atau EMERGENCY SCREEN");
    }
    setBusy(false);
  }

  async function stopLive() {
    setBusy(true);
    setConfirmStop(false);
    await go("stopping", "Mengakhiri siaran…");
    if (isP2P) await p2pHostRef.current?.stop(); // set p2pLive=false + hapus semua sesi signaling
    else await publisherRef.current?.stop();
    await go("offline", "");
    await publishBroadcastEvent(tid ?? "", "BROADCAST_ENDED").catch(() => {});
    toast({ title: "Siaran diakhiri" });
    setBusy(false);
  }

  async function sendAnnouncement() {
    if (!tid) return;
    await publishBroadcastEvent(tid, annType, { message: annMsg, matchNumber: currentMatch?.matchNumber ?? null, map: currentMatch?.map ?? null });
    toast({ title: `Pengumuman terkirim: ${annType}` });
    setAnnPreview(false);
  }

  // ---------- Render ----------
  const stateIdx = FLOW.indexOf(state);
  const canStart = state === "ready" && preflightOk;
  const isLive = state === "live";
  const p2pConnected = isP2P ? (p2pHostRef.current?.connectedCount ?? 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide">Live Control</h1>
          <p className="mt-1 max-w-2xl text-sm font-semibold text-fs-muted">
            Pusat kendali siaran: sumber gameplay → server lokal (MediaMTX) → TV & penonton.
            Status hanya berubah LIVE setelah koneksi benar-benar tersambung.
          </p>
        </div>
        <StateBadge state={state} />
      </div>

      {/* ================= A. Status siaran ================= */}
      <BoCard className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {FLOW.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span
                className={cn(
                  "border px-2 py-1 font-display text-[10px] font-bold uppercase tracking-[0.16em]",
                  s === state
                    ? s === "live" ? "border-fs-err bg-fs-err/15 text-fs-err fs-live-badge" : "border-fs-fire bg-fs-fire/15 text-fs-fire"
                    : "border-fs-edge text-fs-muted/60",
                )}
              >
                {s}
              </span>
              {i < FLOW.length - 1 ? <span className={cn("h-px w-3", i < stateIdx ? "bg-fs-fire" : "bg-fs-edge")} /> : null}
            </span>
          ))}
        </div>
        {message ? <p className="mt-2 text-xs font-semibold text-fs-gold">{message}</p> : null}
      </BoCard>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* ================= B. Sumber + preview ================= */}
        <BoCard className="p-4 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.16em]">
              <Camera className="h-4 w-4 text-fs-fire" /> Streaming Source
            </h2>
            <div className="flex flex-wrap gap-2">
              <BoButton variant="fire" className="!px-3 !py-1.5 !text-[11px]" disabled={busy} onClick={() => pickSource("window")}>
                <Monitor className="h-3.5 w-3.5" /> Capture Jendela Game
              </BoButton>
              <BoButton variant="white" className="!px-3 !py-1.5 !text-[11px]" disabled={busy} onClick={() => pickSource("monitor")}>
                <Tv className="h-3.5 w-3.5" /> Capture Layar Penuh
              </BoButton>
              <BoButton variant="cyan" className="!px-3 !py-1.5 !text-[11px]" onClick={useObsAsSource}>
                <Plug className="h-3.5 w-3.5" /> OBS Output
              </BoButton>
              {source ? (
                <BoButton variant="black" className="!px-3 !py-1.5 !text-[11px]" onClick={() => { publisherRef.current?.localStream?.getTracks().forEach((t) => t.stop()); setSource(null); }}>
                  <XCircle className="h-3.5 w-3.5" /> Lepas Sumber
                </BoButton>
              ) : null}
            </div>
          </div>

          {/* Preview 16:9 */}
          <div className="relative mt-3 aspect-video w-full overflow-hidden border border-fs-edge bg-black">
            <video ref={videoRef} data-stikar-preview className="h-full w-full object-contain" autoPlay muted playsInline />
            {!source ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                <Camera className="h-8 w-8 text-white/25" />
                <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-white/60">Belum Ada Sumber</p>
                <p className="max-w-sm text-[11px] text-white/45">
                  Pilih <strong>Capture Jendela Game</strong> lalu pilih jendela Free Fire (spectator mode).
                  Capture admin sendiri dikecualikan otomatis.
                </p>
              </div>
            ) : null}
            {source ? (
              <div className="absolute left-2 top-2 border border-fs-edge bg-black/70 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-fs-cyan">
                {source}
              </div>
            ) : null}
            {quality?.blackFrames ? (
              <div className="absolute bottom-2 left-2 flex items-center gap-1.5 border border-fs-err/60 bg-fs-err/20 px-2 py-1 text-[10px] font-bold uppercase text-fs-err">
                <AlertTriangle className="h-3 w-3" /> Layar hitam terdeteksi
              </div>
            ) : null}
            {quality?.frozenFrames && !quality.blackFrames ? (
              <div className="absolute bottom-2 left-2 flex items-center gap-1.5 border border-fs-gold/60 bg-fs-gold/15 px-2 py-1 text-[10px] font-bold uppercase text-fs-gold">
                <AlertTriangle className="h-3 w-3" /> Frame beku
              </div>
            ) : null}
          </div>

          {/* Info sumber */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat label="Resolusi" value={stats?.resolution ?? (source ? "menunggu…" : "N/A")} />
            <MiniStat label="Frame Rate" value={stats?.fps ? `${stats.fps} fps` : "N/A"} />
            <MiniStat label="Audio" value={publisherRef.current?.localStream?.getAudioTracks().some((t) => t.enabled) ? "aktif" : source ? "bisu" : "N/A"} />
            <MiniStat label="Frame Terakhir" value={quality?.lastFrameAt ? new Date(quality.lastFrameAt).toLocaleTimeString("id-ID") : "N/A"} />
          </div>
          <p className="mt-2 text-[11px] font-semibold text-fs-muted">
            Ingin meng-crop hanya area gameplay? Gunakan window capture (bukan full screen) agar UI desktop tidak ikut.
          </p>
        </BoCard>

        {/* ================= D. Preflight + E. Stats ================= */}
        <div className="space-y-4">
          <BoCard className="p-4">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.16em]">
              <CheckCircle2 className="h-4 w-4 text-fs-ok" /> Preflight Check
            </h2>
            <ul className="mt-3 space-y-2">
              {preflight.map((p) => (
                <li key={p.label} className="flex items-start gap-2 text-sm">
                  {p.ok === true ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-fs-ok" />
                    : p.ok === false ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-fs-err" />
                    : <CircleDot className="fs-connecting mt-0.5 h-4 w-4 shrink-0 text-fs-gold" />}
                  <span className="min-w-0">
                    <span className="font-bold">{p.label}</span>
                    <span className="block truncate text-[11px] font-semibold text-fs-muted">{p.note}</span>
                  </span>
                </li>
              ))}
            </ul>
            <BoButton variant="fire" className="mt-3 w-full" disabled={busy || Boolean(source) === false} onClick={prepare}>
              <Loader2 className={cn("h-4 w-4", busy && "animate-spin")} /> PREPARE BROADCAST
            </BoButton>

            {/* Mode P2P: tanpa WHIP — pengumuman singkat pengganti kotak WHIP */}
            {isP2P ? (
              <div className="mt-3 border border-fs-cyan/60 bg-fs-cyan/10 p-3">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-fs-cyan">
                  <Wifi className="h-3.5 w-3.5" /> Mode P2P — tanpa bridge, tanpa OBS, tanpa MediaMTX
                </p>
                <p className="mt-2 text-[11px] font-semibold leading-relaxed text-fs-muted">
                  Video dikirim langsung dari laptop ini ke maks {p2pMax} penonton via WebRTC.
                  Firestore hanya dipakai untuk signaling (butuh internet); video lewat jaringan lokal.
                  Laptop disarankan pakai <b className="text-fs-text">kabel LAN</b> agar upload Wi-Fi tidak jadi botol leher.
                </p>
              </div>
            ) : null}

            {/* WHIP belum diatur → panduan + isi otomatis (bukan sekadar pesan merah) */}
            {!whipUrl && !isP2P ? (
              <div className="mt-3 border border-fs-err/60 bg-fs-err/10 p-3">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-fs-err">
                  <AlertTriangle className="h-3.5 w-3.5" /> WHIP belum diatur — wajib sebelum START LIVE
                </p>
                <p className="mt-2 text-[11px] font-semibold leading-relaxed text-fs-muted">
                  WHIP = alamat server lokal tempat video dikirim (browser → MediaMTX → TV/HP). Caranya:
                  jalankan <code>start-bridge.bat</code> di laptop produksi, lalu tekan tombol di bawah
                  <b className="text-fs-text"> di browser laptop yang sama</b>.
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <BoButton variant="fire" className="!px-3 !py-2 !text-[11px]" disabled={!tid} onClick={() => void quickSetWhip()}>
                    <Plug className="h-3.5 w-3.5" /> Isi otomatis (gateway laptop ini: 127.0.0.1:8080)
                  </BoButton>
                  <a href="/admin/broadcast" className="text-[11px] font-black uppercase tracking-wider text-fs-cyan underline">
                    Buka Broadcast →
                  </a>
                </div>
              </div>
            ) : null}
          </BoCard>

          <BoCard className="p-4">
            <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-fs-cyan">Streaming Stats</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniStat label="Stream Source" value={source ?? "N/A"} />
              <MiniStat label="Stream Output" value={isP2P ? (isLive ? "P2P → penonton" : "P2P (siap)") : isLive ? "WHIP → MediaMTX" : state === "connecting" || state === "starting" ? "menyambung…" : "N/A"} />
              <MiniStat label="Viewers" value={isP2P ? (isLive ? `${p2pConnected}/${p2pMax}` : "0") : isLive && bridge?.connected ? String(bridge.viewers ?? 0) : "N/A"} />
              <MiniStat label="Bitrate" value={stats?.bitrateKbps ? `${stats.bitrateKbps} kbps` : "N/A"} />
              <MiniStat label="Frame Rate" value={stats?.fps ? `${stats.fps} fps` : "N/A"} />
              <MiniStat label="Resolusi" value={stats?.resolution ?? "N/A"} />
              <MiniStat label="Latency" value={isLive ? (isP2P ? "~0.2–1s (P2P)" : "~0.5–2s (WebRTC)") : "N/A"} />
              <MiniStat label="Frames Sent" value={stats?.framesSent != null ? String(stats.framesSent) : "N/A"} />
            </div>
          </BoCard>

          {/* Penonton P2P: slot terhubung/menunggu/ditolak */}
          {isP2P ? (
            <BoCard className="p-4">
              <h2 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-fs-gold">Penonton P2P (maks {p2pMax})</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <MiniStat label="Terhubung" value={`${p2pConnected}/${p2pMax}`} />
                <MiniStat label="Menunggu" value={String(p2pViewers.filter((v) => v.state === "answered" || v.state === "waiting").length)} />
                <MiniStat label="Ditolak (slot penuh)" value={String(p2pViewers.filter((v) => v.state === "rejected").length)} />
                <MiniStat label="Total sesi" value={String(p2pViewers.length)} />
              </div>
              {p2pViewers.length ? (
                <ul className="thin-scroll mt-3 max-h-40 space-y-1.5 overflow-y-auto">
                  {p2pViewers.map((v) => (
                    <li key={v.viewerId} className="flex items-center justify-between gap-2 border border-fs-edge bg-fs-bg/60 px-2 py-1.5 text-xs font-bold">
                      <span className="truncate font-mono text-[10px] text-fs-muted" title={v.viewerId}>{v.viewerId.slice(0, 8)}…</span>
                      <span className={cn(
                        "border px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-wider",
                        v.state === "connected" ? "border-fs-ok bg-fs-ok/15 text-fs-ok"
                          : v.state === "rejected" ? "border-fs-err bg-fs-err/15 text-fs-err"
                          : "border-fs-gold bg-fs-gold/15 text-fs-gold",
                      )}>
                        {v.state === "connected" ? "terhubung"
                          : v.state === "rejected" ? "ditolak"
                          : v.state === "closed" ? "ditutup"
                          : v.state === "answered" ? "tersambung"
                          : "menunggu"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[11px] font-semibold text-fs-muted">
                  Belum ada penonton — bagikan link <code>/live</code> atau QR di menu Broadcast. Slot terisi otomatis saat penonton membuka halaman.
                </p>
              )}
              <p className="mt-2 text-[11px] font-semibold text-fs-muted">
                Setiap penonton = 1 aliran upload (±3,5 Mbps). Melebihi slot → ditolak otomatis dengan pesan yang jelas.
              </p>
            </BoCard>
          ) : null}
        </div>
      </div>

      {/* ================= C. Tujuan + E2. Kontrol utama ================= */}
      <BoCard className="p-4">
        <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.16em]">
          <Send className="h-4 w-4 text-fs-fire" /> Streaming Destination
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {([
            { id: "local", title: "LOCAL NETWORK", note: "TV & HP di Wi-Fi/hotspot yang sama — tanpa internet" },
            { id: "public", title: "PUBLIC INTERNET", note: "Penonton lewat domain website (YouTube/HLS publik)" },
            { id: "local+public", title: "LOCAL + PUBLIC", note: "Keduanya — butuh bandwidth memadai" },
          ] as { id: BroadcastDestination; title: string; note: string }[]).map((d) => (
            <button
              key={d.id}
              onClick={() => setDestination(d.id)}
              className={cn(
                "border p-3 text-left transition",
                destination === d.id ? "border-fs-fire bg-fs-fire/10" : "border-fs-edge bg-fs-bg/60 hover:border-fs-edge-strong",
              )}
            >
              <p className={cn("font-display text-sm font-black tracking-wider", destination === d.id ? "text-fs-fire" : "text-fs-text")}>{d.title}</p>
              <p className="mt-1 text-[11px] font-semibold text-fs-muted">{d.note}</p>
            </button>
          ))}
        </div>

        {/* Kontrol utama */}
        <div className="mt-4 flex flex-wrap gap-2">
          <BoButton variant="fire" className="!px-5 !py-3 text-sm" disabled={!canStart || busy} onClick={startLive}>
            <Play className="h-4 w-4 fill-current" /> START LIVE
          </BoButton>
          <BoButton variant="gold" className="!px-4 !py-3 text-sm" disabled={state !== "live"} onClick={pauseLive}>
            <Pause className="h-4 w-4" /> PAUSE
          </BoButton>
          <BoButton variant="cyan" className="!px-4 !py-3 text-sm" disabled={state !== "paused"} onClick={resumeLive}>
            <Volume2 className="h-4 w-4" /> RESUME
          </BoButton>
          <BoButton variant="white" className="!px-4 !py-3 text-sm" disabled={!["live", "reconnecting", "error"].includes(state)} onClick={reconnectLive}>
            <RotateCcw className="h-4 w-4" /> RECONNECT
          </BoButton>
          {confirmStop ? (
            <span className="flex items-center gap-2 border border-fs-err bg-fs-err/10 px-3">
              <span className="text-xs font-bold uppercase text-fs-err">Akhiri siaran sekarang?</span>
              <BoButton variant="danger" className="!px-3 !py-1.5 !text-[11px]" onClick={stopLive}>Ya, STOP</BoButton>
              <BoButton variant="white" className="!px-3 !py-1.5 !text-[11px]" onClick={() => setConfirmStop(false)}>Batal</BoButton>
            </span>
          ) : (
            <BoButton variant="danger" className="!px-4 !py-3 text-sm" disabled={state === "offline"} onClick={() => setConfirmStop(true)}>
              <Square className="h-4 w-4 fill-current" /> STOP LIVE
            </BoButton>
          )}
        </div>
        <p className="mt-2 text-[11px] font-semibold text-fs-muted">
          Alur resmi: pilih sumber → pilih tujuan → PREPARE (preflight) → START LIVE. Konfirmasi diminta untuk aksi yang menghentikan siaran.
        </p>
      </BoCard>

      {/* ================= Pengumuman + OBS ================= */}
      <div className="grid gap-4 lg:grid-cols-2">
        <BoCard className="p-4">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.16em]">
            <Send className="h-4 w-4 text-fs-gold" /> Broadcast Announcement
          </h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ANNOUNCEMENTS.map((a) => (
              <button
                key={a.type}
                onClick={() => { setAnnType(a.type); setAnnPreview(true); }}
                className={cn(
                  "border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition",
                  annType === a.type ? "border-fs-fire bg-fs-fire/15 text-fs-fire" : "border-fs-edge text-fs-muted hover:border-fs-flame hover:text-fs-text",
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
          {annPreview ? (
            <div className="mt-3">
              <input className="bo-input" placeholder="Pesan tambahan (opsional)…" value={annMsg} onChange={(e) => setAnnMsg(e.target.value)} />
              {/* Preview animasi yang akan tampil di TV */}
              <div className="mt-2 flex items-center justify-center border border-fs-edge bg-black px-4 py-6">
                <span className="fs-live-in font-display text-xl font-black uppercase tracking-[0.12em] text-fs-fire">
                  {annType.replaceAll("_", " ")}
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                <BoButton variant="fire" className="flex-1" onClick={sendAnnouncement}>Kirim ke TV</BoButton>
                <BoButton variant="white" onClick={() => setAnnPreview(false)}>Cancel</BoButton>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[11px] font-semibold text-fs-muted">Pilih jenis pengumuman → preview → kirim. TV menampilkan animasinya secara realtime.</p>
          )}
        </BoCard>

        <BoCard className="p-4">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.16em]">
            <Plug className="h-4 w-4 text-fs-cyan" /> OBS Studio
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat label="Bridge" value={bridge?.connected ? "tersambung" : "N/A"} />
            <MiniStat label="OBS" value={bridge?.obsConnected ? `v${bridge.obsVersion ?? "?"}` : "tidak tersambung"} />
            <MiniStat label="Scene" value={bridge?.currentScene ?? "N/A"} />
            <MiniStat label="Output" value={bridge?.streaming ? "STREAMING" : bridge?.connected ? "idle" : "N/A"} />
          </div>
          {bridge?.obsConnected && bridge.scenes?.length ? (
            <div className="thin-scroll mt-3 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {bridge.scenes.map((s) => (
                <button
                  key={s}
                  onClick={() => sendBridgeCommand("switchScene", { scene: s })}
                  className={cn(
                    "border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition",
                    s === bridge.currentScene ? "border-fs-cyan bg-fs-cyan/15 text-fs-cyan" : "border-fs-edge text-fs-muted hover:text-fs-text",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] font-semibold text-fs-muted">
              Jalankan <code>broadcast-bridge</code> di laptop + aktifkan OBS WebSocket (Tools → WebSocket Server Settings) untuk mengendalikan OBS dari sini.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <BoButton variant="cyan" className="!px-3 !py-1.5 !text-[11px]" disabled={!bridge?.obsConnected} onClick={() => sendBridgeCommand("startStreaming")}>Start Output</BoButton>
            <BoButton variant="white" className="!px-3 !py-1.5 !text-[11px]" disabled={!bridge?.obsConnected} onClick={() => sendBridgeCommand("stopStreaming")}>Stop Output</BoButton>
          </div>
        </BoCard>
      </div>

      {/* Match aktif */}
      <BoCard className="p-4">
        <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.16em]">
          <ListVideo className="h-4 w-4 text-fs-flame" /> Match Aktif
        </h2>
        {currentMatch ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold">
            Match {currentMatch.matchNumber} — {currentMatch.map}
            <BoBadge className="bg-fs-err text-white">LIVE</BoBadge>
            <span className="text-xs font-semibold text-fs-muted">format {currentMatch.format}</span>
          </p>
        ) : (
          <p className="mt-2 text-sm font-semibold text-fs-muted">
            Tidak ada match current — set di daftar Match agar header TV menampilkan ronde & map yang benar.
          </p>
        )}
      </BoCard>
    </div>
  );
}

function StateBadge({ state }: { state: BroadcastState }) {
  const cls =
    state === "live" ? "border-fs-err bg-fs-err/15 text-fs-err fs-live-badge"
      : state === "offline" ? "border-fs-edge text-fs-muted"
      : state === "error" ? "border-fs-err text-fs-err"
      : "border-fs-fire text-fs-fire";
  return (
    <span className={cn("inline-flex items-center gap-2 border px-3 py-1.5 font-display text-sm font-black uppercase tracking-[0.2em]", cls)}>
      {state === "live" ? <span className="inline-block h-2 w-2 rounded-full bg-fs-err" /> : <RefreshCw className={cn("h-3.5 w-3.5", state !== "offline" && "animate-spin")} />}
      {state}
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  const na = value === "N/A";
  return (
    <div className="border border-fs-edge bg-fs-bg/60 px-2.5 py-2">
      <p className="text-[9.5px] font-black uppercase tracking-[0.18em] text-fs-muted">{label}</p>
      <p className={cn("mt-0.5 truncate text-sm font-bold", na ? "text-fs-muted/60" : "text-fs-text")} title={value}>
        {value}
      </p>
    </div>
  );
}
