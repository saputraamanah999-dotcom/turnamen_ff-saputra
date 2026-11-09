"use client";
// ============================================================
// STIKAR ESPORTS — Interactive Game Stream (Phase 3)
// Klien untuk STIKAR BROADCAST AGENT (aplikasi lokal di komputer
// produksi yang menjalankan Free Fire).
//
// ARSITEKTUR (video & input TIDAK PERNAH lewat Firestore):
//   FREE FIRE (Google Play Games on PC)
//     → Window Capture (ffmpeg gdigrab di Agent)
//     → MediaMTX (RTSP ingest → WebRTC/WHEP + HLS keluaran)
//     → Website (WHEP player, halaman /live/interactive & TV)
//   INPUT:
//     Browser (joystick/tombol) → WebSocket Agent (token auth)
//       → SendInput OS → jendela game
//
// Firestore hanya menyimpan METADATA (interactiveSettings,
// interactiveDevices, interactiveSessions) + status siaran.
// ============================================================

export type AgentQuality = "low" | "medium" | "high";
export type AgentGameStatus =
  | "not-found"      // GAME NOT FOUND
  | "waiting"        // WAITING FOR GAME
  | "detected"       // GAME DETECTED
  | "capture-ready"  // CAPTURE READY
  | "stream-ready";  // STREAM READY

export interface AgentWindowRect { x: number; y: number; width: number; height: number }

export interface AgentCaptureInfo {
  active: boolean;
  sourceId: string | null;
  sourceTitle: string | null;
  fps: number;
  width: number;
  height: number;
  bitrateKbps: number;
  startedAt: number | null;
  lastFrameAt: number | null;
  framesDropped: number;
}

export interface AgentInputInfo {
  enabled: boolean;
  controllerLock: boolean;
  controllerId: string | null;
  controllerDevice: string | null;
  controllerSince: number | null;
  clients: number;
  viewers: number;
  eventsForwarded: number;
  estopped: boolean;
}

export interface AgentStatus {
  ok: boolean;
  agent: string;           // "STIKAR BROADCAST AGENT"
  version: string;
  hostname: string;
  os: string;
  uptimeSec: number;
  game: AgentGameStatus;
  gameTitle: string | null;
  gameProcess: string | null;
  window: AgentWindowRect | null;
  capture: AgentCaptureInfo;
  input: AgentInputInfo;
  mediamtx: {
    running: boolean;
    path: string | null;
    whepUrl: string | null;  // contoh: http://192.168.1.10:8889/bof-game (WHEP)
    hlsUrl: string | null;
    rtspUrl: string | null;
  };
  network: { ips: string[]; httpPort: number };
  cpuPercent: number | null;
  memoryMb: number | null;
  quality: AgentQuality;
}

export interface AgentSource {
  id: string;           // "window:<hwnd>" | "desktop:<n>"
  title: string;
  kind: "window" | "desktop";
  process: string | null;
  selected: boolean;
}

export interface AgentConfig {
  quality: AgentQuality;
  inputEnabled: boolean;
  controllerLock: boolean;
  joystickKeys: { up: string; down: string; left: string; right: string };
  buttonMap: Record<string, string>; // label tombol website → key target agent
  mediaMtxPath: string;
}

export const AGENT_DEFAULT_PORT = 8082;
export const AGENT_QUALITY_PRESETS: Record<AgentQuality, { label: string; bitrateKbps: number; fps: number; scale: string }> = {
  low: { label: "Low — jaringan lemah", bitrateKbps: 2500, fps: 24, scale: "1280:720" },
  medium: { label: "Medium — seimbang", bitrateKbps: 5000, fps: 30, scale: "1600:900" },
  high: { label: "High — LAN cepat", bitrateKbps: 8000, fps: 60, scale: "1920:1080" },
};

// ---------- Penyimpanan lokal (hanya di perangkat, bukan server) ----------
const LS_URL = "stikar.agent.url";
const LS_TOKEN = "stikar.agent.token";
const LS_ADMIN = "stikar.agent.adminToken";

