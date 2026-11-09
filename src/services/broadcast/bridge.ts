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
  return localStorage.getItem(BRIDGE_URL_KEY) ?? BRIDGE_DEFAULT_URL;
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
  const payload: BridgeState = {
    connected: socket?.readyState === WebSocket.OPEN,
    obsConnected: false,
    ...state,
  };
  listeners.forEach((l) => l(payload));
}

export function connectBridge(): void {
  if (typeof window === "undefined") return;
  if (socket && socket.readyState === WebSocket.OPEN) return;
  manualClose = false;
  const token = getBridgeToken();
  if (!token) {
    emit({ connected: false, obsConnected: false, message: "Token bridge belum diatur (Pengaturan > Broadcast)." });
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
        reconnectTimer = setTimeout(() => connectBridge(), 5000);
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
