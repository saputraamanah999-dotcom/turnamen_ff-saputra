"use client";
// ============================================================
// STIKAR ESPORTS — Engine streaming sisi browser (PHASE 2 §5, §7)
// Alur: getDisplayMedia (capture gameplay) → WHIP POST → MediaMTX
// → WebRTC/HLS viewer. 100% open-source, tanpa layanan berbayar.
//
// Semua status DITENTUKAN OLEH KONEKSI NYATA:
// - "live" hanya setelah RTCPeerConnection benar-benar terhubung.
// - bitrate/fps/resolusi dihitung dari getStats() WebRTC.
// - deteksi layar hitam & frame beku via sampling canvas.
// ============================================================

import type { BroadcastState } from "@/lib/types";

export interface StreamStats {
  bitrateKbps: number | null;
  fps: number | null;
  resolution: string | null; // "1280x720"
  framesSent: number | null;
  connectionState: RTCPeerConnectionState | null;
}

export interface SourceQuality {
  blackFrames: boolean; // layar hitam terdeteksi
  frozenFrames: boolean; // frame beku
  lastFrameAt: number | null;
}

export interface CaptureSourceInfo {
  id: string;
  label: string;
  kind: "window" | "monitor" | "browser" | "unknown";
}

export type PublisherEvents = {
  onState?: (state: BroadcastState, message?: string) => void;
  onStats?: (stats: StreamStats) => void;
  onQuality?: (q: SourceQuality) => void;
};

const STATS_INTERVAL_MS = 1000;
const QUALITY_INTERVAL_MS = 2000;
const MAX_RECONNECT = 5;

/** Tunda yang bisa dibatalkan. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    }, { once: true });
  });
}

/** Tunggu ICE gathering selesai (WHIP/WHE MediaMTX = non-trickle). */
async function waitIce(pc: RTCPeerConnection, timeoutMs = 2500): Promise<void> {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const done = () => { cleanup(); resolve(); };
    const on = () => { if (pc.iceGatheringState === "complete") done(); };
    const timer = setTimeout(done, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", on);
    }
    pc.addEventListener("icegatheringstatechange", on);
  });
}

/** Minta izin capture layar/jendela dari operator. */
export async function captureSource(opts?: {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: "exclude" | "include";
}): Promise<{ stream: MediaStream; source: CaptureSourceInfo }> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Browser ini tidak mendukung capture layar. Gunakan Chrome/Edge di laptop produksi.");
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: { ideal: 60, max: 60 },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    } as MediaTrackConstraints,
    audio: true,
    preferCurrentTab: opts?.preferCurrentTab,
    selfBrowserSurface: opts?.selfBrowserSurface ?? "exclude", // hindari menangkap tab admin sendiri
    surfaceSwitching: "include",
  } as DisplayMediaStreamOptions);

  const track = stream.getVideoTracks()[0];
  const settings = track?.getSettings() ?? {};
  const kind: CaptureSourceInfo["kind"] =
    (settings as { displaySurface?: string }).displaySurface === "monitor"
      ? "monitor"
      : (settings as { displaySurface?: string }).displaySurface === "window"
        ? "window"
        : (settings as { displaySurface?: string }).displaySurface === "browser"
          ? "browser"
          : "unknown";
  return {
    stream,
    source: {
      id: track?.id ?? "source",
      label: track?.label || "Sumber layar",
      kind,
    },
  };
}

/**
 * Publisher WHIP — mengirim satu MediaStream ke MediaMTX (atau server WHIP
 * lain) untuk didistribusikan ke BANYAK viewer tanpa capture berulang.
 */
export class StreamPublisher {
  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private qualityTimer: ReturnType<typeof setInterval> | null = null;
  private lastBytes = 0;
  private lastStatsAt = 0;
  private frozenChecks = 0;
  private lastFrameHash = "";
  private ev: PublisherEvents;
  private abort = new AbortController();

  constructor(events: PublisherEvents = {}) {
    this.ev = events;
  }

  /** Stream preview lokal (belum tentu dipublikasikan). */
  attach(stream: MediaStream): void {
    this.stream = stream;
    this.startQualityMonitor();
  }

  get localStream(): MediaStream | null {
    return this.stream;
  }

  get connected(): boolean {
    return this.pc?.connectionState === "connected";
  }

