// ============================================================
// STIKAR BROADCAST AGENT — src/mediamtx.mjs
// ------------------------------------------------------------
// MediaMtxManager: menjalankan MediaMTX sebagai RTSP ingest →
// keluaran WebRTC (WHEP) + HLS untuk browser di LAN.
//  - Binary dicari di: config.mediaMtxPath (PATH/absolute/relative)
//    lalu ./bin/mediamtx(.exe) di folder agent.
//  - File mediamtx-generated.yml ditulis ulang tiap start
//    (rtsp :8554, hls :8888, webrtc :8889, api off, path bof-game).
//  - Health probe TCP ke port WebRTC tiap 2 detik → status running
//    HANYA true bila port benar-benar merespons (jujur).
//  - Binary tidak ada → status error eksplisit "binary tidak ditemukan".
// ============================================================
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { spawn } from "node:child_process";
import { AGENT_ROOT } from "./config.mjs";

// ---------------- Deteksi IP LAN ----------------

/** Semua IPv4 non-internal, diurutkan: 192.168 → 10 → 172.16-31 → lainnya. */
export function getLanIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const it of list || []) {
      if (it && it.family === "IPv4" && !it.internal) out.push(it.address);
    }
  }
  const score = (ip) =>
    ip.startsWith("192.168.") ? 0
      : ip.startsWith("10.") ? 1
        : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2
          : 3;
  out.sort((a, b) => score(a) - score(b));
  return out;
}

export function getPrimaryLanIp() {
  return getLanIps()[0] ?? "127.0.0.1";
}

// ---------------- Util ----------------

/** Cari executable di PATH (sederhana, sinkron). */
function whichSync(name) {
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const exts = process.platform === "win32"
    ? ["", ".exe", ".cmd", ".bat"]
    : [""];
  for (const d of dirs) {
    for (const ext of exts) {
      const p = path.join(d, name + ext);
      try {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
      } catch { /* lanjut */ }
    }
  }
  return null;
}

/** Kill tree di Windows (taskkill /T /F), fallback child.kill. */
function treeKill(child) {
  if (!child) return;
  try {
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    }
    child.kill("SIGTERM");
  } catch { /* abaikan */ }
}

// ---------------- Manager ----------------

export class MediaMtxManager {
  /** @param {object} cfg config agent @param {object} log logger */
  constructor(cfg, log) {
    this.cfg = cfg;
    this.log = log || console;
    this.child = null;
    this.state = {
      running: false,     // HANYA true bila probe TCP ke port WebRTC sukses
      pid: null,
      binPath: null,      // path binary yang ditemukan (null = tidak ketemu)
      error: null,        // pesan error jujur (mis. binary tidak ditemukan)
      startedAt: null,
      lastProbeOkAt: null,
    };
    this.probeTimer = null;
    this.failStreak = 0;
  }

  /** Cari binary MediaMTX. */
  resolveBinary() {
    const candidates = [];
    const p = String(this.cfg.mediaMtxPath || "").trim();
    if (p) {
      if (path.isAbsolute(p) || p.includes("/") || p.includes("\\")) {
        candidates.push(path.resolve(AGENT_ROOT, p));
      } else {
        const onPath = whichSync(p);
        if (onPath) candidates.push(onPath);
        candidates.push(path.join(AGENT_ROOT, p));
      }
    }
    const exe = process.platform === "win32" ? "mediamtx.exe" : "mediamtx";
    candidates.push(path.join(AGENT_ROOT, "bin", exe));
    for (const c of candidates) {
      try {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
      } catch { /* lanjut */ }
    }
    return null;
  }

  /** Tulis mediamtx-generated.yml minimal yang aman lintas versi v1.x. */
  writeYaml() {
    const c = this.cfg;
    const yml = `# Dibuat otomatis oleh STIKAR BROADCAST AGENT — jangan edit manual.
# Sumber: publisher RTSP (ffmpeg meng-push ke rtsp://127.0.0.1:${c.rtspPort}/${c.streamPath})
api: no
rtsp: yes
rtspAddress: :${c.rtspPort}
rtmp: no
hls: yes
hlsAddress: :${c.hlsPort}
hlsVariant: lowLatency
hlsSegmentCount: 4
webrtc: yes
webrtcAddress: :${c.webrtcPort}
logLevel: info
paths:
  ${c.streamPath}:
`;
    const file = path.join(AGENT_ROOT, "mediamtx-generated.yml");
    fs.writeFileSync(file, yml, "utf8");
    return file;
  }

