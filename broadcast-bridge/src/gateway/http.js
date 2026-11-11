/**
 * STIKAR LOCAL BROADCAST GATEWAY (PHASE 2 §6, §7, §8)
 *
 * HTTP server yang berjalan di LAPTOP PRODUKSI dan melayani jaringan lokal:
 *   TV / HP penonton  --http://<ip-laptop>:<GATEWAY_PORT>-->  GATEWAY
 *
 * Fungsi:
 *  1. Halaman DISPLAY & LIVE bergaya STIKAR (video gameplay + leaderboard).
 *  2. Proxy ke MediaMTX (WHIP publish / WHE playback / HLS fallback) —
 *     sehingga browser viewer same-origin, bebas masalah CORS/mixed-content.
 *  3. Pairing code untuk website publik (dibatasi waktu, bisa dicabut).
 *  4. Presence viewer NYATA via WebSocket (bukan data palsu).
 *  5. Status jaringan nyata: interface aktif, IP LAN, MediaMTX up/down.
 *
 * Catatan keamanan:
 *  - Endpoint admin (buat/cabut pairing) butuh BRIDGE_TOKEN.
 *  - Tidak ada password OBS / token yang diekspos ke viewer.
 *  - Endpoint status hanya membocorkan informasi non-sensitif.
 */

import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { logger } from '../logger.js';
import { renderDisplayPage, renderLivePage, renderInfoPage } from './pages.js';
import { bestLanIp, listLanInterfaces } from '../netinfo.js';
import { normalizeIp } from '../security/auth.js';

const READY = 1;
const PAIRING_TTL_MS = 15 * 60 * 1000; // 15 menit (§22: pairing punya masa berlaku)
const MAX_PAIRINGS = 20;

const dirHere = path.dirname(fileURLToPath(import.meta.url));

/** Cari file hls.js di node_modules (gateway = subfolder repo). */
function findHlsJs() {
  const candidates = [
    path.join(dirHere, '..', '..', '..', 'node_modules', 'hls.js', 'dist', 'hls.min.js'),
    path.join(process.cwd(), 'node_modules', 'hls.js', 'dist', 'hls.min.js'),
    path.join(process.cwd(), '..', 'node_modules', 'hls.js', 'dist', 'hls.min.js'),
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch { /* abaikan */ }
  }
  return null;
}

/** IP LAN terbaik (adapter virtual/VPN dilewati) — lihat netinfo.js. */
function activeLanIp() {
  const b = bestLanIp();
  return b ? { name: b.name, address: b.address, mac: b.mac } : null;
}

function isPrivateAddress(addr) {
  return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(addr || '');
}

export class LocalGateway {
  /**
   * @param {object} opts
   * @param {number} opts.port        port HTTP gateway (default 8080)
   * @param {string} opts.token       BRIDGE_TOKEN untuk endpoint admin
   * @param {object} opts.bridge      BridgeServer (untuk broadcast status)
   * @param {string} opts.defaultPath path stream MediaMTX default (bof-main)
   */
  constructor({ port = 8080, token, bridge, defaultPath = 'bof-main', wsPort = 8078, allowedOrigins = [], mediamtxManager = null }) {
    this.port = port;
    this.wsPort = wsPort;
    this.allowedOrigins = allowedOrigins;
    this.mtx = mediamtxManager;
    this.token = token || '';
    this.bridge = bridge;
    this.defaultPath = defaultPath;
    this.server = null;
    this.viewerWss = null;
    this.viewers = new Map(); // id -> {label, type, since, ip}
    this.pairings = new Map(); // code -> {createdAt, expiresAt}
    this.mediamtxUp = false;
    this.lanIp = null;
    this._timers = [];
  }

