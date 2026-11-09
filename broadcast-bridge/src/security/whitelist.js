/**
 * STIKAR BROADCAST BRIDGE — Whitelist scene & sumber overlay
 *
 * Memuat daftar scene yang BOLEH di-switch oleh website dari config.json.
 * Bila config.json belum ada, otomatis fallback ke config.example.json,
 * dan bila itu juga gagal, memakai default bawaan.
 *
 * Alasan whitelist: website tidak boleh bisa memindahkan OBS ke scene apa pun.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');
const CONFIG_EXAMPLE_PATH = path.join(ROOT_DIR, 'config.example.json');

// Nilai default bila config.json & config.example.json tidak bisa dibaca
const DEFAULTS = {
  sceneWhitelist: [
    'Starting Soon',
    'Main Gameplay',
    'Gameplay + Compact Leaderboard',
    'Full Leaderboard',
    'Top 3 Ranking',
    'Match Results',
    'Break',
    'Winner Announcement',
    'Stream Offline',
  ],
  overlaySources: {
    full: '/overlay/:tournamentId/full',
    compact: '/overlay/:tournamentId/compact',
    top3: '/overlay/:tournamentId/top3',
    matchInfo: '/overlay/:tournamentId/match-info',
    lowerThird: '/overlay/:tournamentId/lower-third',
  },
};

let _cache = null;

/** Baca file config pertama yang tersedia: config.json -> config.example.json */
function readConfigFile() {
  // 1) config.json (produksi)
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn(`config.json tidak bisa dibaca (${err.message}) — mencoba config.example.json`);
    }
  }
  // 2) config.example.json (fallback bila operator belum menyalin)
  try {
    const raw = fs.readFileSync(CONFIG_EXAMPLE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Muat config (dengan cache) */
function loadConfig() {
  if (_cache) return _cache;

  const parsed = readConfigFile();

  const scenes =
    Array.isArray(parsed?.sceneWhitelist) && parsed.sceneWhitelist.length > 0
      ? parsed.sceneWhitelist.map(String)
      : DEFAULTS.sceneWhitelist.slice();

  const overlays =
    parsed?.overlaySources && typeof parsed.overlaySources === 'object' && !Array.isArray(parsed.overlaySources)
      ? { ...parsed.overlaySources }
      : { ...DEFAULTS.overlaySources };

  _cache = { sceneWhitelist: scenes, overlaySources: overlays };

  if (parsed) {
    logger.ok(`Config dimuat — scene whitelist berisi ${scenes.length} scene`);
  } else {
    logger.warn('config.json / config.example.json tidak ditemukan — memakai scene whitelist default bawaan');
  }
  return _cache;
}

/** Daftar scene yang BOLEH di-switch oleh website (dari config.json) */
export function getWhitelist() {
  return loadConfig().sceneWhitelist.slice();
}

/** Cek apakah scene ada di whitelist (case-sensitive, harus persis seperti nama scene di OBS) */
export function isSceneAllowed(sceneName) {
  if (typeof sceneName !== 'string') return false;
  return getWhitelist().includes(sceneName);
}

/** Peta key -> path overlay di website, mis. full -> /overlay/:tournamentId/full */
export function getOverlaySources() {
  return { ...loadConfig().overlaySources };
}

/** Bangun URL overlay untuk turnamen tertentu, mis. buildOverlayUrl('full', 12) -> /overlay/12/full */
export function buildOverlayUrl(key, tournamentId) {
  const tpl = loadConfig().overlaySources[key];
  if (!tpl) return null;
  return tpl.replaceAll(':tournamentId', String(tournamentId ?? ''));
}

/** Paksa muat ulang config.json (berguna bila operator mengubah config tanpa restart bridge) */
export function reloadConfig() {
  _cache = null;
  return loadConfig();
}