  /**
   * Publikasikan stream ke endpoint WHIP.
   * Contoh whipUrl: http://127.0.0.1:8078/mediamtx/bof/whip (via gateway lokal)
   * atau langsung http://127.0.0.1:8889/bof (endpoint WHIP MediaMTX).
   */
  async publish(stream: MediaStream, whipUrl: string): Promise<void> {
    this.abort = new AbortController();
    this.ev.onState?.("connecting", "Menyiapkan koneksi WebRTC ke server siaran…");
    try {
      this.stream = stream;
      const pc = new RTCPeerConnection();
      this.pc = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === "connected") {
          this.ev.onState?.("live");
          this.startStats();
        } else if (s === "failed" || s === "disconnected") {
          this.ev.onState?.("reconnecting", "Koneksi WebRTC terputus — mencoba pulihkan…");
        } else if (s === "closed") {
          this.ev.onState?.("offline");
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitIce(pc);

      const res = await fetch(whipUrl, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription?.sdp ?? "",
        signal: this.abort.signal,
      });
      if (!res.ok) {
        throw new Error(
          `Server WHIP menolak koneksi (HTTP ${res.status}). Pastikan MediaMTX berjalan dan path sesuai.`,
        );
      }
      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
      this.ev.onState?.("starting", "Stream dikirim — menunggu konfirmasi server…");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.ev.onState?.("error", msg);
      throw err;
    }
  }

  /** Reconnect dengan jeda berpasangan dan batas percobaan. */
  async reconnect(whipUrl: string): Promise<boolean> {
    this.ev.onState?.("reconnecting", "Mencoba pulihkan siaran…");
    for (let attempt = 1; attempt <= MAX_RECONNECT; attempt++) {
      if (this.abort.signal.aborted) return false;
      this.ev.onState?.("reconnecting", `Percobaan ${attempt}/${MAX_RECONNECT}…`);
      try {
        await sleep(Math.min(8000, 1000 * 2 ** (attempt - 1)), this.abort.signal);
        if (!this.stream) throw new Error("Sumber video hilang");
        await this.publish(this.stream, whipUrl);
        return true;
      } catch {
        // lanjut percobaan berikutnya
      }
    }
    this.ev.onState?.("error", "Gagal pulih setelah " + MAX_RECONNECT + " percobaan.");
    return false;
  }

  /** Pause sirkulasi frame (tanpa memutus koneksi). */
  pause(): void {
    this.stream?.getVideoTracks().forEach((t) => { t.enabled = false; });
    this.ev.onState?.("paused");
  }

  resume(): void {
    this.stream?.getVideoTracks().forEach((t) => { t.enabled = true; });
    this.ev.onState?.("live");
  }

  async stop(): Promise<void> {
    this.ev.onState?.("stopping");
    this.abort.abort();
    if (this.statsTimer) clearInterval(this.statsTimer);
    if (this.qualityTimer) clearInterval(this.qualityTimer);
    this.statsTimer = null;
    this.qualityTimer = null;
    try { this.pc?.close(); } catch { /* abaikan */ }
    this.pc = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ev.onState?.("offline");
  }

  private startStats(): void {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.lastBytes = 0;
    this.lastStatsAt = Date.now();
    this.statsTimer = setInterval(async () => {
      const pc = this.pc;
      if (!pc) return;
      try {
        const report = await pc.getStats();
        let bytes = 0, frames: number | null = null, ts = 0;
        report.forEach((s) => {
          const r = s as unknown as Record<string, unknown>;
          if (s.type === "outbound-rtp" && r.kind === "video") {
            bytes += Number(r.bytesSent ?? 0);
            frames = (frames ?? 0) + Number(r.framesEncoded ?? 0);
            ts = Math.max(ts, Number(r.timestamp ?? 0));
          }
        });
        const now = Date.now();
        const dt = (now - this.lastStatsAt) / 1000;
        if (this.lastStatsAt && dt > 0 && bytes >= this.lastBytes) {
          const kbps = Math.round(((bytes - this.lastBytes) * 8) / dt / 1000);
          const track = this.stream?.getVideoTracks()[0];
          const st = track?.getSettings() ?? {};
          const fpsStats = ts ? frames : null;
          this.ev.onStats?.({
            bitrateKbps: kbps,
            fps: fpsStats != null && st.frameRate ? Math.round(st.frameRate) : (st.frameRate ? Math.round(st.frameRate) : null),
            resolution: st.width && st.height ? `${st.width}x${st.height}` : null,
            framesSent: frames,
            connectionState: pc.connectionState,
          });
        }
        this.lastBytes = bytes;
        this.lastStatsAt = now;
      } catch {
        // stats boleh gagal sesaat saat renegosiasi
      }
    }, STATS_INTERVAL_MS);
  }

  /** Deteksi layar hitam / frame beku dari sampling canvas (tidak menyimpan video). */
  private startQualityMonitor(): void {
    if (this.qualityTimer) clearInterval(this.qualityTimer);
    this.qualityTimer = setInterval(() => {
      const video = document.querySelector<HTMLVideoElement>("video[data-stikar-preview]");
      const track = this.stream?.getVideoTracks()[0];
      if (!video || !track || track.readyState !== "live" || !video.videoWidth) return;
      const canvas = document.createElement("canvas");
      canvas.width = 48; canvas.height = 27;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      try {
        ctx.drawImage(video, 0, 0, 48, 27);
        const data = ctx.getImageData(0, 0, 48, 27).data;
        let lumaSum = 0;
        for (let i = 0; i < data.length; i += 4) {
          lumaSum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        }
        const avg = lumaSum / (data.length / 4);
        const hash = Array.from(data.slice(0, 512)).join(",");
        const frozen = hash === this.lastFrameHash;
        this.lastFrameHash = hash;
        if (frozen) this.frozenChecks++; else this.frozenChecks = 0;
        this.ev.onQuality?.({
          blackFrames: avg < 6,
          frozenFrames: this.frozenChecks >= 3, // ≥3 sampling berturut (±6 dtk)
          lastFrameAt: Date.now(),
        });
      } catch {
        // frame belum siap
      }
    }, QUALITY_INTERVAL_MS);
  }
}

/**
 * Pemutar WHE (WebRTC-HTTP Egress Protocol) — menerima stream dari MediaMTX.
 * Return null bila gagal; penelepon melakukan fallback ke HLS.
 */
export async function playWHE(
  video: HTMLVideoElement,
  wheUrl: string,
  signal?: AbortSignal,
): Promise<{ pc: RTCPeerConnection; close: () => void } | null> {
  try {
    const pc = new RTCPeerConnection();
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });
    pc.ontrack = (ev) => {
      video.srcObject = ev.streams[0] ?? null;
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIce(pc);
    const res = await fetch(wheUrl, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: pc.localDescription?.sdp ?? "",
      signal,
    });
    if (!res.ok) {
      pc.close();
      return null;
    }
    const answer = await res.text();
    if (signal?.aborted) { pc.close(); return null; }
    await pc.setRemoteDescription({ type: "answer", sdp: answer });
    return {
      pc,
      close: () => { try { pc.close(); } catch { /* abaikan */ } },
    };
  } catch {
    return null;
  }
}
