"use client";
// ============================================================
// /admin/broadcast — Broadcast Control Center
// Status bridge/gateway/MediaMTX LIVE (dari laptop ini ATAU perangkat lain
// via heartbeat), link penonton + QR otomatis, pairing penonton otomatis.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ban, Copy, Link2, Megaphone, MonitorPlay, Plug, PlugZap, QrCode, RefreshCw, Radio, Save, Settings2, Sparkles, Timer, Tv, Wifi, Zap,
} from "lucide-react";
import { BoBadge, BoButton, BoCard } from "@/components/common/bo";
import { parseYouTubeId } from "@/components/video/player";
import { MusicPanel, ObsGuideHint, PodiumPanel, PresencePanel, SfxPanel } from "@/components/admin/broadcast-extras";
import { useActiveTournament, useBroadcast, useMatches } from "@/services/firestore/hooks";
import { setCurrentMatch } from "@/services/scoring/publish";
import {
  autoConnectBridge, bootstrapBridge, buildStreamUrls, connectBridge, disconnectBridge, getBridgeToken, getBridgeUrl,
  sendBridgeCommand, setBridgeToken, setBridgeUrl, subscribeBridge, type BridgeState,
} from "@/services/broadcast/bridge";
import {
  useBridgeHeartbeat, useGatewayProbe, useQr, type GatewayProbe,
} from "@/services/broadcast/heartbeat";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { useAdminSession } from "@/services/auth/admin";
import { useToast } from "@/hooks/use-toast";
import type { BroadcastSettings, StreamMode } from "@/lib/types";

interface PairingInfo {
  code: string;
  expiresAt: number;
}

function Dot({ ok, unknown }: { ok: boolean | null; unknown?: boolean }) {
  const color = unknown || ok === null ? "bg-zinc-500" : ok ? "bg-emerald-400" : "bg-red-500";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

/** Petunjuk langsung di bawah input YouTube: ID terdeteksi / peringatan tautan tak dikenali. */
function YtIdHint({ raw }: { raw: string }) {
  const s = raw.trim();
  if (!s) {
    return (
      <p className="text-[11px] font-semibold leading-relaxed text-fs-text/50">
        Boleh tempel URL langsung: youtube.com/watch?v=…, youtu.be/…, youtube.com/live/…, /shorts/… —
        atau ID video 11 karakter. ID otomatis diekstrak saat disimpan.
      </p>
    );
  }
  const parsed = parseYouTubeId(s);
  if (parsed === s) return null;
  return parsed ? (
    <p className="text-[11px] font-bold text-fs-ok">
      ID terdeteksi: <span className="font-mono">{parsed}</span> — otomatis disimpan sebagai ID.
    </p>
  ) : (
    <p className="text-[11px] font-bold text-fs-err">
      Tautan tidak dikenali. Pakai URL watch?v=… / youtu.be/… / /live/… / /shorts/… atau ID video 11 karakter.
    </p>
  );
}

function StatusRow({ label, ok, unknown, detail }: { label: string; ok: boolean | null; unknown?: boolean; detail?: string | null }) {
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm font-bold">
      <Dot ok={ok} unknown={unknown} /> {label}:
      <BoBadge className={unknown || ok === null ? "bg-zinc-600 text-white" : ok ? "bg-emerald-300" : "bg-zb-yellow"}>
        {unknown || ok === null ? "TIDAK DIKETAHUI" : ok ? "BERJALAN" : "TIDAK AKTIF"}
      </BoBadge>
      {detail ? <span className="text-xs font-semibold text-fs-text/50">{detail}</span> : null}
    </li>
  );
}

function QrImg({ src, caption }: { src: string | null; caption: string }) {
  if (!src) return null;
  return (
    <div className="flex flex-col items-center gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={caption} className="h-[150px] w-[150px] rounded-md border border-fs-edge bg-white p-1" />
      <span className="text-[10px] font-black uppercase tracking-wider text-fs-text/50">{caption}</span>
    </div>
  );
}

