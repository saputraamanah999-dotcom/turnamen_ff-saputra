"use client";
// ============================================================
// /admin/interactive-stream — OPERATOR CONTROL PANEL (Phase 3)
// Panel admin untuk STIKAR BROADCAST AGENT: koneksi agent,
// status realtime, sumber capture, izin kontrol, pre-flight
// broadcast, pairing perangkat (QR), dan panduan cepat.
// Semua aksi memanggil API Agent yang NYATA (client.ts).
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  addDoc, collection, doc, serverTimestamp, setDoc,
} from "firebase/firestore";
import {
  Activity, CheckCircle2, ChevronDown, Copy, Cpu, ExternalLink, Gamepad2, Link2, ListChecks,
  Lock, MonitorPlay, Play, PlugZap, QrCode, RefreshCcw, ShieldAlert, Siren, Square, Unlock,
  WifiOff, XCircle,
} from "lucide-react";
import { BoBadge, BoButton, BoCard } from "@/components/common/bo";
import { cn } from "@/lib/utils";
import { db } from "@/services/firebase/client";
import {
  useActiveTournament, useDoc, useStandings,
} from "@/services/firestore/hooks";
import type { OverlayConfigDoc } from "@/lib/types";
import {
  AGENT_QUALITY_PRESETS, agentEmergencyStop, agentGrant, gameStatusLabel, getAgentAdminToken,
  getAgentSources, getAgentStatus, getAgentToken, getAgentUrl, normalizeAgentUrl, probeAgent,
  setAgentAdminToken, setAgentInput, setAgentQuality, setAgentToken, setAgentUrl,
  startAgentCapture, stopAgentCapture, type AgentQuality, type AgentSource, type AgentStatus,
} from "@/services/agent/client";

type ProbeState = { busy: boolean; reachable: boolean | null; version?: string; error?: string };

const POLL_MS = 2000;

