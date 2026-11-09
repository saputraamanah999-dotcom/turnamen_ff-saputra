"use client";
// ============================================================
// /live/interactive — INTERACTIVE GAME VIEWER (Phase 3)
// Menonton gameplay Agent (WHEP/HLS via MediaMTX) + mengendalikan
// game dari HP: joystick virtual, tombol aksi, touch passthrough.
// Semua input lewat WebSocket Agent (token auth) — TIDAK lewat
// Firestore. Status ditampilkan JUJUR sesuai koneksi nyata.
// ============================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Gamepad2, GraduationCap, HelpCircle, Link2, PlugZap, ShieldAlert, SignalHigh, TriangleAlert, Users,
} from "lucide-react";
import { BoButton, BoCard } from "@/components/common/bo";
import { LiveVideoPlayer, type PlayerStatus } from "@/components/video/player";
import { ControlLayer } from "@/components/interactive/control-layer";
import {
  DEFAULT_LAYOUT, loadInteractiveLayout, saveInteractiveLayout,
  type InteractiveLayout,
} from "@/components/interactive/touch-map-editor";
import {
  AGENT_QUALITY_PRESETS, AgentInputChannel, gameStatusLabel, getAgentAdminToken, getAgentStatus,
  getAgentToken, normalizeAgentUrl, probeAgent, resolveAgentUrl, setAgentQuality, setAgentToken,
  setAgentUrl, type AgentInputInfo, type AgentStatus, type AgentQuality, type ChannelState,
} from "@/services/agent/client";
import type { BroadcastSettings } from "@/lib/types";
import { cn } from "@/lib/utils";

const POLL_MS = 3000;

function parseDevice(): { name: string; type: "phone" | "laptop" | "tv" | "other" } {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/Android/i.test(ua)) return { name: "Android · Interactive", type: "phone" };
  if (/iPhone|iPad|iPod/i.test(ua)) return { name: "iPhone/iPad · Interactive", type: "phone" };
  if (/TV|SmartTV|AppleTV/i.test(ua)) return { name: "TV · Interactive", type: "tv" };
  if (/Windows/i.test(ua)) return { name: "Windows · Interactive", type: "laptop" };
  if (/Macintosh/i.test(ua)) return { name: "Mac · Interactive", type: "laptop" };
  return { name: "Browser · Interactive", type: "other" };
}

