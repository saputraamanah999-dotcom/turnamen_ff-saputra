/**
 * STIKAR BROADCAST BRIDGE — Entry point
 *
 * Menjembatani website STIKAR ESPORTS dengan OBS Studio:
 *   website --ws://127.0.0.1:8078--> BRIDGE --obs-websocket ws://127.0.0.1:4455--> OBS Studio
 *
 * Penting:
 *  - Bridge listen HANYA di localhost (127.0.0.1) — OBS WebSocket tidak pernah terekspos internet.
 *  - Bridge tetap berjalan (status disconnected) walau OBS belum aktif — tidak akan crash.
 *  - Password OBS tidak pernah dicatat ke log.
 */

import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { logger } from './logger.js';
import { OBSClient } from './obs/client.js';
import { BridgeServer } from './websocket/server.js';
import { LocalGateway } from './gateway/http.js';
import { getWhitelist, reloadConfig } from './security/whitelist.js';
import { runFirstTimeSetup, ROOT_DIR } from './setup.js';
import { MediaMTXManager } from './mediamtx.js';
import { listLanInterfaces, bestLanIp } from './netinfo.js';
import { Heartbeat } from './heartbeat.js';
import path from 'node:path';

// Auto-setup: buat .env + token + baca password OBS + config.json bila belum ada.
runFirstTimeSetup();

// Muat variabel .env: OBS_WS_URL, OBS_PASSWORD, BRIDGE_PORT, BRIDGE_TOKEN, dst.
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

logger.info('==========================================');
logger.info('  STIKAR BROADCAST BRIDGE — mulai');
logger.info('==========================================');

// ---------- Konfigurasi dari .env ----------
const OBS_WS_URL = process.env.OBS_WS_URL || 'ws://127.0.0.1:4455';
const OBS_PASSWORD = process.env.OBS_PASSWORD || ''; // rahasia — jangan pernah di-log
const BRIDGE_HOST = process.env.BRIDGE_HOST || '127.0.0.1'; // default: localhost SAJA (aman)
const BRIDGE_PORT = Number.parseInt(process.env.BRIDGE_PORT || '8078', 10) || 8078;
// Local Broadcast Gateway (PHASE 2): melayani TV/HP di jaringan lokal.
const GATEWAY_ENABLED = process.env.GATEWAY_ENABLED !== 'false';
const GATEWAY_PORT = Number.parseInt(process.env.GATEWAY_PORT || '8080', 10) || 8080;
const MEDIAMTX_PATH = process.env.MEDIAMTX_PATH || 'bof-main';
const AUTO_START_MEDIAMTX = process.env.AUTO_START_MEDIAMTX !== 'false';
// Website resmi yang boleh mengambil token otomatis lewat /api/bootstrap (dari browser di laptop ini).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://turnamen-ff-saputra.vercel.app')
  .split(',').map((x) => x.trim().replace(/\/$/, '')).filter(Boolean);

let BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || '';
if (!BRIDGE_TOKEN) {
  // Tanpa token = celah keamanan. Supaya bridge tetap bisa dipakai untuk uji coba,
  // buat token acak sekali jalan (hanya berlaku untuk sesi ini) lalu ingatkan operator.
  BRIDGE_TOKEN = crypto.randomBytes(24).toString('hex');
  logger.warn('BRIDGE_TOKEN belum diisi di .env — token sementara acak dibuat untuk sesi ini.');
  logger.warn(`Gunakan token sementara berikut untuk sambungan lokal: ${BRIDGE_TOKEN}`);
  logger.warn('Untuk produksi: isi BRIDGE_TOKEN dengan token kuat di file .env.');
}

// Muat config.json (scene whitelist + sumber overlay)
reloadConfig();
logger.info(`Scene whitelist: ${getWhitelist().join(' | ')}`);

// ---------- Koneksi OBS (auto-reconnect, tidak crash walau OBS belum jalan) ----------
const obs = new OBSClient({ url: OBS_WS_URL, password: OBS_PASSWORD });

// ---------- WebSocket server untuk website ----------
const server = new BridgeServer({ port: BRIDGE_PORT, host: BRIDGE_HOST, token: BRIDGE_TOKEN, obs });

// ---------- Local Broadcast Gateway (Mode A — TV & HP di LAN) ----------
let gateway = null;
if (GATEWAY_ENABLED) {
  gateway = new LocalGateway({
    port: GATEWAY_PORT, token: BRIDGE_TOKEN, bridge: server, defaultPath: MEDIAMTX_PATH,
    wsPort: BRIDGE_PORT, allowedOrigins: ALLOWED_ORIGINS, mediamtxManager: null,
  });
}

