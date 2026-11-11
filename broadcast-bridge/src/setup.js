/**
 * STIKAR BROADCAST BRIDGE — Auto-setup saat pertama dijalankan
 *
 * Tujuan: operator cukup klik start-bridge.bat, tanpa mengedit file manual.
 *  1. Buat .env dari .env.example bila belum ada.
 *  2. Isi BRIDGE_TOKEN acak bila masih kosong (token disimpan, jadi tidak berubah tiap restart).
 *  3. Isi OBS_PASSWORD (dan port) otomatis dari konfigurasi obs-websocket milik OBS di laptop ini.
 *  4. Buat config.json dari config.example.json bila belum ada.
 *
 * Tidak pernah menimpa nilai yang sudah diisi operator. Password tidak pernah dicatat ke log.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');
const ENV_EXAMPLE = path.join(ROOT_DIR, '.env.example');
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');
const CONFIG_EXAMPLE = path.join(ROOT_DIR, 'config.example.json');

/** Ambil nilai KEY dari isi .env (baris `KEY=nilai`, abaikan komentar). */
function getEnvValue(content, key) {
  const m = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : null;
}

/** Ganti (atau tambahkan) baris KEY=nilai. */
function setEnvValue(content, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, () => `${key}=${value}`);
  return content.replace(/\s*$/, '\n') + `${key}=${value}\n`;
}

/** Lokasi config obs-websocket v5 menurut OS. */
function obsWebsocketConfigPath() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appdata, 'obs-studio', 'plugin_config', 'obs-websocket', 'config.json');
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'obs-studio', 'plugin_config', 'obs-websocket', 'config.json');
  }
  return path.join(home, '.config', 'obs-studio', 'plugin_config', 'obs-websocket', 'config.json');
}

/** Baca pengaturan WebSocket OBS di laptop ini (best-effort). */
export function readObsWebsocketConfig() {
  try {
    const raw = fs.readFileSync(obsWebsocketConfigPath(), 'utf8');
    const j = JSON.parse(raw);
    return {
      enabled: j.server_enabled !== false,
      port: Number(j.server_port) || 4455,
      authRequired: j.auth_required !== false,
      password: typeof j.server_password === 'string' ? j.server_password : '',
    };
  } catch {
    return null;
  }
}

export function runFirstTimeSetup() {
  const result = { createdEnv: false, tokenGenerated: false, obsPasswordAuto: false, obsConfig: null };

  // 1) .env
  let env = '';
  if (fs.existsSync(ENV_PATH)) {
    env = fs.readFileSync(ENV_PATH, 'utf8');
  } else if (fs.existsSync(ENV_EXAMPLE)) {
    env = fs.readFileSync(ENV_EXAMPLE, 'utf8');
    result.createdEnv = true;
    logger.ok('.env belum ada — dibuat otomatis dari .env.example');
  } else {
    logger.warn('.env.example tidak ditemukan — memakai nilai bawaan');
  }
  let dirty = result.createdEnv;

  // 2) Token bridge
  if (!getEnvValue(env, 'BRIDGE_TOKEN')) {
    env = setEnvValue(env, 'BRIDGE_TOKEN', crypto.randomBytes(24).toString('hex'));
    result.tokenGenerated = true;
    dirty = true;
    logger.ok('BRIDGE_TOKEN dibuat otomatis dan disimpan di .env');
  }

  // 3) Password OBS dari konfigurasi OBS sendiri
  const obs = readObsWebsocketConfig();
  result.obsConfig = obs ? { enabled: obs.enabled, port: obs.port, authRequired: obs.authRequired } : null;
  if (obs) {
    if (!getEnvValue(env, 'OBS_PASSWORD') && obs.authRequired && obs.password) {
      env = setEnvValue(env, 'OBS_PASSWORD', obs.password);
      result.obsPasswordAuto = true;
      dirty = true;
      logger.ok('Password OBS WebSocket dibaca otomatis dari konfigurasi OBS');
    }
    const curUrl = getEnvValue(env, 'OBS_WS_URL');
    if ((!curUrl || curUrl === 'ws://127.0.0.1:4455') && obs.port !== 4455) {
      env = setEnvValue(env, 'OBS_WS_URL', `ws://127.0.0.1:${obs.port}`);
      dirty = true;
      logger.ok(`Port OBS WebSocket terdeteksi ${obs.port} — .env disesuaikan`);
    }
    if (!obs.enabled) {
      logger.warn('OBS WebSocket server NONAKTIF. Di OBS: Tools → WebSocket Server Settings → Enable WebSocket server.');
    }
  } else {
    logger.info('Konfigurasi OBS WebSocket tidak ditemukan (OBS belum pernah dibuka?). Bridge tetap jalan dan mencoba lagi otomatis.');
  }

  if (dirty) {
    try {
      fs.writeFileSync(ENV_PATH, env, { mode: 0o600 });
    } catch (err) {
      logger.warn(`Gagal menulis .env (${err.message}) — token tidak tersimpan permanen`);
    }
  }

  // 4) config.json (whitelist scene)
  if (!fs.existsSync(CONFIG_PATH) && fs.existsSync(CONFIG_EXAMPLE)) {
    try {
      fs.copyFileSync(CONFIG_EXAMPLE, CONFIG_PATH);
      logger.ok('config.json dibuat otomatis dari config.example.json');
    } catch (err) {
      logger.warn(`Gagal membuat config.json: ${err.message}`);
    }
  }

  return result;
}