function InteractiveInner() {
  const search = useSearchParams();
  const [urlInput, setUrlInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [agentUrl, setAgentUrlState] = useState("");
  const [connected, setConnected] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeMsg, setProbeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [channelState, setChannelState] = useState<ChannelState | null>(null);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>("idle");
  const [editorOpen, setEditorOpen] = useState(false);
  const [layout, setLayout] = useState<InteractiveLayout>(DEFAULT_LAYOUT);
  const [busyQuality, setBusyQuality] = useState<AgentQuality | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const channelRef = useRef<AgentInputChannel | null>(null);
  const wrapElRef = useRef<HTMLDivElement | null>(null);

  const setWrapEl = useCallback((el: HTMLDivElement | null) => {
    wrapElRef.current = el;
  }, []);

  const adminToken = typeof window === "undefined" ? "" : getAgentAdminToken();
  const adminRole = Boolean(adminToken);

  // ---------- Init: param ?agent= / ?token= → localStorage → state ----------
  // Bootstrap one-shot dari "sistem eksternal" (URL + localStorage) dijadwalkan
  // lewat callback timer agar tidak memicu cascading render sinkron.
  useEffect(() => {
    const t = setTimeout(() => {
      const qAgent = search.get("agent");
      const qToken = search.get("token");
      const url = resolveAgentUrl(qAgent);
      if (qAgent && normalizeAgentUrl(qAgent)) setAgentUrl(qAgent);
      if (qToken) setAgentToken(qToken);
      const token = qToken || getAgentToken();
      setUrlInput(url);
      setTokenInput(token);
      setAgentUrlState(url);
      setConnected(Boolean(url && token));
      setLayout(loadInteractiveLayout());
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // ---------- Poll status Agent (whepUrl, game, capture) ----------
  useEffect(() => {
    if (!connected || !agentUrl) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const st = await getAgentStatus(agentUrl, 5000);
        if (!cancelled) { setAgentStatus(st); setAgentError(null); }
      } catch (e) {
        if (!cancelled) setAgentError(e instanceof Error ? e.message : String(e));
      }
    };
    void tick();
    const t = setInterval(() => void tick(), POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [connected, agentUrl, refreshKey]);

  // ---------- Kanal input WebSocket ----------
  useEffect(() => {
    if (!connected || !agentUrl || !getAgentToken()) return;
    const ch = new AgentInputChannel(agentUrl, getAgentToken(), parseDevice(), adminRole ? "admin" : "viewer");
    ch.connect();
    channelRef.current = ch;
    const un = ch.onChange((s) => setChannelState({ ...s }));
    return () => { un(); ch.close(); channelRef.current = null; };
  }, [connected, agentUrl, adminRole]);

  // ---------- Handler input (diteruskan ke Agent) ----------
  const onJoystickMove = useCallback((x: number, y: number, active: boolean) => {
    channelRef.current?.sendJoy(x, y, active);
  }, []);
  const onTouchDown = useCallback((id: number, x: number, y: number) => channelRef.current?.sendTouch(id, "down", x, y), []);
  const onTouchMove = useCallback((id: number, x: number, y: number) => channelRef.current?.sendTouch(id, "move", x, y), []);
  const onTouchUp = useCallback((id: number, x: number, y: number) => channelRef.current?.sendTouch(id, "up", x, y), []);
  const onButtonDown = useCallback((key: string) => channelRef.current?.sendButton(key, "down"), []);
  const onButtonUp = useCallback((key: string) => channelRef.current?.sendButton(key, "up"), []);
  const onClaim = useCallback(() => channelRef.current?.claim(), []);
  const onRelease = useCallback(() => channelRef.current?.release(), []);
  const onEstop = useCallback(() => channelRef.current?.estop(), []);

  const onLayoutChange = useCallback((l: InteractiveLayout) => {
    setLayout(l);
    saveInteractiveLayout(l);
  }, []);

  // ---------- Setup: probe & simpan ----------
  async function connectSetup() {
    const clean = normalizeAgentUrl(urlInput);
    if (!clean) { setProbeMsg({ ok: false, text: "URL tidak valid — contoh: 192.168.1.10:8082" }); return; }
    setProbing(true);
    setProbeMsg(null);
    const res = await probeAgent(clean, 4000);
    setProbing(false);
    if (res.reachable) {
      setAgentUrl(clean);
      if (tokenInput.trim()) setAgentToken(tokenInput.trim());
      setAgentUrlState(clean);
      setProbeMsg({ ok: true, text: `Agent v${res.version ?? "?"} terjangkau — menyambungkan…` });
      setConnected(true);
    } else {
      setProbeMsg({ ok: false, text: res.error ?? "Agent tidak terjangkau" });
    }
  }

  function saveAndContinue() {
    const clean = normalizeAgentUrl(urlInput);
    if (!clean || !tokenInput.trim()) {
      setProbeMsg({ ok: false, text: "URL dan token wajib diisi untuk mode langsung." });
      return;
    }
    setAgentUrl(clean);
    setAgentToken(tokenInput.trim());
    setAgentUrlState(clean);
    setConnected(true);
  }

  async function changeQuality(q: AgentQuality) {
    if (!agentUrl || !adminToken) return;
    setBusyQuality(q);
    try {
      await setAgentQuality(agentUrl, adminToken, q);
      setRefreshKey((k) => k + 1);
    } catch { /* status poll berikutnya menunjukkan error nyata */ }
    setBusyQuality(null);
  }

  // ---------- Turunan UI ----------
  const input: AgentInputInfo | undefined = channelState?.server?.input ?? agentStatus?.input;
  const viewers = input?.viewers ?? null;
  const latency = channelState?.latencyMs ?? null;
  const chStatus = channelState?.status ?? "idle";
  const controller = Boolean(channelState?.controller);
  const inputEnabled = input?.enabled ?? true;

  const broadcast: BroadcastSettings | null = useMemo(() => (
    connected && agentUrl
      ? {
          tournamentId: "",
          streamMode: "mediamtx",
          showPublicTimeline: false,
          hlsUrl: agentStatus?.mediamtx.hlsUrl ?? undefined,
          streamTitle: "Interactive Stream · Agent Lokal",
        }
      : null
  ), [connected, agentUrl, agentStatus]);
  const whepUrl = agentStatus?.mediamtx.whepUrl ?? undefined;

  const waitingCapture = Boolean(agentStatus && agentStatus.ok && !agentStatus.capture.active);

  // ---------- Setup card (belum ada URL/token) ----------
  if (!connected) {
    return (
      <div className="fs-arena-bg flex min-h-screen items-center justify-center px-4 py-10">
        <BoCard className="fs-cut w-full max-w-lg p-6">
          <p className="bo-kicker">Interactive Stream</p>
          <h1 className="mt-3 font-display text-2xl font-black uppercase tracking-wide">
            Sambungkan Agent Game
          </h1>
          <p className="mt-2 text-sm font-semibold text-fs-muted">
            Halaman ini menampilkan gameplay dari komputer produksi lewat <b className="text-fs-text">STIKAR Broadcast
            Agent</b> dan (jika diizinkan operator) mengirim input joystick/tombol. URL + token didapat dari
            operator atau QR di panel admin.
          </p>

          <label className="mt-5 block text-xs font-black uppercase tracking-[0.18em] text-fs-muted">
            Alamat Agent (komputer game)
          </label>
          <input className="bo-input mt-1.5 font-mono" placeholder="192.168.1.10:8082"
            value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />

          <label className="mt-4 block text-xs font-black uppercase tracking-[0.18em] text-fs-muted">
            Token Viewer
          </label>
          <input className="bo-input mt-1.5 font-mono" placeholder="token dari console Agent / operator"
            value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} />

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <BoButton variant="fire" className="flex-1 !py-3" disabled={probing} onClick={() => void connectSetup()}>
              <PlugZap className="h-4 w-4" /> {probing ? "Memeriksa…" : "Connect"}
            </BoButton>
            <BoButton variant="white" className="flex-1 !py-3" onClick={saveAndContinue}>
              <Link2 className="h-4 w-4" /> Simpan &amp; Lanjut
            </BoButton>
          </div>

          {probeMsg ? (
            <p className={cn("mt-3 flex items-start gap-2 text-xs font-bold", probeMsg.ok ? "text-fs-ok" : "text-fs-err")}>
              {probeMsg.ok ? <SignalHigh className="mt-0.5 h-4 w-4 shrink-0" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
              {probeMsg.text}
            </p>
          ) : null}

          <div className="mt-5 space-y-2 text-[12px] font-semibold leading-snug text-fs-muted">
            <p className="flex items-start gap-2">
              <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-fs-cyan" />
              Panduan lengkap: <Link href="/guide/interactive-stream" className="text-fs-cyan hover:underline">/guide/interactive-stream</Link>
            </p>
            <p className="flex items-start gap-2">
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-fs-gold" />
              Belum tahu cara pairing perangkat? Buka <Link href="/live/connect" className="text-fs-cyan hover:underline">/live/connect</Link>.
            </p>
            <p className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-fs-err" />
              Token = kunci akses input. Jangan dibagikan ke luar venue.
            </p>
          </div>
        </BoCard>
      </div>
    );
  }

  // ---------- Viewer utama ----------
  return (
    <div className="fs-arena-bg fixed inset-0 flex touch-none flex-col overflow-hidden">
      {/* Header compact */}
      <header className="z-40 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-fs-edge bg-fs-char/90 px-2 backdrop-blur sm:px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="fs-cut-sm hidden h-7 w-7 shrink-0 items-center justify-center bg-gradient-to-br from-fs-fire to-fs-flame font-display text-sm font-black text-white sm:flex" aria-hidden>
            Z
          </span>
          <p className="truncate font-display text-[11px] font-black uppercase tracking-[0.18em] sm:text-xs">
            STIKAR <span className="text-fs-fire">ESPORTS</span>
            <span className="ml-1.5 hidden text-fs-muted sm:inline">— INTERACTIVE</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {adminRole ? (
            <div className="hidden items-center gap-1 sm:flex" role="group" aria-label="Pilih kualitas stream">
              {(Object.keys(AGENT_QUALITY_PRESETS) as AgentQuality[]).map((q) => (
                <button
                  key={q}
                  disabled={busyQuality !== null}
                  onClick={() => void changeQuality(q)}
                  className={cn(
                    "bo-btn !px-2 !py-1 !text-[10px]",
                    agentStatus?.quality === q ? "bo-btn-cyan" : "bo-btn-white",
                  )}
                  title={AGENT_QUALITY_PRESETS[q].label}
                >
                  {q.toUpperCase()}
                </button>
              ))}
            </div>
          ) : null}
          <span className={cn(
            "bo-badge",
            controller ? "border-fs-ok/70 bg-fs-ok/10 text-fs-ok"
              : !inputEnabled ? "border-fs-gold/60 text-fs-gold"
                : "border-fs-edge-strong text-fs-muted",
          )}>
            <Gamepad2 className="h-3 w-3" />
            {controller ? "CONTROLLER: KAMU" : !inputEnabled ? "WATCH ONLY" : "WATCH ONLY"}
          </span>
          {latency !== null ? <span className="bo-badge border-fs-edge-strong">{latency} MS</span> : null}
          <span className="bo-badge border-fs-edge-strong">
            <Users className="h-3 w-3" /> {viewers ?? 0}
          </span>
          <button
            onClick={() => wrapElRef.current?.requestFullscreen().catch(() => undefined)}
            className="bo-btn bo-btn-white !px-2 !py-1 !text-[10px]"
            aria-label="Layar penuh"
          >
            FULL
          </button>
        </div>
      </header>

      {/* Area video + kontrol */}
      <main className="flex min-h-0 flex-1 items-center justify-center px-1 pb-1 sm:px-2">
        <div className="aspect-video max-h-full w-full max-w-[calc((100dvh-5.5rem)*16/9)]">
          <ControlLayer
            onWrapperEl={setWrapEl}
            controller={controller}
            channelStatus={chStatus}
            latencyMs={latency}
            viewers={viewers}
            inputEnabled={inputEnabled}
            adminRole={adminRole}
            layout={layout}
            onLayoutChange={onLayoutChange}
            onJoystickMove={onJoystickMove}
            onTouchDown={onTouchDown}
            onTouchMove={onTouchMove}
            onTouchUp={onTouchUp}
            onButtonDown={onButtonDown}
            onButtonUp={onButtonUp}
            onClaim={onClaim}
            onRelease={onRelease}
            onEstop={onEstop}
            editorOpen={editorOpen}
            onEditorOpenChange={setEditorOpen}
          >
            <LiveVideoPlayer
              broadcast={broadcast}
              className="h-full w-full border-0"
              wheUrlOverride={whepUrl}
              onStatus={setPlayerStatus}
              idleContent={waitingCapture ? (
                <div className="flex flex-col items-center gap-3 px-6 text-center">
                  <SignalHigh className="h-10 w-10 text-fs-cyan" />
                  <p className="font-display text-lg font-bold uppercase tracking-[0.2em] text-white/70">
                    Agent Terhubung — Capture Belum Aktif
                  </p>
                  <p className="max-w-sm text-xs text-white/50">
                    Operator belum memulai capture di Admin → Interactive Stream. Video akan muncul
                    otomatis saat capture dimulai.
                  </p>
                </div>
              ) : undefined}
            />
          </ControlLayer>
        </div>
      </main>

      {/* Banner status jujur */}
      <div className="z-30 shrink-0 space-y-1 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))]">
        {agentError ? (
          <p className="flex items-start gap-2 border border-fs-err/60 bg-fs-err/10 px-2 py-1.5 text-[11px] font-bold text-fs-err">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Agent tidak terjangkau di {agentUrl} — cek Wi-Fi yang sama / agent jalan.
          </p>
        ) : null}
        {channelState?.status === "error" && channelState.error ? (
          <p className="flex items-start gap-2 border border-fs-err/60 bg-fs-err/10 px-2 py-1.5 text-[11px] font-bold text-fs-err">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Kanal input: {channelState.error}
          </p>
        ) : null}
        {!controller && channelState?.deniedReason ? (
          <p className="flex items-start gap-2 border border-fs-gold/60 bg-fs-gold/10 px-2 py-1.5 text-[11px] font-bold text-fs-gold">
            <Gamepad2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Permintaan kontrol ditolak: {channelState.deniedReason}
          </p>
        ) : null}
        <p className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-fs-muted">
          <span>
            VIDEO: {playerStatus === "live" ? "LIVE" : playerStatus === "connecting" ? "MENYAMBUNG…" : playerStatus === "reconnecting" ? "RECONNECTING…" : playerStatus === "signal-lost" ? "SIGNAL LOST" : playerStatus.toUpperCase()}
          </span>
          <span className="hidden truncate font-mono normal-case tracking-normal sm:inline">
            {agentStatus ? `GAME: ${gameStatusLabel(agentStatus.game)} · Q: ${agentStatus.quality.toUpperCase()}` : "STATUS AGENT MENUNGGU…"}
          </span>
          <Link href="/guide/interactive-stream" className="text-fs-cyan normal-case hover:underline">Panduan</Link>
        </p>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="fs-arena-bg min-h-screen" />}>
      <InteractiveInner />
    </Suspense>
  );
}
