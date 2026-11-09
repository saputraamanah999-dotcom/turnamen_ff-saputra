// ============================================================
// STIKAR BROADCAST AGENT — src/capture.mjs
// ------------------------------------------------------------
// CaptureManager: menangkap jendela game (gdigrab `-i title=...`)
// atau seluruh desktop (`-i desktop`) dengan ffmpeg, lalu encode
// H.264 dan push ke MediaMTX via RTSP.
//
// Jujur-jujuran:
//  - ffmpeg tidak ada → error eksplisit "ffmpeg tidak ditemukan",
//    TIDAK ada status capture aktif palsu.
//  - Jendela minimize → tolak start (gdigrab tidak bisa capture
//    jendela minimize — keterbatasan resmi).
//  - stderr diparse: frame/fps/bitrate + resolusi; ffmpeg keluar
//    gagal → status failed + tail stderr dilog apa adanya.
//  - Capture tetap jalan meski jendela hilang, tapi warning
//    "video mungkin beku" dilog tiap 10 detik.
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { AGENT_ROOT } from "./config.mjs";

/** Preset kualitas (harus konsisten dengan label di website). high = native tanpa scale. */
export const QUALITY_PRESETS = {
  low: { bitrateKbps: 2500, fps: 24, scale: "1280:720" },
  medium: { bitrateKbps: 5000, fps: 30, scale: "1600:900" },
  high: { bitrateKbps: 8000, fps: 60, scale: null },
};

/** Cari executable di PATH (sederhana, sinkron). */
function whichSync(name) {
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
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

function treeKill(child) {
  if (!child) return;
  try {
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    }
    child.kill("SIGTERM");
  } catch { /* abaikan */ }
}

export class CaptureManager {
  /**
   * @param {object} cfg config agent
   * @param {object} log logger
   * @param {object} windowsMod modul windows (listWindows/findGameWindow) — untuk
   *   resolusi sumber & peringatan "jendela hilang saat capture".
   */
  constructor(cfg, log, windowsMod) {
    this.cfg = cfg;
    this.log = log || console;
    this.windows = windowsMod;
    this.child = null;

    // State internal lengkap (publicInfo() yang membatasi ke interface resmi)
    this.state = {
      active: false,
      sourceId: null,
      sourceTitle: null,
      sourceKind: null,          // "window" | "desktop"
      requestedFps: 0,
      fps: 0,
      width: 0,
      height: 0,
      bitrateKbps: 0,
      startedAt: null,
      lastFrameAt: null,
      frames: 0,
      framesDropped: 0,
      quality: null,
      error: null,
    };

    this._intentionalStop = false;
    this._stderrTail = [];      // ring buffer baris stderr (max 15)
    this._section = null;       // "input" | "output" — untuk parse resolusi
    this._lineBuf = "";
    this._monitorTimer = null;
    this._lastWindowWarnAt = 0;
    this._stallWarnedAt = 0;
    this._stopWaiters = [];
  }

  // ---------------- ffmpeg ----------------

  resolveFfmpeg() {
    const candidates = [];
    const p = String(this.cfg.ffmpegPath || "").trim();
    if (p) {
      if (path.isAbsolute(p) || p.includes("/") || p.includes("\\")) {
        candidates.push(path.resolve(AGENT_ROOT, p));
      } else {
        const onPath = whichSync(p);
        if (onPath) candidates.push(onPath);
        candidates.push(path.join(AGENT_ROOT, p));
      }
    }
    const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
    candidates.push(path.join(AGENT_ROOT, "bin", exe));
    for (const c of candidates) {
      try {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
      } catch { /* lanjut */ }
    }
    return null;
  }

  // ---------------- Status ----------------

  /** Info capture dengan bentuk EXACT sesuai interface AgentCaptureInfo (client.ts). */
  publicInfo() {
    const s = this.state;
    return {
      active: !!s.active,
      sourceId: s.sourceId,
      sourceTitle: s.sourceTitle,
      fps: s.fps || 0,
      width: s.width || 0,
      height: s.height || 0,
      bitrateKbps: s.bitrateKbps || 0,
      startedAt: s.startedAt,
      lastFrameAt: s.lastFrameAt,
      framesDropped: s.framesDropped || 0,
    };
  }

  // ---------------- Kontrol ----------------