  /** Jalankan MediaMTX. Tidak menjanjikan sukses — status di-update jujur. */
  start() {
    if (this.child) return;
    const bin = this.resolveBinary();
    if (!bin) {
      this.state = {
        running: false, pid: null, binPath: null, startedAt: null, lastProbeOkAt: null,
        error: "binary tidak ditemukan — set mediaMtxPath di config.json atau taruh binary di agent/bin/mediamtx.exe",
      };
      this.log.error(`[MEDIAMTX] ${this.state.error}`);
      return;
    }

    let ymlFile;
    try { ymlFile = this.writeYaml(); } catch (e) {
      this.state = { running: false, pid: null, binPath: bin, startedAt: null, lastProbeOkAt: null, error: `gagal tulis yml: ${e.message}` };
      return;
    }

    let child;
    try {
      child = spawn(bin, ["-conf", ymlFile], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch (e) {
      this.state = { running: false, pid: null, binPath: bin, startedAt: null, lastProbeOkAt: null, error: `gagal spawn: ${e.message}` };
      this.log.error(`[MEDIAMTX] ${this.state.error}`);
      return;
    }

    this.child = child;
    this.failStreak = 0;
    this.state = { running: false, pid: child.pid, binPath: bin, startedAt: Date.now(), lastProbeOkAt: null, error: null };
    this.log.ok(`[MEDIAMTX] Dijalankan: ${bin} (pid ${child.pid}) — menunggu probe port ${this.cfg.webrtcPort}...`);

    const feed = (buf, tag) => {
      for (const line of String(buf).split(/\r?\n/)) {
        const s = line.trim();
        if (s) this.log.debug?.(`[mediamtx ${tag}] ${s}`);
      }
    };
    child.stdout?.on("data", (d) => feed(d, "out"));
    child.stderr?.on("data", (d) => feed(d, "err"));

    child.on("error", (e) => {
      this.state.running = false;
      this.state.error = e.code === "ENOENT"
        ? "binary tidak ditemukan — cek mediaMtxPath di config.json"
        : `spawn error: ${e.message}`;
      this.log.error(`[MEDIAMTX] ${this.state.error}`);
    });

    child.on("exit", (code, signal) => {
      this.child = null;
      this.stopProbe();
      this.state.running = false;
      this.state.error = code != null
        ? `mediamtx keluar (exit code ${code}) — cek log di atas / mediamtx-generated.yml`
        : `mediamtx dihentikan (signal ${signal})`;
      if (code != null && code !== 0) this.log.error(`[MEDIAMTX] ${this.state.error}`);
      else this.log.info(`[MEDIAMTX] ${this.state.error}`);
    });

    this.startProbe();
  }

  /** Probe TCP ke port WebRTC tiap 2 detik. */
  startProbe() {
    this.stopProbe();
    this.probeTimer = setInterval(() => this.probe(), 2000);
    this.probeTimer.unref?.();
  }
  stopProbe() {
    if (this.probeTimer) { clearInterval(this.probeTimer); this.probeTimer = null; }
  }

  probe() {
    if (!this.child) return;
    const port = this.cfg.webrtcPort;
    const sock = net.connect({ host: "127.0.0.1", port });
    sock.setTimeout(1500);
    const done = (ok) => {
      try { sock.destroy(); } catch { /* abaikan */ }
      if (ok) {
        this.failStreak = 0;
        this.state.lastProbeOkAt = Date.now();
        if (!this.state.running) {
          this.state.running = true;
          this.log.ok(`[MEDIAMTX] SIAP — WebRTC merespons di 127.0.0.1:${port}`);
        }
      } else {
        this.failStreak++;
        if (this.failStreak >= 2 && this.state.running) {
          this.state.running = false;
          this.log.warn(`[MEDIAMTX] Tidak merespons di 127.0.0.1:${port} — ditandai TIDAK JALAN (jujur).`);
        }
      }
    };
    sock.on("connect", () => done(true));
    sock.on("timeout", () => done(false));
    sock.on("error", () => done(false));
  }

  /** Snapshot status untuk /api/status & WS state. */
  status() {
    const c = this.cfg;
    const ip = getPrimaryLanIp();
    const hasBin = !!this.state.binPath;
    return {
      running: !!this.state.running,
      path: this.state.binPath ?? null,
      whepUrl: hasBin ? `http://${ip}:${c.webrtcPort}/${c.streamPath}` : null,
      hlsUrl: hasBin ? `http://${ip}:${c.hlsPort}/${c.streamPath}/index.m3u8` : null,
      rtspUrl: hasBin ? `rtsp://127.0.0.1:${c.rtspPort}/${c.streamPath}` : null,
      error: this.state.error ?? null,
    };
  }

  /** Matikan MediaMTX (graceful → taskkill tree). */
  stop() {
    this.stopProbe();
    if (this.child) {
      const child = this.child;
      this.child = null;
      this.log.info("[MEDIAMTX] Dihentikan.");
      treeKill(child);
    }
    this.state.running = false;
  }
}

export default MediaMtxManager;