// ---------- MediaMTX otomatis (dijalankan bridge, tidak perlu klik manual) ----------
const mediamtx = new MediaMTXManager({
  streamPath: MEDIAMTX_PATH,
  getHosts: () => listLanInterfaces().filter((i) => !i.virtual).map((i) => i.address),
});
if (gateway) gateway.mtx = mediamtx;

// ---------- Heartbeat status → Firestore (admin dari perangkat mana pun bisa lihat running/belum) ----------
let heartbeat = null;
if (GATEWAY_ENABLED) {
  heartbeat = new Heartbeat({
    tournamentId: MEDIAMTX_PATH,
    snapshot: () => ({
      lanIp: bestLanIp()?.address ?? null,
      gatewayPort: GATEWAY_PORT,
      gatewayUp: Boolean(gateway),
      mediamtxUp: Boolean(gateway?.mediamtxUp),
      obsConnected: obs.connected,
      streaming: Boolean(obs.streaming ?? false),
      viewers: gateway ? gateway.viewers.size : 0,
    }),
  });
}

// Ketahanan proses: jangan sampai bridge mati di tengah pertunjukan karena error tak terduga.
// (Error OBS ditangani rapi di obs/client.js; ini lapisan tambahan.)
process.on('unhandledRejection', (reason) => {
  logger.error(`unhandledRejection: ${reason instanceof Error ? reason.message : String(reason)}`);
});
process.on('uncaughtException', (err) => {
  logger.error(`uncaughtException: ${err && err.message ? err.message : String(err)}`);
});

// Setiap ada perubahan di OBS (connect/disconnect, stream/record mulai-berhenti, ganti scene)
// -> broadcast status terbaru ke semua klien website yang terhubung.
obs.on('changed', async (reason) => {
  try {
    const status = await obs.getStatus();
    let outputs = null;
    if (obs.connected) {
      try {
        outputs = await obs.getOutputStatus();
        obs.streaming = Boolean(outputs?.stream?.active); // cache untuk heartbeat
      } catch {
        /* abaikan */
      }
    }
    server.broadcast({ type: 'event', event: 'obs-update', data: { reason, ...status, outputs } });
  } catch (err) {
    logger.warn(`Gagal broadcast status OBS: ${err.message}`);
  }
});

// ---------- Start ----------
await obs.start(); // aman walau OBS belum aktif (akan reconnect otomatis)
server.start();
if (gateway) gateway.start();
if (AUTO_START_MEDIAMTX) await mediamtx.start();
if (heartbeat) heartbeat.start();

logger.info(
  `Website konek ke ws://${BRIDGE_HOST}:${BRIDGE_PORT}?token=... (token dari BRIDGE_TOKEN di .env)`
);
if (gateway) {
  logger.info(`Local Gateway aktif di port ${GATEWAY_PORT} — TV buka http://<ip-laptop>:${GATEWAY_PORT}/display/${MEDIAMTX_PATH}`);
}

// ---------- Ringkasan untuk operator ----------
{
  const best = bestLanIp();
  const ip = best ? best.address : null;
  const line = '─'.repeat(64);
  console.log(`\n${line}`);
  console.log('  STIKAR BROADCAST BRIDGE — SIAP');
  console.log(line);
  console.log(`  IP laptop (terdeteksi) : ${ip ?? '(belum tersambung ke jaringan!)'}${best ? `  [${best.name}]` : ''}`);
  if (ip && gateway) {
    console.log(`  Link TV / HP penonton  : http://${ip}:${GATEWAY_PORT}/display`);
  }
  console.log(`  Website admin          : buka halaman Admin → Broadcast di BROWSER LAPTOP INI`);
  console.log(`                           (konek otomatis, tidak perlu isi token manual)`);
  console.log(`  Token bridge           : ${BRIDGE_TOKEN}`);
  console.log(`  Firewall Windows       : izinkan Node.js (Private network) saat popup muncul`);
  console.log(`${line}\n`);
}

// ---------- Graceful shutdown ----------
async function shutdown(signal) {
  logger.warn(`Menerima sinyal ${signal} — mematikan bridge...`);
  try {
    await server.stop();
  } catch {
    /* abaikan */
  }
  try {
    if (gateway) await gateway.stop();
  } catch {
    /* abaikan */
  }
  try {
    obs.stop();
  } catch {
    /* abaikan */
  }
  try {
    mediamtx.stop();
  } catch {
    /* abaikan */
  }
  try {
    if (heartbeat) heartbeat.stop();
  } catch {
    /* abaikan */
  }
  await logger.close(); // pastikan log terakhir tercatat ke file
  logger.ok('Bridge dimatikan dengan aman. Sampai jumpa!');
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
