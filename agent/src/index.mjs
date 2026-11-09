// ============================================================
// STIKAR BROADCAST AGENT — entry point
// Menjalankan seluruh sistem di komputer produksi (PC Free Fire):
//   deteksi jendela → MediaMTX → ffmpeg capture → HTTP API + WS input
// Jalankan: `node src/index.mjs` atau start.bat
// ============================================================
import os from "node:os";
import { AGENT_NAME, VERSION, AGENT_ROOT, loadConfig } from "./config.mjs";
import { initLogger, log } from "./logger.mjs";
import * as windows from "./windows.mjs";
import { InputForwarder } from "./input.mjs";
import { CaptureManager } from "./capture.mjs";
import { MediaMtxManager, getLanIps, getPrimaryLanIp } from "./mediamtx.mjs";
import { AgentWsHub } from "./ws.mjs";
import { createHttpServer } from "./httpapi.mjs";

// ---------- 1 · Config ----------
const loaded = loadConfig();
const config = loaded.config;
initLogger({ agentRoot: AGENT_ROOT, logFile: config.logFile });

log.banner([
  "  STIKAR BROADCAST AGENT v" + VERSION,
  "  " + AGENT_NAME + " — Battle Off Friends (BOF)",
  "  SMK TI BALI GLOBAL KARANGASEM · SAPUTRA DEVELOPER",
  "",
  "  LOKASI            : " + AGENT_ROOT,
  "  PORT HTTP/WS      : " + config.httpPort,
  "  adminToken        : " + config.adminToken + (loaded.generated.adminToken ? "  (BARU — simpan!)" : ""),
  "  viewerToken       : " + config.viewerToken + (loaded.generated.viewerToken ? "  (BARU — simpan!)" : ""),
]);

// ---------- 2 · Modul jendela ----------
windows.setGameTitles(config.gameTitles);
windows.initWindows({ log });
let windowError = windows.refresh().catch((e) => {
  log.warn("[WINDOWS] Deteksi pertama gagal: " + (e?.message || e));
  return null;
});
setInterval(() => { windows.refresh().catch(() => {}); }, 2000);

// ---------- 3 · Input forwarding (koffi/user32) ----------
const input = new InputForwarder(config, log);
await input.init();

// ---------- 4 · MediaMTX ----------
const mediamtx = new MediaMtxManager(config, log);
await mediamtx.start();

// ---------- 5 · Capture (ffmpeg) ----------
const capture = new CaptureManager(config, log, windows);

// ---------- 6 · Status aggregator (kontrak = src/services/agent/client.ts) ----------
let cpuPercent = null;
let _cpuPrev = null;
function sampleCpu() {
  try {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    for (const c of cpus) {
      const t = c.times;
      total += t.user + t.nice + t.sys + t.idle + t.irq;
      idle += t.idle;
    }
    if (_cpuPrev) {
      const dTotal = total - _cpuPrev.total;
      const dIdle = idle - _cpuPrev.idle;
      if (dTotal > 0) cpuPercent = Math.max(0, Math.min(100, Math.round((1 - dIdle / dTotal) * 100)));
    }
    _cpuPrev = { total, idle };
  } catch { cpuPercent = null; }
}
sampleCpu();
setInterval(sampleCpu, 5000);

function gameStatusFrom(gw, capActive, mtxRunning) {
  if (!gw) return "not-found";
  if (gw.minimized) return "waiting";
  if (capActive && mtxRunning) return "stream-ready";
  if (capActive) return "capture-ready";
  return "detected";
}