  /**
   * Mulai capture. @returns {Promise<{ok:boolean, error?:string}>}
   * Tidak pernah melempar exception ke pemanggil.
   */
  async start(sourceId, quality) {
    const q = QUALITY_PRESETS[quality] ? quality : (this.cfg.quality in QUALITY_PRESETS ? this.cfg.quality : "high");
    const preset = QUALITY_PRESETS[q];

    const ffmpegBin = this.resolveFfmpeg();
    if (!ffmpegBin) {
      return { ok: false, error: "ffmpeg tidak ditemukan — set ffmpegPath di config.json (atau taruh ffmpeg.exe di agent/bin/)" };
    }

    // Resolusi sumber
    let entry = null;
    if (typeof sourceId === "string" && sourceId.startsWith("desktop:")) {
      entry = { id: sourceId, title: "Seluruh Desktop (layar utama)", kind: "desktop", rect: null, minimized: false };
    } else {
      const list = this.windows ? this.windows.listWindows() : [];
      entry = list.find((w) => w.id === sourceId) || null;
      if (!entry) {
        return { ok: false, error: "Sumber tidak ditemukan — refresh daftar sumber (jendela mungkin sudah tertutup)" };
      }
      if (entry.minimized) {
        return { ok: false, error: "Jendela sedang minimize — perlihatkan dulu jendelanya (gdigrab tidak bisa capture jendela minimize)" };
      }
    }

    // Sudah aktif → stop dulu (restart idempoten)
    if (this.child) await this.stop("restart");

    const c = this.cfg;
    const bitrate = preset.bitrateKbps;
    const fps = preset.fps;
    const encoder = c.encoder === "h264_nvenc" ? "h264_nvenc" : "libx264";

    // ---- Susun argumen ffmpeg ----
    const args = ["-hide_banner", "-loglevel", "info", "-stats"];
    if (entry.kind === "window") {
      // gdigrab per-jendela: `title=<judul>` (tanpa shell → aman untuk spasi)
      args.push("-f", "gdigrab", "-framerate", String(fps), "-i", `title=${entry.title}`);
    } else {
      // desktop penuh (layar utama). Crop offset/size opsional bila rect ada.
      args.push("-f", "gdigrab");
      if (entry.rect) {
        args.push("-offset_x", String(entry.rect.x), "-offset_y", String(entry.rect.y));
        args.push("-video_size", `${entry.rect.width}x${entry.rect.height}`);
      }
      args.push("-framerate", String(fps), "-i", "desktop");
    }

    // scale hanya bila preset mendefinisikan (high = native, tanpa -vf)
    if (preset.scale) args.push("-vf", `scale=${preset.scale}`);

    args.push(
      "-c:v", encoder,
    );
    if (encoder === "libx264") {
      args.push("-preset", "ultrafast", "-tune", "zerolatency");
    } else if (encoder === "h264_nvenc") {
      args.push("-preset", "p1", "-tune", "ll", "-rc", "cbr");
    }
    args.push(
      "-pix_fmt", "yuv420p",
      "-b:v", `${bitrate}k`,
      "-maxrate", `${bitrate}k`,
      "-bufsize", `${bitrate * 2}k`,
      "-g", String(fps * 2),
      "-rtsp_transport", "tcp",
      "-f", "rtsp",
      `rtsp://127.0.0.1:${c.rtspPort}/${c.streamPath}`,
    );

    // ---- Reset state & spawn ----
    this.state = {
      active: true,
      sourceId: entry.id,
      sourceTitle: entry.title,
      sourceKind: entry.kind,
      requestedFps: fps,
      fps: 0,
      width: preset.scale ? Number(preset.scale.split(":")[0]) : 0,
      height: preset.scale ? Number(preset.scale.split(":")[1]) : 0,
      bitrateKbps: bitrate,
      startedAt: Date.now(),
      lastFrameAt: null,
      frames: 0,
      framesDropped: 0,
      quality: q,
      error: null,
    };
    this._intentionalStop = false;
    this._stderrTail = [];
    this._section = null;
    this._lineBuf = "";

    this.log.info(`[CAPTURE] start: ${entry.title} (${entry.kind}) quality=${q} encoder=${encoder} → rtsp://127.0.0.1:${c.rtspPort}/${c.streamPath}`);
    this.log.debug?.("[CAPTURE] ffmpeg " + args.join(" "));

    let child;
    try {
      child = spawn(ffmpegBin, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch (e) {
      this.state.active = false;
      this.state.error = `gagal spawn ffmpeg: ${e.message}`;
      this.log.error(`[CAPTURE] ${this.state.error}`);
      return { ok: false, error: this.state.error };
    }
    this.child = child;

    child.stdout?.on("data", () => { /* ffmpeg mengeluarkan semuanya di stderr */ });
    child.stderr?.on("data", (d) => this._onStderr(d));
    child.on("error", (e) => {
      this.state.error = `ffmpeg error: ${e.message}`;
      this.log.error(`[CAPTURE] ${this.state.error}`);
    });
    child.on("exit", (code, signal) => this._onExit(code, signal));

    this._startMonitor();
    return { ok: true };
  }

  /** Hentikan capture (aman dipanggil walau tidak aktif). */
  async stop(reason = "manual") {
    const child = this.child;
    if (!child) return;
    this._intentionalStop = true;
    this.log.info(`[CAPTURE] stop (${reason}).`);
    treeKill(child);
    // tunggu exit maksimal 3 detik
    await new Promise((resolve) => {
      const t = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* abaikan */ } resolve(); }, 3000);
      child.once("exit", () => { clearTimeout(t); resolve(); });
    });
  }

  /** Ganti kualitas: restart capture dengan preset baru (bila aktif). */
  async restartWithQuality(quality) {
    if (!this.child) return { ok: false, error: "capture tidak aktif" };
    const { sourceId } = this.state;
    return this.start(sourceId, quality);
  }

  // ---------------- Parsing stderr ----------------

  _onStderr(chunk) {
    this._lineBuf += String(chunk);
    // ffmpeg menulis stat dengan \r — split semuanya
    const parts = this._lineBuf.split(/\r\n|\n|\r/);
    this._lineBuf = parts.pop() || "";
    for (const line of parts) this._onLine(line);
  }

  _onLine(rawLine) {
    const line = rawLine.trim();
    if (!line) return;

    // simpan tail untuk pesan error yang jujur
    this._stderrTail.push(line);
    if (this._stderrTail.length > 15) this._stderrTail.shift();

    // Section input/output → resolusi stream
    if (/^Input #0/.test(line)) this._section = "input";
    else if (/^Output #0/.test(line)) this._section = "output";

    if (/Video:/.test(line)) {
      const m = /(\d{2,5})x(\d{2,5})/.exec(line);
      if (m) {
        const w = Number(m[1]); const h = Number(m[2]);
        if (this._section === "input" && this.state.sourceKind === "window" && !this.state.width) {
          // ukuran jendela aktual (sebelum scale) — fallback info
          this.log.debug?.(`[CAPTURE] input ${w}x${h}`);
        }
        if (this._section === "output") {
          this.state.width = w;
          this.state.height = h;
        }
      }
    }

    // Baris statistik: frame= N fps= Q bitrate= B
    if (/frame=\s*\d+/.test(line)) {
      const f = /frame=\s*(\d+)/.exec(line);
      const fpsM = /fps=\s*([\d.]+)/.exec(line);
      const brM = /bitrate=\s*([\d.]+)\s*(k|M)?bits\/s/i.exec(line);
      if (f) this.state.frames = Number(f[1]);
      if (fpsM) this.state.fps = Math.round(Number(fpsM[1]) * 10) / 10;
      if (brM) {
        const val = Number(brM[1]);
        const unit = (brM[2] || "k").toLowerCase();
        this.state.bitrateKbps = Math.round(unit === "m" ? val * 1000 : unit === "k" ? val : val / 1000);
      }
      this.state.lastFrameAt = Date.now();
      return;
    }

    // Pesan error yang dikenal → hint jujur
    if (/Could not find window/i.test(line)) {
      this.state.error = "gdigrab: window tidak ditemukan — judul jendela berubah? Refresh sumber di panel.";
    } else if (/Error opening output|Error while opening encoder|Conversion failed|Failed to update header/i.test(line)) {
      this.state.error = `ffmpeg: ${line.slice(0, 200)}`;
    } else if (/Unable to parse option value|Invalid argument|Option not found/i.test(line)) {
      this.state.error = `ffmpeg argumen tidak valid: ${line.slice(0, 200)}`;
    }
  }

  // ---------------- Monitor 1 detik ----------------

  _startMonitor() {
    this._stopMonitor();
    this._monitorTimer = setInterval(() => this._monitorTick(), 1000);
    this._monitorTimer.unref?.();
  }
  _stopMonitor() {
    if (this._monitorTimer) { clearInterval(this._monitorTimer); this._monitorTimer = null; }
  }

  _monitorTick() {
    if (!this.child) return;
    const now = Date.now();

    // Jendela game hilang / minimize saat capture jalan → warning tiap 10 detik.
    const gw = this.windows ? this.windows.findGameWindow() : null;
    if (this.state.sourceKind === "window" && (!gw || gw.minimized)) {
      if (now - this._lastWindowWarnAt > 10000) {
        this._lastWindowWarnAt = now;
        this.log.warn("[CAPTURE] Capture berjalan tapi jendela game hilang/minimize — video mungkin beku (gdigrab tidak bisa melihat jendela minimize).");
      }
    }

    // Frame stall → counter framesDropped naik (proxy jujur, bukan angka resmi encoder).
    if (this.state.lastFrameAt && now - this.state.lastFrameAt > 2500) {
      this.state.framesDropped++;
      if (now - this._stallWarnedAt > 10000) {
        this._stallWarnedAt = now;
        this.log.warn("[CAPTURE] Tidak ada frame baru >2.5 detik — stream mungkin stall/putus.");
      }
    } else if (this.state.lastFrameAt) {
      this._stallWarnedAt = 0;
    }
  }

  // ---------------- Exit ----------------

  _onExit(code, signal) {
    this._stopMonitor();
    this.child = null;
    const intentional = this._intentionalStop;
    this._intentionalStop = false;
    if (intentional) {
      this.state.active = false;
      this.state.error = null;
      this.log.info("[CAPTURE] ffmpeg dihentikan dengan rapi.");
      return;
    }
    this.state.active = false;
    const tail = this._stderrTail.slice(-6).join(" | ");
    if (!this.state.error) {
      this.state.error = `ffmpeg keluar tak terduga (code ${code ?? "-"} signal ${signal ?? "-"})`;
    }
    this.log.error(`[CAPTURE] GAGAL — ${this.state.error}`);
    if (tail) this.log.error(`[CAPTURE] stderr tail: ${tail.slice(0, 500)}`);
  }
}

export default CaptureManager;
