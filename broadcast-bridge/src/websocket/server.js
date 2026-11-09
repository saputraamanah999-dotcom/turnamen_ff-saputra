/**
 * ZEROID BROADCAST BRIDGE — WebSocket server untuk website
 *
 * Dibuat dengan paket 'ws' murni (ringan, tanpa socket.io).
 * Keamanan:
 *  - Listen HANYA di host lokal (default 127.0.0.1) port 8078 — tidak pernah 0.0.0.0
 *  - Koneksi hanya dari localhost / LAN privat (cek remoteAddress)
 *  - Auth token via query ?token=... dicocokkan dengan BRIDGE_TOKEN dari .env
 *  - Rate limit per koneksi: maks 30 pesan per detik
 *  - Broadcast status OBS ke semua klien yang sudah ter-autentikasi
 */

import { WebSocketServer } from 'ws';
import { logger } from '../logger.js';
import {
  isAllowedRemoteAddress,
  isValidToken,
  extractTokenFromRequest,
  createRateLimiter,
} from '../security/auth.js';
import { handleCommand } from '../commands/handlers.js';

// Kode close khusus aplikasi (4000-4999 = rentang aplikasi)
const CLOSE_INVALID_TOKEN = 4001; // token salah / tidak ada
const CLOSE_FORBIDDEN_ADDRESS = 4003; // bukan localhost/LAN privat
const CLOSE_RATE_LIMIT = 4008; // melebihi rate limit

const RATE_LIMIT_MAX = 30; // pesan per detik (sesuai spesifikasi)
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_VIOLATIONS = 10; // jumlah pelanggaran sebelum koneksi diputus
const MAX_PAYLOAD_BYTES = 64 * 1024; // tolak pesan raksasa
const READY_STATE_OPEN = 1;

export class BridgeServer {
  /**
   * @param {object} opts
   * @param {number} opts.port  port listen (default 8078)
   * @param {string} opts.host  host listen (default 127.0.0.1 — JANGAN 0.0.0.0)
   * @param {string} opts.token BRIDGE_TOKEN dari .env
   * @param {object} opts.obs   instance OBSClient
   */
  constructor({ port = 8078, host = '127.0.0.1', token, obs }) {
    this.port = port;
    this.host = host;
    this.token = token || '';
    this.obs = obs;
    this.wss = null;
    this._heartbeat = null;
  }