export default function InteractiveStreamAdminPage() {
  // ---------- Hooks Firestore (selalu dipanggil) ----------
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const standings = useStandings(tid);
  const overlay = useDoc<OverlayConfigDoc>(tid ? `overlayConfigs/${tid}` : null);

  // ---------- State ----------
  const [urlInput, setUrlInput] = useState("");
  const [adminTokenInput, setAdminTokenInput] = useState("");
  const [viewerTokenInput, setViewerTokenInput] = useState("");
  const [agentUrl, setAgentUrlState] = useState("");
  const [probe, setProbe] = useState<ProbeState>({ busy: false, reachable: null });
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [sources, setSources] = useState<AgentSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [quality, setQuality] = useState<AgentQuality>("medium");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [openGuide, setOpenGuide] = useState<string | null>("how-connect");
  const [now, setNow] = useState(() => Date.now());
  const [fsSaved, setFsSaved] = useState<string | null>(null);
  const [deviceSaved, setDeviceSaved] = useState<string | null>(null);
  const mounted = useRef(true);

  // ---------- Init localStorage ----------
  useEffect(() => {
    mounted.current = true;
    const url = getAgentUrl();
    setUrlInput(url);
    setAgentUrlState(url);
    setAdminTokenInput(getAgentAdminToken());
    setViewerTokenInput(getAgentToken());
    return () => { mounted.current = false; };
  }, []);

  // ---------- Poll status (2 detik) ----------
  useEffect(() => {
    if (!agentUrl) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const st = await getAgentStatus(agentUrl, 5000);
        if (!cancelled) { setStatus(st); setStatusError(null); setQuality(st.quality); }
      } catch (e) {
        if (!cancelled) { setStatus(null); setStatusError(e instanceof Error ? e.message : String(e)); }
      }
    };
    void tick();
    const t = setInterval(() => void tick(), POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { cancelled = true; clearInterval(t); clearInterval(clock); };
  }, [agentUrl]);

  // ---------- QR pairing ----------
  useEffect(() => {
    if (!agentUrl) { setQr(null); setShareUrl(""); return; }
    let cancelled = false;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const url = `${origin}/live/interactive?agent=${encodeURIComponent(agentUrl)}`;
    setShareUrl(url);
    (async () => {
      try {
        const QR = (await import("qrcode")).default;
        const data = await QR.toDataURL(url, { width: 220, margin: 1, color: { dark: "#0B0E14", light: "#FFFFFF" } });
        if (!cancelled) setQr(data);
      } catch { if (!cancelled) setQr(null); }
    })();
    return () => { cancelled = true; };
  }, [agentUrl]);

  // ---------- Actions ----------
  async function connect() {
    const clean = normalizeAgentUrl(urlInput);
    if (!clean) { setProbe({ busy: false, reachable: false, error: "URL tidak valid — contoh: 192.168.1.10:8082" }); return; }
    setProbe({ busy: true, reachable: null });
    const res = await probeAgent(clean, 4000);
    setAgentUrl(clean); // simpan walau gagal — status poll akan menunjukkan error jujur
    setUrlInput(clean);
    if (res.reachable) {
      setProbe({ busy: false, reachable: true, version: res.version });
      await saveToFirestore(clean);
      void loadSources(clean);
    } else {
      setProbe({ busy: false, reachable: false, error: res.error ?? "Agent tidak terjangkau" });
    }
  }

  async function saveToFirestore(url: string) {
    if (!db || !tid) { setFsSaved(tid ? null : "Tidak ada turnamen aktif — URL hanya disimpan lokal."); return; }
    try {
      await setDoc(
        doc(db, `interactiveSettings/${tid}`),
        { agentUrl: url, defaultQuality: quality, at: serverTimestamp() },
        { merge: true },
      );
      setFsSaved("Tersimpan ke interactiveSettings/" + tid);
    } catch (e) {
      setFsSaved("Gagal simpan ke Firestore: " + (e instanceof Error ? e.message : "unknown"));
    }
  }

  async function loadSources(url = agentUrl) {
    const at = adminTokenInput.trim();
    if (!url || !at) { setActionMsg({ ok: false, text: "Isi admin token dulu untuk melihat sumber capture." }); return; }
    setBusy("sources");
    try {
      const res = await getAgentSources(url, at);
      if (!mounted.current) return;
      setSources(res.sources);
      setSelectedSource((s) => s ?? res.sources.find((x) => x.selected)?.id ?? res.sources[0]?.id ?? null);
      setActionMsg(null);
    } catch (e) {
      if (!mounted.current) return;
      setSources([]);
      setActionMsg({ ok: false, text: "Gagal memuat sumber: " + (e instanceof Error ? e.message : "error") });
    }
    setBusy(null);
  }

  async function startCapture() {
    if (!agentUrl || !adminTokenInput.trim()) { setActionMsg({ ok: false, text: "URL agent + admin token wajib diisi." }); return; }
    if (!selectedSource) { setActionMsg({ ok: false, text: "Pilih sumber capture dulu (window Free Fire / desktop)." }); return; }
    setBusy("capture");
    try {
      const res = await startAgentCapture(agentUrl, adminTokenInput.trim(), { sourceId: selectedSource, quality });
      if (!mounted.current) return;
      setStatus(res.status);
      setActionMsg({ ok: true, text: "Capture dimulai — stream tersedia di MediaMTX." });
    } catch (e) {
      if (!mounted.current) return;
      setActionMsg({ ok: false, text: "Start capture gagal: " + (e instanceof Error ? e.message : "error") });
    }
    setBusy(null);
  }

  async function stopCapture() {
    setBusy("capture");
    try {
      await stopAgentCapture(agentUrl, adminTokenInput.trim());
      if (!mounted.current) return;
      setActionMsg({ ok: true, text: "Capture dihentikan." });
    } catch (e) {
      if (!mounted.current) return;
      setActionMsg({ ok: false, text: "Stop capture gagal: " + (e instanceof Error ? e.message : "error") });
    }
    setBusy(null);
  }

  async function changeQuality(q: AgentQuality) {
    setQuality(q);
    try { await setAgentQuality(agentUrl, adminTokenInput.trim(), q); } catch { /* status berikutnya jujur */ }
  }

  async function toggleInput(field: "enabled" | "controllerLock") {
    if (!status) return;
    setBusy(field);
    try {
      await setAgentInput(agentUrl, adminTokenInput.trim(), field === "enabled" ? { enabled: !status.input.enabled } : { controllerLock: !status.input.controllerLock });
      if (!mounted.current) return;
      setActionMsg({ ok: true, text: field === "enabled" ? "Pengaturan input diperbarui." : "Controller lock diperbarui." });
    } catch (e) {
      if (!mounted.current) return;
      setActionMsg({ ok: false, text: "Gagal: " + (e instanceof Error ? e.message : "error") });
    }
    setBusy(null);
  }

  async function releaseController() {
    setBusy("release");
    try {
      await agentGrant(agentUrl, adminTokenInput.trim(), "release");
      if (!mounted.current) return;
      setActionMsg({ ok: true, text: "Controller dilepas — pemirsa bisa klaim ulang." });
    } catch (e) {
      if (!mounted.current) return;
      setActionMsg({ ok: false, text: "Gagal: " + (e instanceof Error ? e.message : "error") });
    }
    setBusy(null);
  }

  async function emergencyStop() {
    if (!window.confirm("LEPAS SEMUA INPUT (E-STOP)? Semua kontrol dari pemirsa akan dihentikan sekarang.")) return;
    setBusy("estop");
    try {
      await agentEmergencyStop(agentUrl, adminTokenInput.trim());
      if (!mounted.current) return;
      setActionMsg({ ok: true, text: "E-STOP dijalankan — semua input dilepas." });
    } catch (e) {
      if (!mounted.current) return;
      setActionMsg({ ok: false, text: "E-STOP gagal: " + (e instanceof Error ? e.message : "error") });
    }
    setBusy(null);
  }

  async function registerThisDevice() {
    if (!db) { setDeviceSaved("Firestore offline — perangkat tidak bisa didaftarkan."); return; }
    const name = parseDeviceName();
    try {
      await addDoc(collection(db, "interactiveDevices"), {
        name, type: "viewer", permission: "viewer", at: serverTimestamp(), tournamentId: tid ?? "",
      });
      setDeviceSaved(`Perangkat "${name}" terdaftar sebagai viewer.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      setDeviceSaved(
        "Gagal daftar: " + msg +
        " — Cek cepat: (1) pastikan Anda LOGIN sebagai admin di perangkat ini (logout-login ulang bila sesi basi), " +
        "(2) pastikan security rules sudah di-deploy (setup.html tahap ⑤ atau `python3 scripts/deploy-firestore.py`), " +
        "(3) lihat dokumentasi/documentation/FIREBASE_SA_DEPLOY.md."
      );
    }
  }

  function parseDeviceName() {
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) return "Android (browser admin)";
    if (/iPhone|iPad/i.test(ua)) return "iOS (browser admin)";
    if (/Windows/i.test(ua)) return "Windows (browser admin)";
    if (/Macintosh/i.test(ua)) return "Mac (browser admin)";
    return "Perangkat admin";
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setActionMsg({ ok: true, text: `${label} disalin ke clipboard.` });
    } catch {
      setActionMsg({ ok: false, text: "Clipboard diblokir browser — salin manual." });
    }
  }

  // ---------- Pre-flight ----------
  const frameAgeSec = status?.capture.lastFrameAt ? Math.max(0, Math.round((now - status.capture.lastFrameAt) / 1000)) : null;

  const preflight = useMemo(() => {
    const rows: { label: string; ok: boolean; hint: string }[] = [
      { label: "Google Play Games berjalan", ok: Boolean(status?.gameProcess), hint: "Buka Google Play Games di komputer dan jalankan dari sana." },
      { label: "Free Fire window terdeteksi", ok: Boolean(status && status.game !== "not-found" && status.gameTitle), hint: "Pastikan Free Fire berjalan di foreground (lihat /guide/google-play-games)." },
      { label: "Capture source ready", ok: Boolean(status?.capture.active), hint: "Pilih sumber di section 3 lalu tekan MULAI CAPTURE." },
      { label: "Agent terhubung", ok: probe.reachable === true || Boolean(status?.ok), hint: "Tekan CONNECT di section 1; cek IP & port 8082." },
      { label: "Video frames received (<5s)", ok: frameAgeSec !== null && frameAgeSec < 5, hint: "Frame tidak mengalir — cek ffmpeg/MediaMTX di komputer agent." },
      { label: "MediaMTX running", ok: Boolean(status?.mediamtx.running), hint: "Jalankan mediamtx.exe di komputer agent (port 8889)." },
      { label: "WHEP URL siap", ok: Boolean(status?.mediamtx.whepUrl), hint: "WHEP URL muncul setelah capture aktif." },
      { label: "Leaderboard loaded", ok: (standings.data?.standings?.length ?? 0) > 0, hint: "Publish klasemen di Admin → Klasemen/Entri Hasil." },
      { label: "Active match selected", ok: Boolean(tournament?.currentMatchId), hint: "Pilih match aktif di Admin → Match." },
      { label: "Overlay ready", ok: Boolean(overlay.data?.onAir ?? overlay.data?.draft), hint: "Set preset overlay di Admin → Overlay Manager." },
    ];
    return rows;
  }, [status, probe.reachable, frameAgeSec, standings.data, tournament?.currentMatchId, overlay.data]);

  const allReady = preflight.every((r) => r.ok);
  const failing = preflight.filter((r) => !r.ok);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Header halaman */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="bo-kicker mb-2 inline-block">Phase 3 — Interactive Stream</span>
          <h1 className="bo-title">Interactive Stream Control</h1>
          <p className="mt-1 max-w-2xl text-sm font-semibold text-fs-muted">
            Panel operator untuk STIKAR BROADCAST AGENT di komputer produksi: capture Free Fire
            (Google Play Games on PC) → MediaMTX → viewer HP/TV dengan kontrol sentuh.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/live/interactive" className="bo-btn bo-btn-cyan"><ExternalLink className="h-4 w-4" /> Buka Viewer Interaktif</Link>
          <Link href="/display" className="bo-btn bo-btn-white"><MonitorPlay className="h-4 w-4" /> Preview TV</Link>
        </div>
      </div>

      {/* 1 · HUBUNGKAN AGENT */}
      <BoCard className="fs-cut p-5">
        <SectionHead n={1} title="Hubungkan Agent" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-fs-muted">URL Agent</span>
            <input className="bo-input mt-1 font-mono" placeholder="192.168.1.10:8082"
              value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-fs-muted">Admin Token (dari console Agent)</span>
            <input className="bo-input mt-1 font-mono" type="password" placeholder="admin token"
              value={adminTokenInput} onChange={(e) => setAdminTokenInput(e.target.value)}
              onBlur={() => setAgentAdminToken(adminTokenInput)} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <BoButton variant="fire" disabled={probe.busy} onClick={() => void connect()}>
            <PlugZap className="h-4 w-4" /> {probe.busy ? "Memeriksa…" : "Connect"}
          </BoButton>
          <BoButton variant="white" onClick={() => void saveToFirestore(normalizeAgentUrl(urlInput))} disabled={!tid}>
            Simpan ke Turnamen Aktif
          </BoButton>
          {probe.reachable === true ? (
            <BoBadge className="border-fs-ok/60 text-fs-ok">Agent v{probe.version} TERJANGKAU</BoBadge>
          ) : probe.reachable === false ? (
            <BoBadge className="border-fs-err/60 text-fs-err">{probe.error ?? "TIDAK TERJANGKAU"}</BoBadge>
          ) : null}
          {fsSaved ? <span className="text-[11px] font-bold text-fs-muted">{fsSaved}</span> : null}
        </div>
        {!adminTokenInput.trim() ? (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-fs-gold">
            <ShieldAlert className="h-3.5 w-3.5" /> Admin token belum diisi — kontrol capture/input dinonaktifkan.
          </p>
        ) : null}
      </BoCard>

      {/* 2 · STATUS AGENT */}
      <BoCard className="fs-cut p-5">
        <SectionHead n={2} title="Status Agent" right={<span className="text-[10px] font-black uppercase tracking-widest text-fs-muted">poll 2s</span>} />
        {!agentUrl ? (
          <p className="text-sm font-semibold text-fs-muted">Belum ada URL agent — hubungkan dulu di section 1.</p>
        ) : statusError && !status ? (
          <p className="flex items-center gap-2 border border-fs-err/60 bg-fs-err/10 px-3 py-2 text-xs font-bold text-fs-err">
            <WifiOff className="h-4 w-4" /> Agent tidak terjangkau di {agentUrl} — {statusError}
          </p>
        ) : status ? (
          <div className="grid gap-2 text-xs font-bold sm:grid-cols-2 lg:grid-cols-3">
            <Chip label="AGENT" value={status.ok ? "ONLINE" : "OFFLINE"} tone={status.ok ? "ok" : "err"} />
            <Chip label="VERSION" value={status.version} />
            <Chip label="HOSTNAME" value={status.hostname} />
            <Chip label="OS" value={status.os} />
            <Chip label="UPTIME" value={fmtDur(status.uptimeSec)} />
            <Chip label="GAME" value={gameStatusLabel(status.game)} tone={status.game === "stream-ready" || status.game === "capture-ready" ? "ok" : status.game === "not-found" ? "err" : "warn"} />
            <Chip label="PROCESS" value={status.gameProcess ?? "—"} />
            <Chip label="WINDOW" value={status.window ? `${status.window.width}×${status.window.height}` : "—"} />
            <Chip label="CAPTURE" value={status.capture.active ? "ACTIVE" : "IDLE"} tone={status.capture.active ? "ok" : "muted"} />
            <Chip label="SOURCE" value={status.capture.sourceTitle ?? status.capture.sourceId ?? "—"} />
            <Chip label="FPS" value={status.capture.fps > 0 ? String(status.capture.fps) : "—"} />
            <Chip label="RESOLUTION" value={status.capture.width ? `${status.capture.width}×${status.capture.height}` : "—"} />
            <Chip label="BITRATE" value={status.capture.bitrateKbps ? `${status.capture.bitrateKbps} kbps` : "—"} />
            <Chip
              label="LAST FRAME"
              value={frameAgeSec === null ? "—" : `${frameAgeSec}s lalu`}
              tone={frameAgeSec === null ? "muted" : frameAgeSec < 5 ? "ok" : frameAgeSec < 15 ? "warn" : "err"}
            />
            <Chip label="DROPPED" value={String(status.capture.framesDropped)} tone={status.capture.framesDropped > 0 ? "warn" : "muted"} />
            <Chip label="MEDIAMTX" value={status.mediamtx.running ? "RUNNING" : "STOPPED"} tone={status.mediamtx.running ? "ok" : "err"} />
            <Chip label="INPUT" value={status.input.enabled ? "ENABLED" : "DISABLED"} tone={status.input.enabled ? "ok" : "warn"} />
            <Chip label="CONTROLLER" value={status.input.controllerDevice ?? status.input.controllerId ?? "—"} />
            <Chip label="CLIENTS" value={`${status.input.clients} · ${status.input.viewers} viewer`} />
            <Chip label="EVENTS FWD" value={String(status.input.eventsForwarded)} />
            <Chip label="E-STOP" value={status.input.estopped ? "AKTIF" : "CLEAR"} tone={status.input.estopped ? "err" : "ok"} />
            <Chip label="CPU / MEM" value={`${status.cpuPercent ?? "—"}% · ${status.memoryMb ?? "—"} MB`} />
            <div className="col-span-full flex flex-wrap items-center gap-2 border border-fs-edge bg-fs-panel p-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-fs-muted">WHEP URL</span>
              <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-fs-cyan">{status.mediamtx.whepUrl ?? "— (mulai capture dulu)"}</code>
              {status.mediamtx.whepUrl ? (
                <button onClick={() => void copyText(status.mediamtx.whepUrl ?? "", "WHEP URL")} className="bo-btn bo-btn-white !px-2 !py-1 !text-[10px]">
                  <Copy className="h-3 w-3" /> Salin
                </button>
              ) : null}
            </div>
            <p className="col-span-full text-[10px] font-bold text-fs-muted">
              Video terakhir diterima: {frameAgeSec === null ? "belum pernah" : `${frameAgeSec} detik lalu`}
              {" · "}hijau &lt;5s, kuning &lt;15s, merah lebih lama.
            </p>
          </div>
        ) : (
          <p className="text-sm font-semibold text-fs-muted">Menyambung ke {agentUrl}…</p>
        )}
      </BoCard>

      {/* 3 · SUMBER CAPTURE */}
      <BoCard className="fs-cut p-5">
        <SectionHead n={3} title="Sumber Capture" right={
          <button onClick={() => void loadSources()} className="bo-btn bo-btn-white !px-2.5 !py-1 !text-[10px]" disabled={!agentUrl || busy === "sources"}>
            <RefreshCcw className={cn("h-3 w-3", busy === "sources" && "fs-connecting")} /> Muat Sumber
          </button>
        } />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="thin-scroll max-h-48 space-y-1 overflow-y-auto border border-fs-edge p-2">
            {sources.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs font-semibold text-fs-muted">
                Klik <b>Muat Sumber</b> (butuh admin token) — daftar window &amp; desktop dari komputer agent.
              </p>
            ) : sources.map((s) => (
              <label key={s.id} className={cn(
                "flex cursor-pointer items-center gap-2 border px-2 py-1.5 text-xs font-bold transition",
                selectedSource === s.id ? "border-fs-fire bg-fs-fire/10 text-fs-text" : "border-fs-edge text-fs-muted hover:bg-white/[0.04]",
              )}>
                <input type="radio" name="capture-source" className="accent-fs-fire"
                  checked={selectedSource === s.id} onChange={() => setSelectedSource(s.id)} />
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <BoBadge className="shrink-0">{s.kind}</BoBadge>
              </label>
            ))}
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-fs-muted">Kualitas</p>
            <div className="mt-1.5 flex gap-2">
              {(Object.keys(AGENT_QUALITY_PRESETS) as AgentQuality[]).map((q) => (
                <button key={q} onClick={() => void changeQuality(q)}
                  className={cn("bo-btn flex-1 !px-2 !py-2 !text-[11px]", quality === q ? "bo-btn-cyan" : "bo-btn-white")}
                  title={AGENT_QUALITY_PRESETS[q].label}>
                  {q.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <BoButton variant="fire" className="flex-1" disabled={busy === "capture" || !status?.capture.active} onClick={() => void startCapture()}>
                <Play className="h-4 w-4" /> Mulai Capture
              </BoButton>
              <BoButton variant="danger" className="flex-1" disabled={busy === "capture" || !status?.capture.active} onClick={() => void stopCapture()}>
                <Square className="h-4 w-4" /> Stop
              </BoButton>
            </div>
            <p className="mt-2 text-[10px] font-semibold text-fs-muted/80">
              Preset: {AGENT_QUALITY_PRESETS[quality].label} — {AGENT_QUALITY_PRESETS[quality].bitrateKbps} kbps, {AGENT_QUALITY_PRESETS[quality].fps} fps.
            </p>
          </div>
        </div>
      </BoCard>

      {/* 4 · IZIN KONTROL */}
      <BoCard className="fs-cut p-5">
        <SectionHead n={4} title="Izin Kontrol" />
        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleRow
            label="Input pemirsa" value={status?.input.enabled} busy={busy === "enabled"}
            onLabel="ENABLED — pemirsa bisa mengirim input" offLabel="DISABLED — semua input diabaikan"
            onToggle={() => void toggleInput("enabled")} disabled={!agentUrl || !adminTokenInput.trim()}
          />
          <ToggleRow
            label="Controller lock" value={status?.input.controllerLock} busy={busy === "controllerLock"}
            onLabel="LOCK — hanya operator yang bisa pindah controller" offLabel="BEBAS — pemirsa bisa klaim kontrol"
            onToggle={() => void toggleInput("controllerLock")} disabled={!agentUrl || !adminTokenInput.trim()}
          />
          <div className="border border-fs-edge bg-fs-panel p-3 sm:col-span-2">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-fs-muted">Controller saat ini</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-bold text-fs-text">
              <Gamepad2 className="h-4 w-4 text-fs-cyan" />
              {status?.input.controllerDevice ?? status?.input.controllerId ?? "Tidak ada — pemirsa bisa mengambil"}
              {status?.input.controllerSince ? (
                <span className="text-[11px] font-semibold text-fs-muted">sejak {new Date(status.input.controllerSince).toLocaleTimeString("id-ID")}</span>
              ) : null}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <BoButton variant="white" disabled={busy === "release" || !status?.input.controllerId} onClick={() => void releaseController()}>
                <Unlock className="h-4 w-4" /> Release Controller
              </BoButton>
              <BoButton variant="danger" disabled={busy === "estop"} onClick={() => void emergencyStop()}>
                <Siren className="h-4 w-4" /> LEPAS SEMUA INPUT (E-STOP)
              </BoButton>
            </div>
          </div>
        </div>
        {actionMsg ? (
          <p className={cn("mt-3 text-xs font-bold", actionMsg.ok ? "text-fs-ok" : "text-fs-err")}>{actionMsg.text}</p>
        ) : null}
      </BoCard>

      {/* 5 · PRE-FLIGHT BROADCAST */}
      <BoCard className="fs-cut p-5">
        <SectionHead n={5} title="Pre-Flight Broadcast" right={<ListChecks className="h-4 w-4 text-fs-cyan" />} />
        <div className="grid gap-1.5 sm:grid-cols-2">
          {preflight.map((r) => (
            <div key={r.label} className={cn(
              "flex items-start gap-2 border px-2.5 py-2 text-xs font-bold",
              r.ok ? "border-fs-edge bg-white/[0.02] text-fs-text" : "border-fs-err/50 bg-fs-err/5 text-fs-err",
            )}>
              {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-fs-ok" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-fs-err" />}
              <span className="min-w-0">
                {r.label}
                {!r.ok ? <span className="mt-0.5 block text-[10px] font-semibold text-fs-muted">Fix: {r.hint}</span> : null}
              </span>
            </div>
          ))}
        </div>
        <div className={cn(
          "mt-3 border px-3 py-2.5 font-display text-sm font-black uppercase tracking-[0.16em]",
          allReady ? "border-fs-ok/60 bg-fs-ok/10 text-fs-ok" : "border-fs-err/60 bg-fs-err/10 text-fs-err",
        )}>
          {allReady ? "✔ READY TO BROADCAST" : "✖ BROADCAST NOT READY"}
          {!allReady && failing.length > 0 ? (
            <span className="mt-1 block font-sans text-[11px] font-bold normal-case tracking-normal text-fs-muted">
              Belum siap: {failing.map((f) => f.label).join(" · ")} — ikuti hint Fix di atas.
            </span>
          ) : null}
        </div>
      </BoCard>

      {/* 6 · PAIRING PERANGKAT */}
      <BoCard className="fs-cut p-5">
        <SectionHead n={6} title="Pairing Perangkat" right={<QrCode className="h-4 w-4 text-fs-cyan" />} />
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <div className="flex flex-col items-center gap-2 border border-fs-edge bg-white p-3">
            {qr ? (
              <img src={qr} alt="QR viewer interactive stream" className="h-auto w-full" />
            ) : (
              <div className="flex h-[200px] w-full items-center justify-center text-xs font-bold text-fs-ink/50">
                {agentUrl ? "Membuat QR…" : "Hubungkan agent dulu"}
              </div>
            )}
            <span className="text-[10px] font-black uppercase tracking-widest text-fs-ink">Scan → /live/interactive</span>
          </div>
          <div className="min-w-0 space-y-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-fs-muted">Link Viewer</p>
              <div className="mt-1 flex gap-2">
                <input readOnly className="bo-input min-w-0 flex-1 font-mono !text-[11px]" value={shareUrl} />
                <button onClick={() => void copyText(shareUrl, "Link viewer")} className="bo-btn bo-btn-white shrink-0 !px-3" disabled={!shareUrl}>
                  <Copy className="h-3.5 w-3.5" /> Salin
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-fs-muted">Token Viewer (dari console Agent)</p>
              <div className="mt-1 flex gap-2">
                <input className="bo-input min-w-0 flex-1 font-mono" type="password" placeholder="token viewer"
                  value={viewerTokenInput} onChange={(e) => setViewerTokenInput(e.target.value)} />
                <button
                  onClick={() => { setAgentToken(viewerTokenInput); setActionMsg({ ok: true, text: "Token viewer tersimpan di perangkat ini." }); }}
                  className="bo-btn bo-btn-white shrink-0 !px-3">
                  <Link2 className="h-3.5 w-3.5" /> Simpan
                </button>
              </div>
              <p className="mt-1 text-[10px] font-semibold text-fs-muted/80">
                Token ini dipakai halaman /live/interactive di perangkat yang membukanya. Bagikan hanya ke pemirsa di venue.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <BoButton variant="cyan" onClick={() => void registerThisDevice()}>
                <MonitorPlay className="h-4 w-4" /> Registrasi Perangkat Ini
              </BoButton>
              {deviceSaved ? <span className="text-[11px] font-bold text-fs-muted">{deviceSaved}</span> : null}
            </div>
          </div>
        </div>
      </BoCard>

      {/* 7 · PANDUAN CEPAT */}
      <BoCard className="fs-cut p-5">
        <SectionHead n={7} title="Panduan Cepat" />
        <div className="space-y-1.5">
          {GUIDES.map((g) => (
            <div key={g.id} className="border border-fs-edge">
              <button
                onClick={() => setOpenGuide((o) => (o === g.id ? null : g.id))}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-black uppercase tracking-[0.14em] text-fs-text hover:bg-white/[0.04]"
                aria-expanded={openGuide === g.id}
              >
                {g.title}
                <ChevronDown className={cn("h-4 w-4 transition-transform", openGuide === g.id && "rotate-180")} />
              </button>
              {openGuide === g.id ? (
                <div className="border-t border-fs-edge/60 px-3 py-2">
                  <ol className="list-decimal space-y-1 pl-5 text-[12px] font-semibold leading-snug text-fs-muted">
                    {g.lines.map((l) => <li key={l}>{l}</li>)}
                  </ol>
                  <Link href={g.href} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-fs-cyan hover:underline">
                    Panduan lengkap <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </BoCard>

      <div className="flex items-center gap-2 pb-4 text-[11px] font-bold text-fs-muted">
        <Cpu className="h-3.5 w-3.5" /> Agent berjalan di komputer produksi (bukan server) — website hanya menampilkan metadata &amp; video.
        <Activity className="ml-2 h-3.5 w-3.5" /> Status di halaman ini diambil langsung dari API Agent (poll 2s).
        {status ? <Lock className="ml-2 h-3.5 w-3.5" /> : <Unlock className="ml-2 h-3.5 w-3.5" />}
      </div>
    </div>
  );
}

/* ================= Sub-komponen kecil ================= */

function SectionHead({ n, title, right }: { n: number; title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 border-b border-fs-edge pb-2">
      <p className="font-display text-sm font-black uppercase tracking-[0.18em] text-fs-gold">
        <span className="mr-2 text-fs-fire">{n} ·</span>{title}
      </p>
      {right}
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "err" | "muted" }) {
  return (
    <div className="flex items-center justify-between gap-2 border border-fs-edge bg-fs-panel px-2.5 py-1.5">
      <span className="text-[9.5px] font-black uppercase tracking-[0.18em] text-fs-muted">{label}</span>
      <span className={cn(
        "min-w-0 truncate text-right text-[11px]",
        tone === "ok" ? "text-fs-ok" : tone === "warn" ? "text-fs-gold" : tone === "err" ? "text-fs-err" : tone === "muted" ? "text-fs-muted" : "text-fs-text",
      )}>{value}</span>
    </div>
  );
}

function ToggleRow({ label, value, onLabel, offLabel, onToggle, disabled, busy }: {
  label: string; value: boolean | undefined; onLabel: string; offLabel: string;
  onToggle: () => void; disabled: boolean; busy: boolean;
}) {
  return (
    <div className="border border-fs-edge bg-fs-panel p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-fs-text">{label}</p>
        <button
          onClick={onToggle}
          disabled={disabled || busy}
          role="switch"
          aria-checked={value === true}
          aria-label={label}
          className={cn(
            "relative h-6 w-11 border transition",
            value ? "border-fs-ok/70 bg-fs-ok/30" : "border-fs-edge-strong bg-black/40",
          )}
        >
          <span className={cn(
            "absolute top-0.5 h-4.5 w-4.5 transition-all",
            value ? "left-[1.4rem] bg-fs-ok" : "left-0.5 bg-fs-muted",
          )} />
        </button>
      </div>
      <p className="mt-1 text-[10.5px] font-bold text-fs-muted">{value === undefined ? "Status belum diketahui" : value ? onLabel : offLabel}</p>
    </div>
  );
}

/* ================= Data panduan cepat ================= */

const GUIDES: { id: string; title: string; href: string; lines: string[] }[] = [
  {
    id: "how-connect", title: "How to Connect", href: "/guide/interactive-stream",
    lines: [
      "Cek IP komputer agent (ipconfig) — contoh 192.168.1.10.",
      "Isi URL Agent + admin token lalu tekan CONNECT.",
      "Buka /live/interactive di HP yang satu Wi-Fi (atau scan QR section 6).",
    ],
  },
  {
    id: "how-install", title: "How to Install Agent", href: "/guide/interactive-stream",
    lines: [
      "Install Node.js 20+ di komputer produksi (agent butuh >=20).",
      "Jalankan npm install di folder agent (ws + koffi opsional, ffmpeg).",
      "Jalankan start.bat — Agent HTTP di 8082, MediaMTX di 8889.",
    ],
  },
  {
    id: "how-tv", title: "How to Connect TV", href: "/guide/local-network",
    lines: [
      "Sambungkan TV ke Wi-Fi yang sama dengan agent.",
      "Scan QR section 6 (atau buka /live/interactive?agent=IP).",
      "Aktifkan fullscreen dari tombol di halaman viewer.",
    ],
  },
  {
    id: "how-controls", title: "How to Enable Controls", href: "/guide/interactive-stream",
    lines: [
      "Pastikan toggle Input pemirsa (section 4) = ENABLED.",
      "Pemirsa menekan AMBIL KONTROL di /live/interactive.",
      "Gunakan controller lock bila ingin satu-satunya pengendali tetap operator.",
    ],
  },
  {
    id: "troubleshooting", title: "Troubleshooting", href: "/guide/interactive-stream#troubleshooting",
    lines: [
      "GAME NOT FOUND → jalankan Free Fire dari Google Play Games, biarkan window terbuka.",
      "Layar hitam → cek MediaMTX berjalan & capture aktif (section 2-3).",
      "Input tidak merespons → cek input enabled, controller lock, dan e-stop CLEAR.",
    ],
  },
];

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}j ${m % 60}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}
