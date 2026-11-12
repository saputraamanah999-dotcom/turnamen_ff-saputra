"use client";
// ============================================================
// STIKAR ESPORTS — Klien Broadcast Bridge lokal (port 8078)
// Hanya terhubung ketika website dibuka di laptop produksi.
// Tidak pernah mengekspos OBS WebSocket ke internet publik.
// ============================================================

const BRIDGE_URL_KEY = "stikar.bridge.url";
const BRIDGE_TOKEN_KEY = "stikar.bridge.token";
export const BRIDGE_DEFAULT_URL = "ws://127.0.0.1:8078";

export function getBridgeUrl(): string {
  if (typeof window === "undefined") return BRIDGE_DEFAULT_URL;
  const saved = localStorage.getItem(BRIDGE_URL_KEY);
  // URL bridge harus WebSocket (ws:// / wss://). Nilai lama seperti http://IP:8080 tidak valid.
  return saved && /^wss?:\/\//i.test(saved) ? saved : BRIDGE_DEFAULT_URL;
}
export function setBridgeUrl(url: string) {
  if (typeof window !== "undefined") localStorage.setItem(BRIDGE_URL_KEY, url.replace(/\/$/, ""));
}
export function getBridgeToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(BRIDGE_TOKEN_KEY) ?? "";
}
export function setBridgeToken(token: string) {
  if (typeof window !== "undefined") localStorage.setItem(BRIDGE_TOKEN_KEY, token);
}

/** Hasil deteksi otomatis dari gateway lokal (GET /api/bootstrap). */
export interface BridgeBootstrap {
  token: string;
  wsUrl: string;
  gatewayPort: number;
  lanIp: string | null;
  interface?: string | null;
  lanIps: { name: string; address: string; virtual?: boolean }[];
  mediamtx: boolean;
  mediamtxPath: string;
}

/** URL siap pakai untuk satu IP LAN (HLS/WHE untuk penonton, WHIP untuk operator di laptop sama). */
export function buildStreamUrls(ip: string, port: number, path: string) {
  const base = `http://${ip}:${port}`;
  return {
    localGatewayUrl: base,
    displayUrl: `${base}/display/${path}`,
    liveUrl: `${base}/live/${path}`,
    hlsUrl: `${base}/hls/${path}/index.m3u8`,
    wheUrl: `${base}/mediamtx/${path}/whe`,
    whipUrl: `http://127.0.0.1:${port}/mediamtx/${path}/whip`,
  };
}

const GATEWAY_PORT_KEY = "stikar.bridge.gatewayPort";
let lastBootstrap: BridgeBootstrap | null = null;
export function getLastBootstrap(): BridgeBootstrap | null {
  return lastBootstrap;
}

/**
 * Deteksi otomatis bridge di laptop ini: ambil token + IP LAN dari gateway lokal.
 * Hanya berhasil bila website dibuka di browser pada laptop yang menjalankan bridge
 * (gateway menolak origin/host lain), jadi aman dipanggil kapan saja.
 */
