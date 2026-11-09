/**
 * ZEROID BROADCAST BRIDGE — Entry point
 *
 * Menjembatani website ZEROID ESPORTS dengan OBS Studio:
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
import { getWhitelist, reloadConfig } from './security/whitelist.js';

// Muat variabel .env: OBS_WS_URL, OBS_PASSWORD, BRIDGE_PORT, BRIDGE_TOKEN, dst.
dotenv.config();

logger.info('==========================================');
logger.info('  ZEROID BROADCAST BRIDGE — mulai');
logger.info('==========================================');

// ---------- Konfigurasi dari .env ----------
const OBS_WS_URL = process.env.OBS_WS_URL || 'ws://127.0.0.1:4455';
const OBS_PASSWORD = process.env.OBS_PASSWORD || ''; // rahasia — jangan pernah di-log
const BRIDGE_HOST = process.env.BRIDGE_HOST || '127.0.0.1'; // default: localhost SAJA (aman)
const BRIDGE_PORT = Number.parseInt(process.env.BRIDGE_PORT || '8078', 10) || 8078;

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

logger.info(
  `Website konek ke ws://${BRIDGE_HOST}:${BRIDGE_PORT}?token=... (token dari BRIDGE_TOKEN di .env)`
);

// ---------- Graceful shutdown ----------
async function shutdown(signal) {
  logger.warn(`Menerima sinyal ${signal} — mematikan bridge...`);
  try {
    await server.stop();
  } catch {
    /* abaikan */
  }
  try {
    obs.stop();
  } catch {
    /* abaikan */
  }
  await logger.close(); // pastikan log terakhir tercatat ke file
  logger.ok('Bridge dimatikan dengan aman. Sampai jumpa!');
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
