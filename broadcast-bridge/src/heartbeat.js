/**
 * STIKAR BROADCAST BRIDGE — Heartbeat status ke Firestore (opsional, aman gagal)
 *
 * Tujuan: admin dari perangkat MANA PUN (HP/tablet, bukan hanya laptop bridge) bisa
 * melihat apakah bridge/gateway/MediaMTX/OBS sedang berjalan, lengkap dengan IP:port.
 * Browser di perangkat lain TIDAK bisa men-probe http://<ip-laptop>:8080 langsung
 * (halaman HTTPS memblokir request ke http LAN — mixed content), jadi status dikirim
 * oleh BRIDGE sendiri ke Firestore setiap 30 detik.
 *
 * Autentikasi: Firebase Auth ANONYMOUS (web API key publik). Dokumen hanya boleh
 * ditulis oleh user yang sign-in (aturan Firestore), dibaca oleh staff.
 *
 * Prinsip: TIDAK PERNAH membuat bridge crash. Kalau kunci/auth gagal → heartbeat
 * dimatikan dengan log jelas, sisanya bridge tetap jalan normal.
 */

import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';
import { ROOT_DIR } from './setup.js';

const FS_BASE = 'https://firestore.googleapis.com/v1/projects';
const INTERVAL_MS = 30_000;
const STALE_HINT = 90_000; // admin menganggap heartbeat basi bila > 90 detik

/** Cari web API key Firebase dari beberapa sumber (semua sumber publik). */
function resolveWebKey() {
  const candidates = [];
  if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) candidates.push(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
  // repo/.env (bridge berada di <repo>/broadcast-bridge)
  for (const p of [path.join(ROOT_DIR, '..', '.env'), path.join(ROOT_DIR, '..', '..', '.env')]) {
    try {
      if (fs.existsSync(p)) {
        const m = fs.readFileSync(p, 'utf8').match(/^NEXT_PUBLIC_FIREBASE_API_KEY=(.+)$/m);
        if (m) candidates.push(m[1].trim());
      }
    } catch { /* abaikan */ }
  }
  // public/setup.html (file publik repo — berisi config web Firebase)
  try {
    const p = path.join(ROOT_DIR, '..', 'public', 'setup.html');
    if (fs.existsSync(p)) {
      const m = fs.readFileSync(p, 'utf8').match(/AIzaSy[A-Za-z0-9_-]{30,}/);
      if (m) candidates.push(m[0]);
    }
  } catch { /* abaikan */ }
  return candidates.find((k) => /^AIzaSy[A-Za-z0-9_-]{30,}$/.test(k)) || null;
}

/** Semua nilai untuk satu dokumen heartbeat. */
function toFields(d) {
  const S = (v) => (v == null ? { nullValue: null } : { stringValue: String(v) });
  const I = (v) => ({ integerValue: String(Math.round(v)) });
  const B = (v) => ({ booleanValue: Boolean(v) });
  return {
    fields: {
      tournamentId: S(d.tournamentId),
      lanIp: S(d.lanIp),
      gatewayPort: d.gatewayPort ? I(d.gatewayPort) : { nullValue: null },
      gatewayUp: B(d.gatewayUp),
      mediamtxUp: B(d.mediamtxUp),
      obsConnected: B(d.obsConnected),
      streaming: B(d.streaming),
      viewers: I(d.viewers || 0),
      bootAt: I(d.bootAt),
      updatedAt: I(d.updatedAt),
    },
  };
}

export class Heartbeat {
  /**
   * @param {object} opts
   * @param {string} opts.tournamentId  id dokumen heartbeat (bof-main)
   * @param {() => object} opts.snapshot fungsi yang mengembalikan status terkini
   *   { lanIp, gatewayPort, gatewayUp, mediamtxUp, obsConnected, streaming, viewers }
   */
  constructor({ tournamentId, snapshot }) {
    this.tournamentId = tournamentId;
    this.snapshot = snapshot;
    this.timer = null;
    this.refreshTimer = null;
    this.enabled = false;
    this.warned = false;
    this.idToken = null;
    this.refreshToken = null;
    this.tokenExpAt = 0;
    this.bootAt = Date.now();
    this.webKey = resolveWebKey();
  }