function buildStatus() {
  const gw = windows.findGameWindow();
  const cap = capture.publicInfo();
  const mtx = mediamtx.status();
  const ctl = wsHub ? wsHub.getControllerInfo() : { id: null, device: null, since: null };
  const counts = wsHub ? wsHub.getCounts() : { clients: 0, viewers: 0 };
  return {
    ok: true,
    agent: AGENT_NAME,
    version: VERSION,
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()} (${process.platform})`,
    uptimeSec: Math.round(process.uptime()),
    game: gameStatusFrom(gw, cap.active, mtx.running),
    gameTitle: gw ? gw.title : null,
    gameProcess: gw ? (gw.process || null) : null,
    window: gw && gw.rect ? gw.rect : null,
    capture: cap,
    input: {
      enabled: !!config.inputEnabled,
      controllerLock: !!config.controllerLock,
      controllerId: ctl.id,
      controllerDevice: ctl.device,
      controllerSince: ctl.since,
      clients: counts.clients,
      viewers: counts.viewers,
      eventsForwarded: input.stats.forwarded,
      estopped: wsHub ? wsHub.isEstopped() : false,
    },
    mediamtx: {
      running: !!mtx.running,
      path: mtx.path ?? null,
      whepUrl: mtx.whepUrl ?? null,
      hlsUrl: mtx.hlsUrl ?? null,
      rtspUrl: mtx.rtspUrl ?? null,
    },
    network: { ips: getLanIps(), httpPort: config.httpPort },
    cpuPercent,
    memoryMb: Math.round((process.memoryUsage().rss / 1048576) * 10) / 10,
    quality: config.quality,
  };
}

// ---------- 7 · WebSocket hub ----------
const wsHub = new AgentWsHub({
  log,
  getConfig: () => config,
  getStatus: buildStatus,
  input,
  windows,
});

// ---------- 8 · HTTP API ----------
const server = createHttpServer({
  log,
  getConfig: () => config,
  saveConfig: loaded.save,
  saveConfigPatch: loaded.savePatch,
  capture,
  mediamtx,
  windows,
  wsHub,
  buildStatus,
  getLanIps,
});
wsHub.attach(server);
await new Promise((resolve) => server.listen(config.httpPort, () => resolve()));
log.ok(`[HTTP] API + WS siap di port ${config.httpPort}`);

// ---------- 9 · Broadcast state ke klien tiap 2 detik ----------
setInterval(() => { try { wsHub.broadcastState(); } catch { /* jangan crash */ } }, 2000);

// ---------- 10 · Ringkasan startup ----------
await windowError;
const ip = getPrimaryLanIp() || "127.0.0.1";
const gw = windows.findGameWindow();
log.banner([
  "  AGENT BERJALAN ✔",
  "",
  `  Dashboard lokal   : http://localhost:${config.httpPort}/`,
  `  Dari perangkat LAN: http://${ip}:${config.httpPort}/`,
  `  Video (WHEP)      : ${mediamtx.status().whepUrl ?? "(MediaMTX belum siap)"}`,
  `  Game terdeteksi   : ${gw ? gw.title + (gw.minimized ? " — MINIMIZE (tunggu)" : "") : "GAME NOT FOUND"}`,
  `  Input forwarding  : ${input.available ? "AKTIF (koffi/user32)" : "MATI — " + input.unavailableReason}`,
  "",
  "  LANGKAH BERIKUTNYA:",
  "  1. Buka website → /admin/interactive-stream",
  `  2. Isi URL Agent : http://${ip}:${config.httpPort}`,
  "  3. Isi token admin di atas → CONNECT",
  "  4. Pilih sumber (Free Fire Window) → MULAI CAPTURE",
  "  5. HP: satu Wi-Fi → buka /live/interactive + viewerToken",
  "",
  "  CTRL+C untuk berhenti dengan aman.",
]);

// ---------- 11 · Graceful shutdown ----------
let shuttingDown = false;
async function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.warn("[SHUTDOWN] " + reason + " — mematikan capture & MediaMTX…");
  try { await capture.stop("shutdown"); } catch { /* lanjut */ }
  try { wsHub.stop(); } catch { /* lanjut */ }
  try { mediamtx.stop(); } catch { /* lanjut */ }
  try { server.close(); } catch { /* lanjut */ }
  log.ok("[SHUTDOWN] Selesai. Sampai jumpa!");
  setTimeout(() => process.exit(0), 400);
}
process.on("SIGINT", () => shutdown("CTRL+C"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (e) => {
  log.error("[UNCAUGHT] " + (e?.stack || e?.message || e));
  // JANGAN exit — agent harus tetap hidup selama pertandingan; laporkan jujur.
});
process.on("unhandledRejection", (e) => {
  log.error("[UNHANDLED] " + ((e && (e.stack || e.message)) || e));
});