  start() {
    this.server = http.createServer((req, res) => this._onRequest(req, res));
    this.server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        logger.error(`Gateway port ${this.port} dipakai aplikasi lain — ubah GATEWAY_PORT di .env`);
        return;
      }
      logger.error(`Gateway HTTP error: ${err.message}`);
    });

    // WebSocket presence viewer (TANPA auth — hanya lapor kehadiran, baca-saja)
    this.viewerWss = new WebSocketServer({ server: this.server, path: '/ws-viewer', maxPayload: 8 * 1024 });
    this.viewerWss.on('connection', (ws, req) => this._onViewer(ws, req));

    this.server.listen(this.port, '0.0.0.0', () => {
      logger.ok(`Local Gateway siap di port ${this.port} (LAN) — display: http://<ip-laptop>:${this.port}/display`);
    });

    // Pantau MediaMTX + IP berubah + umur pairing
    this._timers.push(setInterval(() => this._probeMediamtx(), 3000));
    this._timers.push(setInterval(() => this._pushStatus(), 5000));
    this._timers.push(setInterval(() => this._expirePairings(), 30000));
    this._probeMediamtx();
    // _pushStatus dipanggil berkala → admin melihat viewer count nyata
  }

  stop() {
    this._timers.forEach(clearInterval);
    this._timers = [];
    try { this.viewerWss?.close(); } catch { /* abaikan */ }
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
      setTimeout(resolve, 1500).unref?.();
    });
  }

  /* ---------------- Request router ---------------- */
  _onRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'local'}`);
    const p = url.pathname;
    const remote = req.socket.remoteAddress || '';

    // CORS untuk endpoint API + proxy (agar admin di domain Vercel bisa probe loopback)
    const cors = (r) => {
      r.setHeader('Access-Control-Allow-Origin', '*');
      r.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
      r.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      r.setHeader('Access-Control-Allow-Private-Network', 'true');
    };

    if (req.method === 'OPTIONS') {
      cors(res);
      if (p === '/api/bootstrap' && req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
      }
      res.writeHead(204);
      res.end();
      return;
    }

    // ---- Halaman siaran ----
    if (req.method === 'GET' && (p === '/' || p === '')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderInfoPage({ port: this.port, lanIp: this.lanIp, mediamtx: this.mediamtxUp }));
      return;
    }
    let m = p.match(/^\/display(?:\/([a-zA-Z0-9_-]+))?\/?$/);
    if (req.method === 'GET' && m) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderDisplayPage({ tid: m[1] || this.defaultPath, port: this.port, mediamtx: this.mediamtxUp, mediamtxPath: this.defaultPath }));
      return;
    }
    m = p.match(/^\/live(?:\/([a-zA-Z0-9_-]+))?\/?$/);
    if (req.method === 'GET' && m) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderLivePage({ tid: m[1] || this.defaultPath, port: this.port, mediamtx: this.mediamtxUp, mediamtxPath: this.defaultPath }));
      return;
    }

    // ---- Aset hls.js lokal (offline-friendly) ----
    if (req.method === 'GET' && p === '/assets/hls.min.js') {
      const file = findHlsJs();
      if (!file) { res.writeHead(404); res.end('// hls.js tidak ditemukan'); return; }
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      fs.createReadStream(file).pipe(res);
      return;
    }

    // ---- Bootstrap otomatis untuk admin di laptop yang sama (loopback saja) ----
    if (req.method === 'GET' && p === '/api/bootstrap') {
      this._bootstrap(req, res);
      return;
    }

    // ---- API status (non-sensitif, boleh diprobe admin) ----
    if (req.method === 'GET' && (p === '/api/status' || p === '/api/network')) {
      cors(res);
      const ip = activeLanIp();
      const body = {
        service: 'stikar-local-gateway',
        server: true,
        gatewayPort: this.port,
        lanIp: ip ? ip.address : null,
        lanIps: listLanInterfaces().map((i) => ({ name: i.name, address: i.address, virtual: i.virtual })),
        interface: ip ? ip.name : null,
        mediamtx: this.mediamtxUp,
        mediamtxPath: this.defaultPath,
        viewers: this.viewers.size,
        viewerList: [...this.viewers.values()].map((v) => ({ label: v.label, type: v.type, since: v.since })),
        pairingCode: this.pairings.size ? [...this.pairings.keys()][0] : null,
        wheUrl: `/mediamtx/${this.defaultPath}/whe`,
        hlsUrl: `/hls/${this.defaultPath}/index.m3u8`,
        whipUrl: `/mediamtx/${this.defaultPath}/whip`,
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }

    // ---- Pairing: buat (butuh token) ----
    if (req.method === 'POST' && p === '/api/pairing') {
      cors(res);
      if ((req.headers.authorization || '') !== `Bearer ${this.token}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Token bridge salah' }));
        return;
      }
      if (this.pairings.size >= MAX_PAIRINGS) this._expirePairings();
      const code = String(crypto.randomInt(100000, 1000000));
      this.pairings.set(code, { createdAt: Date.now(), expiresAt: Date.now() + PAIRING_TTL_MS, ip: remote });
      logger.ok(`Pairing dibuat: ${code} (berlaku 15 menit)`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code, expiresAt: Date.now() + PAIRING_TTL_MS, displayPath: `/display/${this.defaultPath}`, livePath: `/live/${this.defaultPath}` }));
      return;
    }

    // ---- Pairing: cabut (butuh token) ----
    m = p.match(/^\/api\/pairing\/(\d{6})$/);
    if (req.method === 'DELETE' && m) {
      cors(res);
      if ((req.headers.authorization || '') !== `Bearer ${this.token}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Token bridge salah' }));
        return;
      }
      const ok = this.pairings.delete(m[1]);
      res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok }));
      return;
    }

    // ---- Pairing: tukar kode → endpoint lokal (rate-limit sederhana per IP) ----
    if (req.method === 'POST' && p === '/api/pairing/redeem') {
      cors(res);
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
      req.on('end', () => {
        let code = '';
        try { code = String(JSON.parse(body).code || ''); } catch { /* abaikan */ }
        const rec = this.pairings.get(code);
        if (!rec || rec.expiresAt < Date.now()) {
          this.pairings.delete(code);
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Kode pairing tidak valid / kedaluwarsa' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          tid: this.defaultPath,
          displayPath: `/display/${this.defaultPath}`,
          livePath: `/live/${this.defaultPath}`,
          wheUrl: `/mediamtx/${this.defaultPath}/whe`,
          hlsUrl: `/hls/${this.defaultPath}/index.m3u8`,
          lanIp: activeLanIp()?.address ?? null,
        }));
      });
      return;
    }

    // ---- Proxy MediaMTX (WHIP/WHE 8889 & HLS 8888) ----
    m = p.match(/^\/mediamtx\/(.+)$/);
    if (m) return this._proxy(req, res, 8889, `/${m[1]}`);
    m = p.match(/^\/hls\/(.+)$/);
    if (m) return this._proxy(req, res, 8888, `/${m[1]}`);

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 — tidak ditemukan');
  }

  /** Kumpulan URL siap pakai berdasarkan IP LAN terdeteksi. */
  _urls(ip) {
    const base = ip ? `http://${ip}:${this.port}` : null;
    const loop = `http://127.0.0.1:${this.port}`;
    const sp = this.defaultPath;
    return {
      gatewayLan: base,
      display: base ? `${base}/display/${sp}` : null,
      live: base ? `${base}/live/${sp}` : null,
      hls: base ? `${base}/hls/${sp}/index.m3u8` : null,
      whe: base ? `${base}/mediamtx/${sp}/whe` : null,
      whip: `${loop}/mediamtx/${sp}/whip`,
    };
  }

  /**
   * GET /api/bootstrap — website admin (di laptop ini) mengambil token + IP otomatis.
   * Dilindungi 3 lapis: (1) koneksi harus dari loopback, (2) header Host harus localhost/127.0.0.1
   * (anti DNS-rebinding), (3) Origin harus ada di daftar ALLOWED_ORIGINS. Situs lain tidak bisa membacanya.
   */
  _bootstrap(req, res) {
    const remote = normalizeIp(req.socket.remoteAddress || '');
    const hostName = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
    const origin = String(req.headers.origin || '');
    const loopback = remote === '127.0.0.1' || remote === '::1';
    const hostOk = hostName === '127.0.0.1' || hostName === 'localhost' || hostName === '[::1]';
    const originOk =
      !origin ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      this.allowedOrigins.includes(origin);

    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
    if (!loopback || !hostOk || !originOk) {
      logger.warn(`Bootstrap ditolak (remote=${remote}, host=${hostName}, origin=${origin || '-'}) — tambahkan ke ALLOWED_ORIGINS bila ini website resmi`);
      res.writeHead(403, headers);
      res.end(JSON.stringify({ error: 'Bootstrap hanya untuk website resmi di laptop ini' }));
      return;
    }
    if (origin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Vary'] = 'Origin';
      headers['Access-Control-Allow-Private-Network'] = 'true';
    }
    const ip = activeLanIp();
    res.writeHead(200, headers);
    res.end(JSON.stringify({
      ok: true,
      service: 'stikar-local-gateway',
      token: this.token,
      wsUrl: `ws://127.0.0.1:${this.wsPort}`,
      wsPort: this.wsPort,
      gatewayPort: this.port,
      lanIp: ip ? ip.address : null,
      interface: ip ? ip.name : null,
      lanIps: listLanInterfaces().map((i) => ({ name: i.name, address: i.address, virtual: i.virtual })),
      mediamtx: this.mediamtxUp,
      mediamtxPath: this.defaultPath,
      urls: this._urls(ip ? ip.address : null),
    }));
  }

  /* ---------------- Proxy streaming ---------------- */
  _proxy(req, res, targetPort, targetPath) {
    const proxied = http.request(
      { host: '127.0.0.1', port: targetPort, path: targetPath, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${targetPort}` } },
      (up) => {
        const headers = { ...up.headers };
        headers['Access-Control-Allow-Origin'] = '*';
        headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'Content-Type';
        res.writeHead(up.statusCode || 502, headers);
        up.pipe(res);
      },
    );
    proxied.on('error', () => {
      res.writeHead(502, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ error: `MediaMTX tidak terjangkau di port ${targetPort} — jalankan MediaMTX di laptop (lihat panduan Local Network).` }));
    });
    req.pipe(proxied);
  }

  /* ---------------- Presence viewer ---------------- */
  _onViewer(ws, req) {
    const remote = req.socket.remoteAddress || '';
    if (!isPrivateAddress(remote)) {
      try { ws.close(4003, 'Hanya LAN lokal'); } catch { /* abaikan */ }
      return;
    }
    const id = crypto.randomUUID();
    const entry = { label: 'Perangkat baru', type: 'viewer', since: Date.now(), ip: remote };
    this.viewers.set(id, entry);
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'hello') {
          entry.label = String(msg.label || entry.label).slice(0, 40);
          entry.type = msg.role === 'display' ? 'display' : 'viewer';
        }
      } catch { /* abaikan */ }
      this._pushStatus();
    });
    ws.on('close', () => {
      this.viewers.delete(id);
      this._pushStatus();
    });
    ws.send(JSON.stringify({ type: 'welcome', viewers: this.viewers.size }));
    this._pushStatus();
    logger.info(`Viewer baru di gateway: ${remote} (total ${this.viewers.size})`);
  }

  /** Broadcast status gateway → semua klien bridge (admin panel). */
  _pushStatus() {
    const ip = activeLanIp();
    const nextIp = ip ? ip.address : null;
    if (this.lanIp && nextIp && nextIp !== this.lanIp) {
      logger.warn(`IP LAN laptop berubah: ${this.lanIp} → ${nextIp}. Website admin memperbarui URL otomatis; perangkat penonton perlu buka ulang link baru: http://${nextIp}:${this.port}/display`);
    }
    this.lanIp = nextIp || this.lanIp;
    if (!this.bridge) return;
    this.bridge.broadcast({
      type: 'event',
      event: 'gateway-update',
      data: {
        viewers: this.viewers.size,
        viewerList: [...this.viewers.values()].map((v) => ({ id: v.ip, label: v.label, type: v.type, since: v.since })),
        lanIp: this.lanIp,
        gatewayPort: this.port,
        mediamtx: this.mediamtxUp,
        pairingCode: this.pairings.size ? [...this.pairings.keys()][0] : null,
      },
    });
  }

  _probeMediamtx() {
    const sock = net.connect({ host: '127.0.0.1', port: 8889, timeout: 1500 });
    sock.once('connect', () => { this.mediamtxUp = true; sock.destroy(); this._pushStatus(); });
    sock.once('error', () => { this.mediamtxUp = false; this._pushStatus(); });
    sock.once('timeout', () => { this.mediamtxUp = false; sock.destroy(); this._pushStatus(); });
  }

  _expirePairings() {
    const now = Date.now();
    for (const [code, rec] of this.pairings) {
      if (rec.expiresAt < now) this.pairings.delete(code);
    }
  }
}