  start() {
    if (!this.webKey) {
      logger.warn('Heartbeat mati: web API key Firebase tidak ditemukan (.env / public/setup.html). Status jarak jauh tidak aktif — bridge tetap jalan normal.');
      return;
    }
    this.enabled = true;
    this._signIn()
      .then(() => {
        logger.ok(`Heartbeat status aktif → Firestore bridgeHeartbeats/${this.tournamentId} (tiap 30 detik)`);
        this._push();
        this.timer = setInterval(() => this._push(), INTERVAL_MS);
      })
      .catch((e) => this._disable(`Heartbeat mati: ${e.message}`));
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.timer = null;
    this.refreshTimer = null;
    this.enabled = false;
  }

  _disable(msg) {
    this.stop();
    if (!this.warned) {
      this.warned = true;
      logger.warn(msg + ' — bridge tetap berjalan normal.');
    }
  }

  async _signIn() {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${this.webKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`anonymous sign-in gagal (HTTP ${r.status}) — aktifkan Anonymous di Firebase Auth`);
    const j = await r.json();
    this.idToken = j.idToken;
    this.refreshToken = j.refreshToken;
    this.tokenExpAt = Date.now() + (Number(j.expiresIn) || 3600) * 1000;
    // Segarkan token sebelum kedaluwarsa (interval 45 menit)
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => void this._refresh(), 45 * 60 * 1000);
  }

  async _refresh() {
    try {
      const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${this.webKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantType: 'refresh_token', refreshToken: this.refreshToken }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) throw new Error(`refresh HTTP ${r.status}`);
      const j = await r.json();
      this.idToken = j.id_token;
      this.refreshToken = j.refresh_token;
      this.tokenExpAt = Date.now() + (Number(j.expires_in) || 3600) * 1000;
    } catch (e) {
      logger.warn(`Gagal refresh token heartbeat (${e.message}) — coba signIn ulang.`);
      try { await this._signIn(); } catch (e2) { this._disable(`Heartbeat mati: ${e2.message}`); }
    }
  }

  async _push() {
    if (!this.enabled) return;
    const s = this.snapshot() || {};
    const body = toFields({
      tournamentId: this.tournamentId,
      lanIp: s.lanIp ?? null,
      gatewayPort: s.gatewayPort ?? null,
      gatewayUp: Boolean(s.gatewayUp),
      mediamtxUp: Boolean(s.mediamtxUp),
      obsConnected: Boolean(s.obsConnected),
      streaming: Boolean(s.streaming),
      viewers: s.viewers ?? 0,
      bootAt: this.bootAt,
      updatedAt: Date.now(),
    });
    const url = `${FS_BASE}/${this._projectId()}/databases/(default)/documents/bridgeHeartbeats/${encodeURIComponent(this.tournamentId)}`;
    try {
      const r = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.idToken}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (r.status === 401 || r.status === 403) {
        // token mungkin kedaluwarsa → refresh lalu coba sekali lagi
        await this._refresh();
        const r2 = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.idToken}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        });
        if (!r2.ok) throw new Error(`HTTP ${r2.status} setelah refresh`);
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (String(e.message).includes('403')) this._disable('Heartbeat ditolak Firestore (403) — pastikan rules bridgeHeartbeats ter-deploy & anonymous sign-in aktif');
      else logger.warn(`Heartbeat gagal dikirim (${e.message}) — dicoba lagi di siklus berikutnya.`);
    }
  }

  /** project id dari web key? Tidak bisa — ambil dari .env repo atau default turnamenffbof. */
  _projectId() {
    for (const p of [path.join(ROOT_DIR, '..', '.env'), path.join(ROOT_DIR, '..', '..', '.env')]) {
      try {
        if (fs.existsSync(p)) {
          const m = fs.readFileSync(p, 'utf8').match(/^NEXT_PUBLIC_FIREBASE_PROJECT_ID=(.+)$/m);
          if (m) return m[1].trim();
        }
      } catch { /* abaikan */ }
    }
    return 'turnamenffbof';
  }
}