function lsGet(k: string): string {
  if (typeof window === "undefined") return "";
  try { return window.localStorage.getItem(k) || ""; } catch { return ""; }
}
function lsSet(k: string, v: string) {
  if (typeof window === "undefined") return;
  try {
    if (v) window.localStorage.setItem(k, v);
    else window.localStorage.removeItem(k);
  } catch { /* abaikan */ }
}

export function getAgentUrl(): string { return lsGet(LS_URL); }
export function setAgentUrl(url: string) { lsSet(LS_URL, normalizeAgentUrl(url)); }
export function getAgentToken(): string { return lsGet(LS_TOKEN); }
export function setAgentToken(t: string) { lsSet(LS_TOKEN, t.trim()); }
export function getAgentAdminToken(): string { return lsGet(LS_ADMIN); }
export function setAgentAdminToken(t: string) { lsSet(LS_ADMIN, t.trim()); }

/** Terima input bebas ("192.168.1.10:8082", "http://…:8082/") → base URL bersih. */
export function normalizeAgentUrl(input: string): string {
  let s = (input || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  try {
    const u = new URL(s);
    return (u.protocol + "//" + u.host).replace(/\/+$/, "");
  } catch { return ""; }
}

/** Base URL agent: param ?agent= → localStorage. */
export function resolveAgentUrl(param?: string | null): string {
  const fromParam = normalizeAgentUrl(param || "");
  if (fromParam) return fromParam;
  return getAgentUrl();
}

// ---------- REST ----------
export class AgentApiError extends Error {
  status: number;
  constructor(message: string, status = 0) { super(message); this.status = status; }
}

async function agentFetch<T>(baseUrl: string, path: string, opts?: {
  adminToken?: string; body?: unknown; method?: string; timeoutMs?: number;
}): Promise<T> {
  const base = normalizeAgentUrl(baseUrl);
  if (!base) throw new AgentApiError("URL Agent belum diisi");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 6000);
  try {
    const res = await fetch(base + path, {
      method: opts?.method || (opts?.body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...(opts?.adminToken ? { Authorization: "Bearer " + opts.adminToken } : {}),
      },
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new AgentApiError(data.error || ("HTTP " + res.status), res.status);
    return data;
  } catch (e) {
    if (e instanceof AgentApiError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new AgentApiError(/abort/i.test(msg) ? "Agent tidak merespons (timeout)" : "Agent tidak terjangkau: " + msg);
  } finally { clearTimeout(t); }
}

export function getAgentStatus(baseUrl: string, timeoutMs = 5000): Promise<AgentStatus> {
  return agentFetch<AgentStatus>(baseUrl, "/api/status", { timeoutMs });
}

export function getAgentSources(baseUrl: string, adminToken: string): Promise<{ sources: AgentSource[] }> {
  return agentFetch(baseUrl, "/api/sources", { adminToken });
}

export function startAgentCapture(baseUrl: string, adminToken: string, body: {
  sourceId: string; quality: AgentQuality;
}): Promise<{ ok: true; status: AgentStatus }> {
  return agentFetch(baseUrl, "/api/capture/start", { adminToken, body });
}

export function stopAgentCapture(baseUrl: string, adminToken: string): Promise<{ ok: true }> {
  return agentFetch(baseUrl, "/api/capture/stop", { adminToken });
}

export function setAgentQuality(baseUrl: string, adminToken: string, quality: AgentQuality): Promise<{ ok: true }> {
  return agentFetch(baseUrl, "/api/quality", { adminToken, body: { quality } });
}

export function getAgentConfig(baseUrl: string, adminToken: string): Promise<AgentConfig> {
  return agentFetch(baseUrl, "/api/config", { adminToken });
}

export function updateAgentConfig(baseUrl: string, adminToken: string, patch: Partial<AgentConfig>): Promise<AgentConfig> {
  return agentFetch(baseUrl, "/api/config", { adminToken, body: patch });
}

export function setAgentInput(baseUrl: string, adminToken: string, body: {
  enabled?: boolean; controllerLock?: boolean;
}): Promise<{ ok: true }> {
  return agentFetch(baseUrl, "/api/input", { adminToken, body });
}

export function agentGrant(baseUrl: string, adminToken: string, action: "grant" | "revoke" | "release", clientId?: string | null): Promise<{ ok: true }> {
  return agentFetch(baseUrl, "/api/grant", { adminToken, body: { action, clientId: clientId ?? null } });
}

export function agentEmergencyStop(baseUrl: string, adminToken: string): Promise<{ ok: true }> {
  return agentFetch(baseUrl, "/api/estop", { adminToken });
}

/** Probe cepat untuk wizard/pre-flight. */
export async function probeAgent(baseUrl: string, timeoutMs = 4000): Promise<{
  reachable: boolean; version?: string; game?: AgentGameStatus;
  captureActive?: boolean; whepUrl?: string | null; mediamtxRunning?: boolean; error?: string;
}> {
  try {
    const st = await getAgentStatus(baseUrl, timeoutMs);
    return {
      reachable: true, version: st.version, game: st.game,
      captureActive: st.capture.active, whepUrl: st.mediamtx.whepUrl, mediamtxRunning: st.mediamtx.running,
    };
  } catch (e) {
    return { reachable: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- Kanal input (WebSocket terautentikasi) ----------
export type TouchPhase = "down" | "move" | "up";
export type ChannelStatus = "idle" | "connecting" | "open" | "closed" | "error";

export interface ChannelState {
  status: ChannelStatus;
  controller: boolean;
  role: "viewer" | "admin";
  clientId: string | null;
  deniedReason: string | null;
  latencyMs: number | null;
  server: Partial<AgentStatus> | null;
  error: string | null;
}

interface AgentDeviceMeta { name: string; type: "phone" | "laptop" | "tv" | "other" }

type WireMsg =
  | { t: "welcome"; you: { id: string; role: string; controller: boolean }; controller: { id: string | null; device: string | null }; inputEnabled: boolean; quality: AgentQuality; game: AgentGameStatus; capture: AgentCaptureInfo; mediamtx: AgentStatus["mediamtx"]; viewers: number; estopped: boolean }
  | { t: "state"; status: Partial<AgentStatus> }
  | { t: "granted"; controller: boolean }
  | { t: "denied"; reason: string }
  | { t: "pong"; ts: number }
  | { t: "error"; message: string };

/**
 * Kanal input ke Agent. Contoh:
 *   const ch = new AgentInputChannel("http://192.168.1.10:8082", token, { name: "HP Operator" });
 *   ch.connect(); ch.onChange(s => …); ch.claim();
 *   ch.sendTouch(1, "down", 0.42, 0.68); ch.sendJoy(-0.5, 0, true);
 */
export class AgentInputChannel {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pingSentAt = 0;
  private state: ChannelState = { status: "idle", controller: false, role: "viewer", clientId: null, deniedReason: null, latencyMs: null, server: null, error: null };
  private cbs = new Set<(s: ChannelState) => void>();

  constructor(
    private baseUrl: string,
    private token: string,
    private device: AgentDeviceMeta = { name: "Browser", type: "other" },
    private role: "viewer" | "admin" = "viewer",
  ) {}

  onChange(cb: (s: ChannelState) => void): () => void {
    this.cbs.add(cb);
    cb(this.state);
    return () => this.cbs.delete(cb);
  }

  private patch(p: Partial<ChannelState>) {
    this.state = { ...this.state, ...p };
    for (const cb of this.cbs) { try { cb(this.state); } catch { /* abaikan */ } }
  }

  connect() {
    this.close();
    const base = normalizeAgentUrl(this.baseUrl);
    if (!base || !this.token) {
      this.patch({ status: "error", error: "URL/token Agent belum diisi" });
      return;
    }
    const wsUrl = base.replace(/^http/i, "ws") + "/ws?token=" + encodeURIComponent(this.token) + "&role=" + this.role;
    this.patch({ status: "connecting", error: null, deniedReason: null });
    let ws: WebSocket;
    try { ws = new WebSocket(wsUrl); } catch (e) {
      this.patch({ status: "error", error: e instanceof Error ? e.message : "WebSocket gagal dibuat" });
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.send({ t: "hello", device: this.device, role: this.role });
      this.patch({ status: "open" });
      this.pingTimer = setInterval(() => this.ping(), 3000);
    };
    ws.onmessage = (ev) => {
      let msg: WireMsg;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      switch (msg.t) {
        case "welcome":
          this.patch({
            controller: !!msg.you?.controller,
            clientId: msg.you?.id ?? null,
            server: { game: msg.game, capture: msg.capture, mediamtx: msg.mediamtx, input: { enabled: msg.inputEnabled, controllerLock: false, controllerId: msg.controller?.id ?? null, controllerDevice: msg.controller?.device ?? null, controllerSince: null, clients: 0, viewers: msg.viewers ?? 0, eventsForwarded: 0, estopped: !!msg.estopped }, quality: msg.quality },
          });
          break;
        case "state":
          this.patch({ server: { ...this.state.server, ...msg.status } as Partial<AgentStatus> });
          break;
        case "granted":
          this.patch({ controller: msg.controller, deniedReason: msg.controller ? null : this.state.deniedReason });
          break;
        case "denied":
          this.patch({ controller: false, deniedReason: msg.reason });
          break;
        case "pong":
          if (msg.ts && this.pingSentAt) this.patch({ latencyMs: Math.max(0, Math.round(Date.now() - this.pingSentAt)) });
          break;
        case "error":
          this.patch({ error: msg.message });
          break;
      }
    };
    ws.onerror = () => { this.patch({ error: this.state.status === "connecting" ? "Agent WebSocket tidak dapat dihubungi (cek IP/port/jaringan)" : this.state.error }); };
    ws.onclose = () => {
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      this.patch({ status: this.state.status === "error" ? "error" : "closed", controller: false });
    };
  }

  private send(obj: unknown): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify(obj)); return true; } catch { return false; }
    }
    return false;
  }

  ping() {
    this.pingSentAt = Date.now();
    this.send({ t: "ping", ts: this.pingSentAt });
  }

  /** Minta menjadi controller utama. Keputusan ada di Agent (izin + lock). */
  claim() { this.send({ t: "claim" }); }
  /** Lepas kontrol secara sukarela. */
  release() { this.send({ t: "release" }); }
  /** Admin: hentikan SELURUH input yang sedang aktif. */
  estop() { this.send({ t: "estop" }); }

  // ---- Input (hanya diproses Agent jika kita controller) ----
  /** Sentuh layar video. x,y dinormalisasi 0–1 relatif area video. */
  sendTouch(id: number, phase: TouchPhase, x: number, y: number) {
    this.send({ t: "touch", id, phase, x: clamp01(x), y: clamp01(y) });
  }
  /** Joystick virtual: vektor -1..1 (y positif = ke bawah). */
  sendJoy(x: number, y: number, active: boolean) {
    this.send({ t: "joy", x: clampVec(x), y: clampVec(y), active });
  }
  /** Tombol aksi → key target (mis. "KeyJ", "Space", "MouseRight"). */
  sendButton(key: string, phase: "down" | "up") {
    this.send({ t: "btn", key, phase });
  }
  sendKey(key: string, phase: "down" | "up") {
    this.send({ t: "key", key, phase });
  }
  sendWheel(dy: number) { this.send({ t: "wheel", dy }); }

  close() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.ws) {
      try { this.ws.onclose = null; this.ws.close(); } catch { /* abaikan */ }
      this.ws = null;
    }
    this.patch({ status: "closed", controller: false });
  }
}

function clamp01(v: number): number { return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0)); }
function clampVec(v: number): number { return Math.min(1, Math.max(-1, Number.isFinite(v) ? v : 0)); }

/** Status permainan → label bahasa Indonesia untuk UI. */
export function gameStatusLabel(s: AgentGameStatus | undefined): string {
  switch (s) {
    case "not-found": return "GAME NOT FOUND";
    case "waiting": return "WAITING FOR GAME";
    case "detected": return "GAME DETECTED";
    case "capture-ready": return "CAPTURE READY";
    case "stream-ready": return "STREAM READY";
    default: return "STATUS TIDAK DIKETAHUI";
  }
}