  /** Jalankan WebSocket server */
  start() {
    this.wss = new WebSocketServer({
      // KUNCI KEAMANAN: bind ke localhost saja, bukan 0.0.0.0
      host: this.host,
      port: this.port,
      maxPayload: MAX_PAYLOAD_BYTES,
    });

    this.wss.on('connection', (ws, req) => this._onConnection(ws, req));
    this.wss.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        logger.error(`Port ${this.port} sudah dipakai aplikasi lain — ubah BRIDGE_PORT di .env lalu jalankan ulang`);
        process.exit(1);
      }
      logger.error(`WebSocket server error: ${err.message}`);
    });
    this.wss.on('listening', () => {
      logger.ok(`ZEROID Broadcast Bridge siap di ws://${this.host}:${this.port} (hanya localhost/LAN)`);
    });

    // Heartbeat: ping klien secara berkala agar koneksi mati terdeteksi & dibersihkan
    this._heartbeat = setInterval(() => {
      if (!this.wss) return;
      for (const client of this.wss.clients) {
        if (client.isAlive === false) {
          try {
            client.terminate();
          } catch {
            /* abaikan */
          }
          continue;
        }
        client.isAlive = false;
        try {
          client.ping();
        } catch {
          /* abaikan */
        }
      }
    }, 30000);
  }

  /** Jumlah klien yang sedang ter-autentikasi */
  clientCount() {
    if (!this.wss) return 0;
    let n = 0;
    for (const c of this.wss.clients) {
      if (c.isAuthed) n += 1;
    }
    return n;
  }

  /** Handler koneksi baru: cek alamat -> cek token -> pasang listener */
  _onConnection(ws, req) {
    ws.isAuthed = false;
    ws.isAlive = true;
    const remote = req.socket.remoteAddress || '(tidak diketahui)';

    // (1) HANYA localhost / LAN privat yang boleh konek
    if (!isAllowedRemoteAddress(remote)) {
      logger.warn(`Koneksi DITOLAK dari alamat non-privat: ${remote}`);
      try {
        ws.close(CLOSE_FORBIDDEN_ADDRESS, 'Koneksi ditolak: hanya localhost/LAN privat');
      } catch {
        /* abaikan */
      }
      return;
    }

    // (2) Auth token dari query ?token=...
    const token = extractTokenFromRequest(req);
    if (!isValidToken(token, this.token)) {
      logger.warn(`Auth gagal dari ${remote}: token tidak valid / tidak ada`);
      try {
        ws.close(CLOSE_INVALID_TOKEN, 'Token tidak valid');
      } catch {
        /* abaikan */
      }
      return;
    }

    ws.isAuthed = true;
    const limiter = createRateLimiter({ max: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS });
    logger.ok(`Klien website terhubung dari ${remote} (total klien: ${this.clientCount()})`);

    // Kirim sapaan + status OBS awal
    this._sendHello(ws);

    ws.on('message', (raw) => this._onMessage(ws, raw, limiter));
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('error', (err) => logger.warn(`Klien WS error: ${err.message}`));
    ws.on('close', () => logger.info(`Klien website terputus (total klien: ${this.clientCount()})`));
  }

  /** Handler pesan masuk dari website (sudah auth) */
  _onMessage(ws, raw, limiter) {
    if (!ws.isAuthed) return;

    // (3) Rate limit per koneksi: maks 30 pesan/detik
    if (!limiter.check()) {
      this._handleRateViolation(ws, limiter);
      return; // pesan di-drop
    }

    // Parse JSON
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      this._send(ws, {
        ok: false,
        error: 'Format pesan tidak valid — kirim JSON, mis. {"type":"request","id":1,"command":"getScenes","params":{}}',
      });
      return;
    }
    if (!msg || typeof msg !== 'object') {
      this._send(ws, { ok: false, error: 'Format pesan tidak valid — harus objek JSON' });
      return;
    }

    // Terima format {type:"request", id, command, params} ATAU langsung {id, command, params}
    const command = typeof msg.command === 'string' ? msg.command : msg.name;
    const params = msg.params ?? msg.payload ?? {};

    // Proses lewat handler (validasi whitelist perintah & scene dilakukan di sana)
    handleCommand(command, params, { obs: this.obs })
      .then((result) => {
        if (result && msg.id !== undefined && result.id === undefined) result.id = msg.id;
        this._send(ws, result);
      })
      .catch((err) => {
        logger.error(`Gagal memproses perintah "${command}": ${err.message}`);
        this._send(ws, { ok: false, id: msg.id, command, error: err.message || 'Gagal internal di bridge' });
      });
  }

  /** Perlakuan untuk klien yang melebihi rate limit */
  _handleRateViolation(ws, limiter) {
    const now = Date.now();
    // Kirim peringatan maksimal 1x per detik (jangan ikut-ikut membanjiri outbound)
    if (!ws._lastRateWarn || now - ws._lastRateWarn > 1000) {
      ws._lastRateWarn = now;
      this._send(ws, {
        ok: false,
        error: 'Rate limit terlampaui — maksimum 30 pesan per detik. Perlambat pengiriman pesan dari website.',
      });
    }
    if (limiter.violations >= RATE_LIMIT_MAX_VIOLATIONS) {
      logger.warn(`Klien melebihi rate limit ${limiter.violations}x — koneksi diputus`);
      try {
        ws.close(CLOSE_RATE_LIMIT, 'Rate limit terlampaui');
      } catch {
        /* abaikan */
      }
    }
  }

  /** Kirim pesan sambutan + status OBS saat klien baru masuk */
  async _sendHello(ws) {
    try {
      const status = await this.obs.getStatus();
      this._send(ws, { type: 'hello', data: { service: 'zeroid-broadcast-bridge', obs: status } });
    } catch {
      /* abaikan */
    }
  }

  /** Kirim JSON ke satu klien (aman walau socket sedang mati) */
  _send(ws, obj) {
    if (!ws || ws.readyState !== READY_STATE_OPEN) return;
    try {
      ws.send(JSON.stringify(obj));
    } catch {
      /* abaikan */
    }
  }

  /** Broadcast pesan ke semua klien yang sudah auth (mis. update status OBS) */
  broadcast(obj) {
    if (!this.wss) return;
    let payload;
    try {
      payload = JSON.stringify(obj);
    } catch {
      return;
    }
    for (const client of this.wss.clients) {
      if (client.isAuthed && client.readyState === READY_STATE_OPEN) {
        try {
          client.send(payload);
        } catch {
          /* abaikan */
        }
      }
    }
  }

  /** Matikan server dengan rapi (dipakai saat shutdown bridge) */
  async stop() {
    if (this._heartbeat) {
      clearInterval(this._heartbeat);
      this._heartbeat = null;
    }
    if (!this.wss) return;
    await new Promise((resolve) => {
      const forceTimer = setTimeout(() => {
        for (const c of this.wss.clients) {
          try {
            c.terminate();
          } catch {
            /* abaikan */
          }
        }
        resolve();
      }, 2000);
      for (const c of this.wss.clients) {
        try {
          c.close(1001, 'Bridge dimatikan');
        } catch {
          /* abaikan */
        }
      }
      this.wss.close(() => {
        clearTimeout(forceTimer);
        resolve();
      });
    });
    this.wss = null;
    logger.info('WebSocket server dihentikan');
  }
}

export default BridgeServer;