export async function bootstrapBridge(): Promise<BridgeBootstrap | null> {
  if (typeof window === "undefined") return null;
  let port = 8080;
  try {
    const saved = Number(localStorage.getItem(GATEWAY_PORT_KEY));
    if (saved > 0) port = saved;
  } catch { /* abaikan */ }
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/bootstrap`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as Partial<BridgeBootstrap> & { ok?: boolean };
    if (!j.ok || typeof j.token !== "string" || typeof j.wsUrl !== "string") return null;
    lastBootstrap = {
      token: j.token,
      wsUrl: j.wsUrl,
      gatewayPort: j.gatewayPort ?? port,
      lanIp: j.lanIp ?? null,
      interface: j.interface ?? null,
      lanIps: Array.isArray(j.lanIps) ? j.lanIps : [],
      mediamtx: Boolean(j.mediamtx),
      mediamtxPath: j.mediamtxPath ?? "bof-main",
    };
    setBridgeUrl(lastBootstrap.wsUrl);
    setBridgeToken(lastBootstrap.token);
    try { localStorage.setItem(GATEWAY_PORT_KEY, String(lastBootstrap.gatewayPort)); } catch { /* abaikan */ }
    emit({ connected: socket?.readyState === WebSocket.OPEN });
    return lastBootstrap;
  } catch {
    return null;
  }
}

/** Bootstrap otomatis lalu sambungkan WebSocket. Dipakai halaman admin saat dibuka. */
let wantConnected = false;
export async function autoConnectBridge(): Promise<void> {
  wantConnected = true;
  await bootstrapBridge();
  // Halaman bisa saja sudah ditutup selama menunggu bootstrap — jangan buka socket yatim.
  if (wantConnected) connectBridge();
}

export interface BridgeState {
  connected: boolean;
  obsConnected: boolean;
  obsVersion?: string;
  scenes?: string[];
  currentScene?: string;
  streaming?: boolean;
  recording?: boolean;
  /** Jumlah viewer/perangkat nyata yang tersambung ke gateway lokal. */
  viewers?: number;
  /** Detail daftar viewer: label, jenis, sejak kapan. */
  viewerList?: { id: string; label: string; type: string; since: number }[];
  /** IP LAN aktif yang dilaporkan laptop (network interface asli). */
  lanIp?: string;
  /** Port gateway HTTP lokal. */
  gatewayPort?: number;
  /** Status MediaMTX di laptop. */
  mediamtx?: boolean;
  /** URL pairing aktif (jika ada). */
  pairingCode?: string | null;
  message?: string;
  /** Hasil deteksi otomatis (ada bila website dibuka di laptop yang menjalankan bridge). */
  bootstrap?: BridgeBootstrap;
}

type Listener = (state: BridgeState) => void;

let socket: WebSocket | null = null;
const listeners = new Set<Listener>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let manualClose = false;

export function subscribeBridge(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(state: Partial<BridgeState>) {
  const defined = Object.fromEntries(Object.entries(state).filter(([, v]) => v !== undefined)) as Partial<BridgeState>;
  const payload: BridgeState = {
    connected: socket?.readyState === WebSocket.OPEN,
    obsConnected: false,
    // Nilai awal dari deteksi otomatis — langsung muncul sebelum event WebSocket pertama tiba.
    lanIp: lastBootstrap?.lanIp ?? undefined,
    gatewayPort: lastBootstrap?.gatewayPort,
    mediamtx: lastBootstrap?.mediamtx,
    bootstrap: lastBootstrap ?? undefined,
    ...defined,
  };
  listeners.forEach((l) => l(payload));
}

export function connectBridge(): void {
  if (typeof window === "undefined") return;
  if (socket && socket.readyState === WebSocket.OPEN) return;
  manualClose = false;
  const token = getBridgeToken();
  if (!token) {
    emit({ connected: false, obsConnected: false, message: "Bridge belum terdeteksi. Jalankan start-bridge.bat di laptop produksi, lalu buka halaman ini di browser laptop yang sama." });
    return;
  }
  try {
    socket = new WebSocket(`${getBridgeUrl()}?token=${encodeURIComponent(token)}`);
    socket.onopen = () => emit({ connected: true, message: undefined });
    socket.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        const data = msg.data ?? {};
        emit({
          connected: true,
          obsConnected: Boolean(data.connected),
          obsVersion: data.version,
          scenes: data.scenes,
          currentScene: data.currentScene,
          streaming: data.streaming,
          recording: data.recording,
          viewers: typeof data.viewers === "number" ? data.viewers : undefined,
          viewerList: Array.isArray(data.viewerList) ? data.viewerList : undefined,
          lanIp: typeof data.lanIp === "string" ? data.lanIp : undefined,
          gatewayPort: typeof data.gatewayPort === "number" ? data.gatewayPort : undefined,
          mediamtx: typeof data.mediamtx === "boolean" ? data.mediamtx : undefined,
          pairingCode: data.pairingCode ?? undefined,
        });
      } catch {
        // abaikan pesan tidak valid
      }
    };
    socket.onclose = () => {
      emit({ connected: false, obsConnected: false, message: "Bridge terputus." });
      if (!manualClose) {
        reconnectTimer = setTimeout(() => void autoConnectBridge(), 5000);
      }
    };
    socket.onerror = () => {
      emit({ connected: false, obsConnected: false, message: "Gagal terhubung ke bridge di " + getBridgeUrl() });
    };
  } catch {
    emit({ connected: false, obsConnected: false, message: "URL bridge tidak valid." });
  }
}

export function disconnectBridge() {
  wantConnected = false;
  manualClose = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  socket?.close();
  socket = null;
}

/** Kirim perintah ke bridge (whitelist sisi server). */
export function sendBridgeCommand(command: string, params?: Record<string, unknown>): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "request", id: crypto.randomUUID(), command, params }));
  }
}