export default function AdminBroadcastPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const broadcast = useBroadcast(tid, false);
  const matches = useMatches(tid, false);
  const session = useAdminSession();
  const { toast } = useToast();

  const [bridge, setBridge] = useState<BridgeState>({ connected: false, obsConnected: false });
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [settings, setSettings] = useState<Partial<BroadcastSettings>>({});
  const [busy, setBusy] = useState(false);
  const [chosenIp, setChosenIp] = useState<string | null>(null);
  const [autoFill, setAutoFill] = useState(true);
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const lastAutoSaved = useRef<string>("");
  const lastAutoPaired = useRef<string>("");
  // --- Panggung TV & Countdown (kendali presentasi realtime) ---
  const [cdMin, setCdMin] = useState(5);
  const [cdSec, setCdSec] = useState(0);
  const [cdLabel, setCdLabel] = useState("Menuju Siaran Dimulai");
  const [sgDelay, setSgDelay] = useState(30);
  const [sgLabel, setSgLabel] = useState("");
  const [quickAnn, setQuickAnn] = useState("");
  const [stageNow, setStageNow] = useState(() => Date.now());

  useEffect(() => {
    setUrl(getBridgeUrl());
    setToken(getBridgeToken());
    try { if (localStorage.getItem("stikar.broadcast.autofill") === "off") setAutoFill(false); } catch { /* abaikan */ }
    return subscribeBridge((s) => {
      setBridge(s);
      // Hasil deteksi otomatis: tampilkan URL & token yang dipakai.
      if (s.bootstrap) {
        setUrl(getBridgeUrl());
        setToken(getBridgeToken());
      }
    });
  }, []);

  useEffect(() => {
    if (broadcast.data) setSettings(broadcast.data);
  }, [broadcast.data]);

  // Jam panggung untuk preview sisa countdown/sekuens di panel admin.
  useEffect(() => {
    const t = setInterval(() => setStageNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    void autoConnectBridge();
    return () => disconnectBridge();
  }, []);

  // ---------- Status live ----------
  const heartbeat = useBridgeHeartbeat(tid ?? "bof-main");
  const probe: GatewayProbe | null = useGatewayProbe(8080, 6000);

  // Data heartbeat HANYA dipakai kalau MASIH SEGAR (<90 dtk). Data lama (bridge mati /
  // IP berubah) tidak boleh jadi dasar link penonton — sebelumnya IP lama yang tidak
  // terjangkau ikut dipakai sehingga TV/HP gagal membuka halaman siaran (timeout).
  const hbIp = heartbeat.fresh ? heartbeat.data?.lanIp ?? null : null;
  const hbPort = heartbeat.fresh ? heartbeat.data?.gatewayPort ?? null : null;
  const hbMediamtx = heartbeat.fresh ? heartbeat.data?.mediamtxUp ?? null : null;
  const detectedIp = chosenIp ?? bridge.lanIp ?? hbIp ?? null;
  const gwPort = bridge.gatewayPort ?? bridge.bootstrap?.gatewayPort ?? hbPort ?? 8080;
  const streamPath = bridge.bootstrap?.mediamtxPath ?? "bof-main";
  const suggested = detectedIp ? buildStreamUrls(detectedIp, gwPort, streamPath) : null;
  const hbStale = Boolean(heartbeat.data && !heartbeat.fresh);

  // Di laptop bridge? (probe localhost berhasil, atau bootstrap terbaca, atau WS tersambung)
  const onLaptop = Boolean(probe?.ok || bridge.bootstrap || bridge.connected);
  // Gateway berjalan menurut sumber manapun:
  const gatewayRunning = Boolean(
    probe?.ok || (heartbeat.fresh && heartbeat.data?.gatewayUp) || bridge.connected,
  );
  const mediamtxUp = probe?.data?.mediamtx ?? hbMediamtx ?? bridge.mediamtx ?? null;
  const obsUp = bridge.connected ? bridge.obsConnected : (heartbeat.fresh ? heartbeat.data?.obsConnected : null);
  const viewerCount = bridge.viewers ?? (heartbeat.fresh ? heartbeat.data?.viewers : null);

  // ---------- Preview panggung (countdown & sekuens mulai game) ----------
  const cdActive = settings.countdown?.active === true && typeof settings.countdown?.endsAt === "number";
  const cdRemainingMs = cdActive ? Math.max(0, (settings.countdown!.endsAt as number) - stageNow) : 0;
  const seqActive = settings.startSequence?.active === true && typeof settings.startSequence?.triggerAt === "number";
  const seqRemainingMs = seqActive
    ? Math.max(0, (settings.startSequence!.triggerAt as number) + (settings.startSequence!.delaySeconds ?? 0) * 1000 - stageNow)
    : 0;
  function fmtStage(ms: number) {
    const s = Math.ceil(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  }

  // ---------- AUTO NEXT MATCH (dari data Match admin) ----------
  const sortedMatches = useMemo(
    () => [...(matches.data ?? [])].sort((a, b) => a.matchNumber - b.matchNumber),
    [matches.data],
  );
  const currentMatchDoc = sortedMatches.find((m) => m.isCurrent) ?? null;
  const nextMatch = useMemo(() => {
    const usable = sortedMatches.filter((m) => m.status !== "completed" && m.status !== "cancelled");
    if (!currentMatchDoc) return usable[0] ?? null;
    return usable.find((m) => m.matchNumber > currentMatchDoc.matchNumber) ?? null;
  }, [sortedMatches, currentMatchDoc]);

  // Label sekuens otomatis mengikuti match berikutnya (bila panitia tidak mengubah manual).
  const sgLabelTouched = useRef(false);
  useEffect(() => {
    if (sgLabelTouched.current || !nextMatch) return;
    setSgLabel(`MATCH ${nextMatch.matchNumber} · ${nextMatch.map}`);
  }, [nextMatch?.id, nextMatch?.matchNumber, nextMatch?.map]);

  // Saat sekuens mulai game SELESAI (delay habis) + toggle aktif →
  // match berikutnya otomatis menjadi match berjalan — TV & /live berganti
  // "MATCH 2 · KALAHARI" realtime (onSnapshot), tanpa menyentuh apa pun.
  const lastAutoAdvance = useRef("");
  const seqDone = seqActive && seqRemainingMs <= 0;
  useEffect(() => {
    if (!settings.autoNextMatch || !seqDone || !tid) return;
    const trigAt = settings.startSequence?.triggerAt ?? 0;
    if (!trigAt) return;
    const key = String(trigAt);
    if (lastAutoAdvance.current === key) return;
    lastAutoAdvance.current = key;
    if (!nextMatch) {
      toast({ title: "Auto-next match: tidak ada match berikutnya", description: "Buat match lanjutan di Admin → Match." });
      return;
    }
    void (async () => {
      try {
        await setCurrentMatch(tid, nextMatch.id, { uid: session.user!.uid, email: session.user!.email ?? "" });
        toast({
          title: `Otomatis lanjut ke Match ${nextMatch.matchNumber} · ${nextMatch.map}`,
          description: "Semua TV & /live berganti match secara realtime.",
        });
      } catch (e) {
        toast({ title: "Gagal pindah match otomatis", description: String((e as Error).message ?? e), variant: "destructive" });
      }
    })();
  }, [seqDone, settings.autoNextMatch, settings.startSequence?.triggerAt, nextMatch?.id, nextMatch?.matchNumber, nextMatch?.map, tid]);

  // ---------- Pairing otomatis (hanya di laptop bridge — token hanya lewat bootstrap loopback) ----------
  useEffect(() => {
    if (!gatewayRunning || !onLaptop) return;
    const t = getBridgeToken();
    if (!t || pairing) return;
    const key = `${gwPort}|${t.slice(0, 8)}`;
    if (lastAutoPaired.current === key) return;
    lastAutoPaired.current = key;
    void (async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${gwPort}/api/pairing`, {
          method: "POST",
          headers: { Authorization: `Bearer ${t}` },
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return;
        const j = (await res.json()) as { code?: string; expiresAt?: number };
        if (j.code && j.expiresAt) setPairing({ code: j.code, expiresAt: j.expiresAt });
      } catch { /* gateway tidak terjangkau — abaikan */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayRunning, onLaptop, gwPort, pairing]);

  // Countdown umur kode pairing (re-render tiap detik saat pairing ada)
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    if (!pairing) return;
    const iv = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [pairing]);

  const displayUrl = suggested?.displayUrl ?? null;
  // TV: link + QR selalu memakai ?fs=1 → halaman display langsung masuk layar penuh.
  const displayUrlFs = displayUrl ? `${displayUrl}${displayUrl.includes("?") ? "&" : "?"}fs=1` : null;
  const liveUrl = suggested?.liveUrl ?? null;
  const pairUrl = liveUrl && pairing ? `${liveUrl}?pair=${pairing.code}` : null;
  const displayQr = useQr(displayUrlFs);
  const liveQr = useQr(liveUrl);
  const pairQr = useQr(pairUrl);

  // ---------- Deteksi jaringan otomatis (isi & simpan URL stream) ----------
  async function applyDetected(opts: { forceMode?: boolean; silent?: boolean } = {}) {
    if (!suggested || !tid || !db) return;
    const patch: Partial<BroadcastSettings> = {
      hlsUrl: suggested.hlsUrl,
      wheUrl: suggested.wheUrl,
      whipUrl: suggested.whipUrl,
      localGatewayUrl: suggested.localGatewayUrl,
      ...(opts.forceMode ? { streamMode: "mediamtx" as StreamMode } : {}),
    };
    setSettings((cur) => ({ ...cur, ...patch }));
    try {
      await setDoc(
        doc(db, `broadcastSettings/${tid}`),
        { ...patch, tournamentId: tid, updatedAt: serverTimestamp() },
        { merge: true },
      );
      if (!opts.silent) toast({ title: "URL siaran terisi otomatis", description: suggested.localGatewayUrl });
    } catch (e) {
      if (!opts.silent) toast({ title: "Gagal menyimpan", description: String((e as Error).message ?? e), variant: "destructive" });
    }
  }

  useEffect(() => {
    if (!autoFill || !suggested || !broadcast.data || broadcast.data.streamMode !== "mediamtx") return;
    const saved = broadcast.data;
    const same =
      saved.hlsUrl === suggested.hlsUrl && saved.wheUrl === suggested.wheUrl &&
      saved.whipUrl === suggested.whipUrl && saved.localGatewayUrl === suggested.localGatewayUrl;
    const key = `${suggested.localGatewayUrl}|${streamPath}`;
    if (same || lastAutoSaved.current === key) return;
    lastAutoSaved.current = key;
    void applyDetected({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFill, suggested?.localGatewayUrl, broadcast.data?.streamMode, broadcast.data?.hlsUrl, broadcast.data?.wheUrl, broadcast.data?.whipUrl, broadcast.data?.localGatewayUrl]);

  function toggleAutoFill(v: boolean) {
    setAutoFill(v);
    try { localStorage.setItem("stikar.broadcast.autofill", v ? "on" : "off"); } catch { /* abaikan */ }
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast({ title: "Disalin", description: text }); } catch { /* abaikan */ }
  }

  async function saveSettings() {
    if (!tid || !db) return;
    // YouTube: terima URL apa pun, simpan selalu sebagai ID video 11 karakter.
    const ytRaw = (settings.youtubeVideoId ?? "").trim();
    if ((settings.streamMode ?? "offline") === "youtube" && ytRaw && !parseYouTubeId(ytRaw)) {
      toast({
        title: "ID YouTube tidak dikenali",
        description: "Tempel URL youtube.com/watch?v=…, youtu.be/…, /live/… atau ID video 11 karakter.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      await setDoc(
        doc(db, `broadcastSettings/${tid}`),
        { ...settings, youtubeVideoId: parseYouTubeId(ytRaw), tournamentId: tid, updatedAt: serverTimestamp() },
        { merge: true },
      );
      toast({ title: "Pengaturan broadcast tersimpan" });
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: String((e as Error).message ?? e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  // ---------- Panggung TV & Countdown (tulis langsung — tanpa tombol Simpan) ----------
  async function patchSettings(patch: Partial<BroadcastSettings>, okMsg: string) {
    if (!tid || !db) return;
    try {
      await setDoc(
        doc(db, `broadcastSettings/${tid}`),
        { ...patch, tournamentId: tid, updatedAt: serverTimestamp() },
        { merge: true },
      );
      toast({ title: okMsg });
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: String((e as Error).message ?? e), variant: "destructive" });
    }
  }

  function startCountdown() {
    const totalSec = Math.max(5, cdMin * 60 + cdSec);
    void patchSettings(
      { countdown: { active: true, endsAt: Date.now() + totalSec * 1000, label: cdLabel.trim() || "MENUJU SIARAN DIMULAI" } },
      "Countdown dimulai — tampil realtime di TV & /live",
    );
  }
  function stopCountdown() {
    void patchSettings({ countdown: { active: false } }, "Countdown dihentikan");
  }
  function startGameSequence() {
    const delay = Math.min(600, Math.max(5, Math.floor(sgDelay) || 0));
    void patchSettings(
      { startSequence: { active: true, triggerAt: Date.now(), delaySeconds: delay, matchLabel: sgLabel.trim() || "MATCH BERIKUTNYA" } },
      `Sekuens mulai game ${delay}s dikirim — TV & /live mengikuti realtime`,
    );
  }
  function cancelGameSequence() {
    void patchSettings({ startSequence: { active: false } }, "Sekuens mulai game dibatalkan");
  }
  function pushAnnouncement() {
    const text = quickAnn.trim();
    if (!text) return;
    void patchSettings(
      { announcements: [text, ...(settings.announcements ?? [])].slice(0, 5) },
      "Pengumuman terkirim ke TV & /live",
    );
    setQuickAnn("");
  }
  function clearAnnouncements() {
    void patchSettings({ announcements: [] }, "Semua pengumuman dibersihkan");
  }

  async function revokePairing() {
    if (!pairing) return;
    const t = getBridgeToken();
    try {
      await fetch(`http://127.0.0.1:${gwPort}/api/pairing/${pairing.code}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${t}` },
        signal: AbortSignal.timeout(4000),
      });
    } catch { /* abaikan */ }
    setPairing(null);
    lastAutoPaired.current = ""; // boleh dibuat ulang
    toast({ title: "Kode pairing dicabut" });
  }

  const hbDetail = heartbeat.fresh && heartbeat.data
    ? `dilaporkan bridge ${heartbeat.ageSec}s lalu${heartbeat.data.lanIp ? ` · ${heartbeat.data.lanIp}:${heartbeat.data.gatewayPort ?? gwPort}` : ""}`
    : null;

  return (
    <div>
      <h1 className="font-display text-2xl font-black uppercase">Broadcast Control</h1>
      <p className="mt-1 text-sm font-semibold text-fs-text/60">
        Pusat produksi siaran — OBS, overlay, dan streaming. Kontrol hanya aktif saat service
        benar-benar terhubung.
      </p>

      {/* Status siaran lokal — live, dari laptop ini ATAU heartbeat dari perangkat mana pun */}
      <BoCard className="mt-4 bg-fs-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-base font-black uppercase">
            <Radio className="h-4 w-4" /> Status Siaran Lokal <span className="animate-pulse text-fs-cyan">●</span>
          </h2>
          <span className="text-[11px] font-bold uppercase tracking-wider text-fs-text/50">
            {onLaptop ? "Browser ini di LAPTOP BRIDGE" : "Browser ini bukan di laptop bridge — status via heartbeat"}
          </span>
        </div>
        <ul className="mt-3 space-y-2">
          <StatusRow label="Gateway (port & HTTP)" ok={gatewayRunning ? true : onLaptop && probe ? Boolean(probe?.ok) : null} unknown={!gatewayRunning && !onLaptop && !heartbeat.fresh && !bridge.connected} detail={probe?.ok ? `loopback ${probe.ms}ms · port ${gwPort}` : hbDetail} />
          <StatusRow label="MediaMTX (video stream)" ok={mediamtxUp === null ? null : Boolean(mediamtxUp)} unknown={mediamtxUp === null} detail={!mediamtxUp && gatewayRunning ? "menunggu publish — start bridge/OBS dulu" : null} />
          <StatusRow label="OBS Studio (kontrol scene)" ok={obsUp === null ? null : Boolean(obsUp)} unknown={obsUp === null} />
          <li className="flex flex-wrap items-center gap-2 text-sm font-bold">
            <Dot ok={gatewayRunning} /> Satu jaringan dengan bridge:
            <BoBadge className={gatewayRunning ? "bg-emerald-300" : "bg-zb-yellow"}>
              {gatewayRunning ? (onLaptop ? "YA — DI LAPTOP INI" : "YA — TERJANGKAU") : "BELUM TERDETEKSI"}
            </BoBadge>
            {!onLaptop && heartbeat.fresh ? (
              <span className="text-xs font-semibold text-fs-text/50">
                Browser HP memblokir probe http LAN — tes dengan buka link penonton di bawah.
              </span>
            ) : null}
          </li>
          {typeof viewerCount === "number" ? (
            <li className="flex flex-wrap items-center gap-2 text-sm font-bold">
              <Dot ok={viewerCount > 0} /> Perangkat penonton terhubung: <BoBadge className="bg-fs-cyan/15 text-fs-cyan">{viewerCount} NYATA</BoBadge>
            </li>
          ) : null}
        </ul>
        {hbStale ? (
          <div className="mt-3 border border-fs-gold/50 bg-fs-gold/10 px-4 py-3">
            <p className="text-sm font-bold text-fs-gold">
              Ada status LAMA ({Math.max(1, Math.round((heartbeat.ageSec ?? 0) / 60))} menit lalu · IP {heartbeat.data?.lanIp ?? "—"}).
              Bridge kemungkinan sudah mati atau IP berubah — link lama otomatis TIDAK dipakai lagi.
            </p>
            <p className="mt-1 text-xs font-semibold text-fs-text/60">
              Jalankan <code>start-bridge.bat</code> di laptop produksi. Saat bridge berjalan, status &amp; link baru
              muncul otomatis di sini dalam ±30–90 detik. Jangan buka link lama yang sudah kedaluwarsa.
            </p>
          </div>
        ) : null}
        {!heartbeat.data && !onLaptop ? (
          <p className="mt-3 text-xs font-semibold text-fs-text/50">
            Belum ada laporan heartbeat. Jalankan <code>start-bridge.bat</code> di laptop produksi —
            status akan muncul otomatis di sini (perangkat mana pun) dalam ±30 detik.
          </p>
        ) : null}
      </BoCard>

      {/* Jaringan terdeteksi otomatis + link penonton + QR */}
      <BoCard className="mt-4 bg-fs-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-base font-black uppercase">
            <Wifi className="h-4 w-4" /> Jaringan &amp; Link Penonton Otomatis
          </h2>
          <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider">
            <input type="checkbox" checked={autoFill} onChange={(e) => toggleAutoFill(e.target.checked)} />
            Isi URL stream otomatis
          </label>
        </div>
        {suggested ? (
          <>
            <ul className="mt-3 space-y-2 text-sm font-bold">
              <li className="flex flex-wrap items-center gap-2">
                IP laptop: <span className="font-stat text-fs-cyan">{detectedIp}</span>
                {bridge.bootstrap?.interface ? <span className="text-xs text-fs-text/50">({bridge.bootstrap.interface})</span> : null}
                <span className="text-xs text-fs-text/50">port {gwPort}</span>
              </li>
              <li className="flex flex-wrap items-center gap-2">
                Link TV (layar penuh otomatis): <code className="font-mono text-xs">{displayUrlFs}</code>
                <BoButton variant="white" className="!px-2 !py-1 !text-[11px]" onClick={() => displayUrlFs && void copy(displayUrlFs)}>
                  <Copy className="h-3 w-3" /> Salin
                </BoButton>
                <a href={displayUrlFs ?? "#"} target="_blank" rel="noreferrer" className="text-[11px] font-black uppercase tracking-wider text-fs-cyan underline">
                  Buka
                </a>
              </li>
              <li className="flex flex-wrap items-center gap-2">
                Link HP penonton: <code className="font-mono text-xs">{liveUrl}</code>
                <BoButton variant="white" className="!px-2 !py-1 !text-[11px]" onClick={() => liveUrl && void copy(liveUrl)}>
                  <Copy className="h-3 w-3" /> Salin
                </BoButton>
                <a href={liveUrl ?? "#"} target="_blank" rel="noreferrer" className="text-[11px] font-black uppercase tracking-wider text-fs-cyan underline">
                  Buka
                </a>
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap items-start gap-6">
              <QrImg src={displayQr} caption="QR — TV Display (langsung layar penuh)" />
              <QrImg src={liveQr} caption="QR — HP Penonton" />
              <div className="max-w-xs">
                <p className="text-[11px] font-semibold text-fs-text/50">
                  Scan QR dari HP/TV (satu Wi-Fi/hotspot dengan laptop) — halaman siaran langsung terbuka.
                  Link TV sudah memakai <code>?fs=1</code>: TV masuk layar penuh otomatis (kalau browser TV minta
                  sentuhan, satu ketukan langsung layar penuh). Semua link &amp; URL stream otomatis terisi ke pengaturan.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <BoButton variant="primary" className="!px-3 !py-2 !text-xs" disabled={!tid} onClick={() => void applyDetected({ forceMode: true })}>
                    <Wifi className="h-3.5 w-3.5" /> Pakai jaringan ini (isi &amp; simpan otomatis)
                  </BoButton>
                </div>
              </div>
            </div>
            {(bridge.bootstrap?.lanIps?.length ?? 0) > 1 ? (
              <label className="mt-3 block text-[11px] font-black uppercase tracking-wider">
                Beberapa jaringan ditemukan — pilih yang dipakai HP/TV penonton
                <select className="bo-input mt-1" value={detectedIp ?? ""} onChange={(e) => setChosenIp(e.target.value)}>
                  {bridge.bootstrap!.lanIps.map((i) => (
                    <option key={`${i.name}-${i.address}`} value={i.address}>
                      {i.address} — {i.name}{i.virtual ? " (virtual)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {!(settings.streamMode === "mediamtx") ? (
              <p className="mt-2 text-[11px] font-semibold text-fs-text/50">
                Mode stream belum MediaMTX — tombol di atas sekaligus mengaturnya.
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-3 text-sm font-semibold text-fs-text/60">
            {heartbeat.fresh && heartbeat.data?.lanIp ? (
              <>
                Bridge berjalan di <span className="font-stat text-fs-cyan">{heartbeat.data.lanIp}:{heartbeat.data.gatewayPort ?? 8080}</span>
                {" "}(laporan {heartbeat.ageSec}s lalu) — tapi halaman ini dibuka di perangkat lain.
                Untuk link + QR otomatis, buka halaman ini di browser laptop bridge sekali.
              </>
            ) : (
              <>
                Belum terdeteksi. Jalankan <code>start-bridge.bat</code> di laptop produksi, lalu buka halaman ini
                di <b>browser laptop yang sama</b> (Chrome bisa menampilkan izin &ldquo;akses jaringan lokal&rdquo; — pilih Izinkan).
                IP, token, dan URL stream akan terisi sendiri. Status lama (termasuk IP yang sudah tidak berlaku)
                otomatis diabaikan agar tidak ada link mati.
              </>
            )}
          </p>
        )}
      </BoCard>

      {/* Pairing penonton — otomatis */}
      <BoCard className="mt-4 bg-fs-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-base font-black uppercase">
            <Link2 className="h-4 w-4" /> Pairing Penonton <span className="text-[10px] font-bold text-fs-text/40">(otomatis)</span>
          </h2>
          {pairing ? (
            <BoButton variant="white" className="!px-2 !py-1 !text-[11px]" onClick={() => void revokePairing()}>
              Cabut kode
            </BoButton>
          ) : null}
        </div>
        {pairing ? (
          <div className="mt-3 flex flex-wrap items-center gap-6">
            <div className="flex flex-col items-center">
              <span className="font-stat text-4xl font-bold tracking-[0.3em] text-fs-gold">{pairing.code}</span>
              <span className="mt-1 text-[11px] font-bold uppercase tracking-wider text-fs-text/50">
                berlaku {Math.max(0, Math.floor((pairing.expiresAt - nowTick) / 1000))} detik
              </span>
            </div>
            <QrImg src={pairQr} caption="QR — Live + Pairing" />
            <p className="max-w-sm text-[11px] font-semibold text-fs-text/50">
              Penonton cukup scan QR ini (atau buka link live dengan <code>?pair={pairing.code}</code>) —
              halaman HP otomatis menukar kode menjadi status <b>PAIRED</b>. Tanpa mengetik apa pun.
              Menonton tetap terbuka walau kode kedaluwarsa.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm font-semibold text-fs-text/60">
            {onLaptop
              ? "Menunggu gateway berjalan — kode pairing dibuat otomatis begitu bridge aktif."
              : "Pairing dibuat di laptop bridge (token hanya lewat koneksi loopback — keamanan). Di laptop: buka halaman ini dan kode muncul sendiri."}
          </p>
        )}
      </BoCard>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Status OBS via bridge */}
        <BoCard className="bg-fs-panel p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-black uppercase">
            <MonitorPlay className="h-4 w-4" /> OBS (via Broadcast Bridge)
          </h2>
          <ul className="mt-3 space-y-2 text-sm font-bold">
            <li className="flex items-center gap-2">
              Bridge:
              <BoBadge className={bridge.connected ? "bg-emerald-300" : "bg-zb-yellow"}>
                {bridge.connected ? "TERHUBUNG" : "TIDAK TERHUBUNG"}
              </BoBadge>
            </li>
            <li className="flex items-center gap-2">
              OBS Studio:
              <BoBadge className={bridge.obsConnected ? "bg-emerald-300" : "bg-fs-panel"}>
                {bridge.obsConnected ? `TERHUBUNG ${bridge.obsVersion ?? ""}` : "TIDAK TERHUBUNG"}
              </BoBadge>
            </li>
            <li>Scene aktif: <span className="text-fs-fire">{bridge.currentScene ?? "—"}</span></li>
            {typeof bridge.viewers === "number" ? (
              <li>Perangkat gateway: <BoBadge className="bg-fs-cyan/15 text-fs-cyan">{bridge.viewers} NYATA</BoBadge></li>
            ) : null}
            <li>Stream output: <BoBadge className={bridge.streaming ? "bg-[#e5484d] text-white" : "bg-fs-panel"}>{bridge.streaming ? "ON AIR" : "OFF"}</BoBadge></li>
          </ul>
          {bridge.message ? <p className="mt-2 text-xs font-bold text-amber-700">{bridge.message}</p> : null}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] font-black uppercase tracking-wider">
              URL Bridge
              <input className="bo-input mt-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="ws://127.0.0.1:8078" />
            </label>
            <label className="text-[11px] font-black uppercase tracking-wider">
              Token Bridge
              <input className="bo-input mt-1" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="token dari .env bridge" />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <BoButton variant="black" className="!px-3 !py-2 !text-xs" onClick={async () => {
              disconnectBridge();
              const info = await bootstrapBridge();
              if (!info) { setBridgeUrl(url); setBridgeToken(token); } // bukan laptop bridge → pakai isian manual
              setUrl(getBridgeUrl());
              setToken(getBridgeToken());
              connectBridge();
            }}>
              <PlugZap className="h-3.5 w-3.5" /> Hubungkan Ulang
            </BoButton>
            <BoButton variant="white" className="!px-3 !py-2 !text-xs" disabled={!bridge.connected} onClick={() => sendBridgeCommand("getScenes")}>
              <RefreshCw className="h-3.5 w-3.5" /> Muat Scene
            </BoButton>
          </div>

          {bridge.connected && bridge.obsConnected && bridge.scenes?.length ? (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-black uppercase tracking-wider">Ganti Scene (whitelist)</p>
              <div className="flex flex-wrap gap-2">
                {bridge.scenes.map((s) => (
                  <BoButton
                    key={s}
                    variant={bridge.currentScene === s ? "black" : "cyan"}
                    className="!px-3 !py-1.5 !text-[11px]"
                    onClick={() => sendBridgeCommand("switchScene", { scene: s })}
                  >
                    {s}
                  </BoButton>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs font-semibold text-fs-text/50">
              Kontrol scene belum tersedia — jalankan <code>broadcast-bridge/</code> di laptop
              produksi (localhost only) lalu tekan Hubungkan Ulang. Panduan: documentation/OBS_SETUP.md
            </p>
          )}
        </BoCard>

        {/* Pengaturan stream */}
        <BoCard className="bg-fs-panel p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-black uppercase">
            <Tv className="h-4 w-4" /> Sumber Video Publik
          </h2>
          <div className="mt-3 space-y-3">
            <label className="block text-[11px] font-black uppercase tracking-wider">
              Mode Stream
              <select
                className="bo-input mt-1"
                value={settings.streamMode ?? "offline"}
                onChange={(e) => setSettings({ ...settings, streamMode: e.target.value as StreamMode })}
              >
                <option value="offline">Offline (belum menyiarkan)</option>
                <option value="youtube">YouTube Live (publik)</option>
                <option value="mediamtx">MediaMTX (LAN sekolah)</option>
                <option value="p2p">P2P (tanpa bridge, maks 2 penonton)</option>
              </select>
            </label>
            {(settings.streamMode ?? "offline") === "p2p" ? (
              <>
                <label className="block text-[11px] font-black uppercase tracking-wider">
                  Batas penonton P2P bersamaan (1-4)
                  <input
                    className="bo-input mt-1"
                    type="number"
                    min={1}
                    max={4}
                    value={settings.p2pMaxViewers ?? 2}
                    onChange={(e) => setSettings({ ...settings, p2pMaxViewers: Number(e.target.value) })}
                  />
                </label>
                <p className="border border-fs-cyan/50 bg-fs-cyan/10 p-3 text-[11px] font-semibold leading-relaxed text-fs-muted">
                  <b className="text-fs-cyan">P2P</b>: video dikirim LANGSUNG dari laptop panitia ke penonton via WebRTC —
                  tanpa broadcast-bridge, tanpa MediaMTX, tanpa OBS, tanpa install apa pun. Field URL HLS/WHE/WHIP
                  disembunyikan (memang tidak dipakai). Butuh <b>internet</b> untuk signaling (Firestore), video mengalir
                  lewat jaringan lokal — laptop disarankan pakai <b>kabel LAN</b>. Alur: Admin → Live Control → Capture →
                  START LIVE. Panduan: documentation/P2P_MODE.md.
                </p>
              </>
            ) : null}
            {(settings.streamMode ?? "offline") === "youtube" ? (
              <>
                <label className="block text-[11px] font-black uppercase tracking-wider">
                  YouTube — URL atau Video ID (bukan stream key!)
                  <input
                    className="bo-input mt-1"
                    value={settings.youtubeVideoId ?? ""}
                    onChange={(e) => setSettings({ ...settings, youtubeVideoId: e.target.value })}
                    placeholder="Tempel URL YouTube atau ID, mis. jfKfPfyJRdk"
                  />
                </label>
                <YtIdHint raw={settings.youtubeVideoId ?? ""} />
              </>
            ) : null}
            {(settings.streamMode ?? "offline") === "mediamtx" ? (
              <>
                <label className="block text-[11px] font-black uppercase tracking-wider">
                  URL HLS (LAN / publik)
                  <input className="bo-input mt-1" value={settings.hlsUrl ?? ""} onChange={(e) => setSettings({ ...settings, hlsUrl: e.target.value })} placeholder="http://IP-LAPTOP:8080/hls/bof-main/index.m3u8" />
                </label>
                <label className="block text-[11px] font-black uppercase tracking-wider">
                  URL WHE — WebRTC playback (latensi rendah)
                  <input className="bo-input mt-1 font-mono" value={settings.wheUrl ?? ""} onChange={(e) => setSettings({ ...settings, wheUrl: e.target.value })} placeholder="http://IP-LAPTOP:8080/mediamtx/bof-main/whe" />
                </label>
                <label className="block text-[11px] font-black uppercase tracking-wider">
                  URL WHIP — tujuan publish dari Live Control
                  <input className="bo-input mt-1 font-mono" value={settings.whipUrl ?? ""} onChange={(e) => setSettings({ ...settings, whipUrl: e.target.value })} placeholder="http://127.0.0.1:8080/mediamtx/bof-main/whip" />
                </label>
                <p className="text-[11px] font-semibold text-fs-text/50">
                  Alur resmi PHASE 2: capture browser (Live Control) → WHIP → MediaMTX → WHE/HLS ke TV & penonton.
                  Gateway lokal (port 8080) mem-proxy MediaMTX agar bebas masalah CORS. Port 8078 khusus WebSocket bridge.
                </p>
              </>
            ) : null}
            <label className="block text-[11px] font-black uppercase tracking-wider">
              Judul Stream
              <input className="bo-input mt-1" value={settings.streamTitle ?? ""} onChange={(e) => setSettings({ ...settings, streamTitle: e.target.value })} />
            </label>
            <label className="block text-[11px] font-black uppercase tracking-wider">
              Pengumuman (pisahkan dengan baris baru)
              <textarea
                className="bo-input h-24 py-2"
                value={(settings.announcements ?? []).join("\n")}
                onChange={(e) => setSettings({ ...settings, announcements: e.target.value.split("\n").filter(Boolean) })}
              />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <BoButton variant="primary" onClick={saveSettings} disabled={busy || !tid}>
              <Save className="h-4 w-4" /> {busy ? "Menyimpan…" : "Simpan Pengaturan"}
            </BoButton>
            <span className="text-[11px] font-bold uppercase tracking-wider text-fs-text/40">
              <Settings2 className="inline h-3.5 w-3.5" /> Kunci stream TIDAK disimpan di sini
            </span>
          </div>
        </BoCard>

        {/* ---------- PANGGUNG TV & COUNTDOWN — kendali presentasi realtime ---------- */}
        <BoCard className="bg-fs-panel p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-black uppercase">
            <Sparkles className="h-4 w-4" /> Panggung TV &amp; Countdown — kendali realtime
          </h2>
          <p className="mt-1 text-[11px] font-semibold text-fs-text/50">
            Semua tombol di kartu ini LANGSUNG tampil di TV (/display) dan halaman /live penonton — tanpa perlu
            menekan Simpan. Urutan scene presentasi lengkap ada di <code>/admin/presentation</code>.
          </p>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {/* Countdown besar */}
            <div className="border border-fs-edge bg-fs-bg p-4">
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-fs-gold">
                <Timer className="h-4 w-4" /> Countdown Besar
              </p>
              <label className="mt-3 block text-[11px] font-black uppercase tracking-wider">
                Label
                <input className="bo-input mt-1" value={cdLabel} onChange={(e) => setCdLabel(e.target.value)} placeholder="MENUJU SIARAN DIMULAI" />
              </label>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="block w-24 text-[11px] font-black uppercase tracking-wider">
                  Menit
                  <input className="bo-input mt-1" type="number" min={0} max={180} value={cdMin} onChange={(e) => setCdMin(Math.max(0, Number(e.target.value) || 0))} />
                </label>
                <label className="block w-24 text-[11px] font-black uppercase tracking-wider">
                  Detik
                  <input className="bo-input mt-1" type="number" min={0} max={59} value={cdSec} onChange={(e) => setCdSec(Math.min(59, Math.max(0, Number(e.target.value) || 0)))} />
                </label>
                {cdActive ? (
                  <BoButton variant="destructive" onClick={stopCountdown}>
                    <Ban className="h-4 w-4" /> Stop ({fmtStage(cdRemainingMs)})
                  </BoButton>
                ) : (
                  <BoButton variant="primary" onClick={startCountdown} disabled={!tid}>
                    <Timer className="h-4 w-4" /> Mulai Countdown
                  </BoButton>
                )}
              </div>
              {cdActive ? (
                <p className="mt-2 text-[11px] font-bold text-fs-ok">
                  BERJALAN — sisa {fmtStage(cdRemainingMs)} · label “{settings.countdown?.label}” tampil di TV &amp; /live.
                </p>
              ) : null}
            </div>

            {/* Sekuens mulai game */}
            <div className="border border-fs-edge bg-fs-bg p-4">
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-fs-cyan">
                <Zap className="h-4 w-4" /> Mulai Game (Delay Diatur)
              </p>
              <label className="mt-3 block text-[11px] font-black uppercase tracking-wider">
                Label match
                <input
                  className="bo-input mt-1"
                  value={sgLabel}
                  onChange={(e) => { setSgLabel(e.target.value); sgLabelTouched.current = true; }}
                  placeholder={nextMatch ? `MATCH ${nextMatch.matchNumber} · ${nextMatch.map}` : "MATCH 3 · BERLIN"}
                />
              </label>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="block w-28 text-[11px] font-black uppercase tracking-wider">
                  Delay (detik)
                  <input className="bo-input mt-1" type="number" min={5} max={600} value={sgDelay} onChange={(e) => setSgDelay(Number(e.target.value) || 0)} />
                </label>
                {seqActive ? (
                  <BoButton variant="destructive" onClick={cancelGameSequence}>
                    <Ban className="h-4 w-4" /> Batalkan ({fmtStage(seqRemainingMs)})
                  </BoButton>
                ) : (
                  <BoButton variant="cyan" onClick={startGameSequence} disabled={!tid}>
                    <Zap className="h-4 w-4" /> Mulai Sekarang
                  </BoButton>
                )}
              </div>
              <p className="mt-2 text-[11px] font-semibold leading-relaxed text-fs-text/50">
                TV &amp; /live menampilkan hitung mundur {Math.min(600, Math.max(5, Math.floor(sgDelay) || 0))} detik →
                angka raksasa 10…1 → burst GAME START. Cocok untuk sinkronisasi semua HP player sebelum match dimulai.
              </p>
              <label className="mt-3 flex items-start gap-2 border border-fs-cyan/35 bg-fs-cyan/5 p-2.5 text-xs font-bold">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-orange-500"
                  checked={settings.autoNextMatch === true}
                  onChange={(e) =>
                    void patchSettings(
                      { autoNextMatch: e.target.checked },
                      e.target.checked ? "AUTO-NEXT MATCH aktif — delay habis, match otomatis lanjut" : "Auto-next match dimatikan",
                    )
                  }
                />
                <span>
                  Otomatis pindah ke match berikutnya saat delay berakhir
                  <span className="mt-0.5 block text-[10px] font-semibold leading-relaxed text-fs-text/55">
                    {nextMatch
                      ? `Lanjut otomatis ke MATCH ${nextMatch.matchNumber} · ${nextMatch.map} (diambil dari Admin → Match) — TV & /live ikut berganti realtime.`
                      : "Belum ada match berikutnya — buat match lanjutan di Admin → Match."}
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Pengumuman cepat */}
          <div className="mt-4 border border-fs-edge bg-fs-bg p-4">
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-fs-flame">
              <Megaphone className="h-4 w-4" /> Kirim Pengumuman Realtime
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                className="bo-input min-w-0 flex-1"
                value={quickAnn}
                onChange={(e) => setQuickAnn(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") pushAnnouncement();
                }}
                placeholder="Tulis pengumuman… (mis. Match 3 check-in 10 menit lagi)"
              />
              <BoButton variant="primary" onClick={pushAnnouncement} disabled={!tid || !quickAnn.trim()}>
                <Megaphone className="h-4 w-4" /> Kirim
              </BoButton>
              <BoButton variant="white" onClick={clearAnnouncements} disabled={!tid || !(settings.announcements ?? []).length}>
                Bersihkan
              </BoButton>
            </div>
            {(settings.announcements ?? []).length ? (
              <ul className="mt-3 space-y-1.5">
                {(settings.announcements ?? []).map((a, i) => (
                  <li key={`${a}-${i}`} className="flex items-center gap-2 border border-fs-edge px-2.5 py-1.5 text-xs font-bold">
                    <span className="shrink-0 bg-fs-head px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white">
                      {i === 0 ? "Terbaru" : `#${i + 1}`}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{a}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[11px] font-semibold text-fs-text/40">Belum ada pengumuman aktif.</p>
            )}
          </div>

          {/* Toggle presentasi */}
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border border-fs-edge bg-fs-bg p-4">
            <label className="flex items-center gap-2 text-xs font-bold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-orange-500"
                checked={settings.presentation?.cleanYouTube !== false}
                onChange={(e) =>
                  void patchSettings(
                    { presentation: { ...(settings.presentation ?? {}), cleanYouTube: e.target.checked } },
                    e.target.checked ? "Judul YouTube disembunyikan" : "Judul YouTube ditampilkan",
                  )
                }
              />
              Sembunyikan judul &amp; nama channel YouTube (strip branding)
            </label>
            <label className="flex items-center gap-2 text-xs font-bold">
              <input
                type="checkbox"
                className="h-4 w-4 accent-orange-500"
                checked={settings.presentation?.effects !== false}
                onChange={(e) =>
                  void patchSettings(
                    { presentation: { ...(settings.presentation ?? {}), effects: e.target.checked } },
                    e.target.checked ? "Animasi & efek panggung aktif" : "Animasi & efek panggung dimatikan",
                  )
                }
              />
              Animasi &amp; efek panggung (countdown besar, burst GAME START)
            </label>
          </div>
        </BoCard>
      </div>

      {/* ---------- PENGAYA SIARAN: musik, SFX, penonton, panggung juara ---------- */}
      <h2 className="mt-6 font-display text-lg font-black uppercase tracking-wide text-fs-text/80">
        Pengaya Siaran — musik, sound effect &amp; penonton
      </h2>
      <p className="mt-1 text-sm font-semibold text-fs-text/60">
        Semua kartu di bawah berlaku REALTIME ke TV (/display), halaman /live, dan halaman interaktif penonton.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <MusicPanel tid={tid} settings={settings} patch={patchSettings} />
        <div className="flex flex-col gap-4">
          <SfxPanel tid={tid} settings={settings} patch={patchSettings} />
          <PodiumPanel tid={tid} settings={settings} patch={patchSettings} />
        </div>
        <PresencePanel tid={tid} />
        <ObsGuideHint />
      </div>
    </div>
  );
}
