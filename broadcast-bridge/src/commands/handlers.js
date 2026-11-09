/**
 * ZEROID BROADCAST BRIDGE — Handler perintah website -> bridge
 *
 * Whitelist perintah (satu-satunya yang boleh dijalankan):
 *   getStatus, getScenes, switchScene, toggleSource, refreshOverlay, getOutputs
 * Perintah lain DITOLAK dan dicatat ke log.
 *
 * switchScene hanya boleh memilih scene yang ada di sceneWhitelist (config.json).
 * Setiap perintah dicatat ke log dengan nilai sensitif otomatis disanitasi.
 */

import { logger } from '../logger.js';
import { getWhitelist, isSceneAllowed } from '../security/whitelist.js';

/** Perintah yang diizinkan */
export const ALLOWED_COMMANDS = [
  'getStatus', // status koneksi OBS + versi
  'getScenes', // daftar scene + scene aktif + whitelist
  'switchScene', // pindah scene (hanya scene di whitelist)
  'toggleSource', // tampil/sembunyikan sumber di scene
  'refreshOverlay', // refresh browser source overlay
  'getOutputs', // status stream & recording
];

export function isCommandAllowed(command) {
  return typeof command === 'string' && ALLOWED_COMMANDS.includes(command);
}

/** Respons gagal standar */
function badRequest(command, message) {
  return { ok: false, command, error: message };
}

/** Pastikan params berupa objek biasa */
function safeParams(params) {
  return params && typeof params === 'object' && !Array.isArray(params) ? params : {};
}

/**
 * Proses satu perintah dari website.
 * @param {string} command nama perintah
 * @param {object} params  parameter perintah
 * @param {object} ctx     { obs: OBSClient }
 * @returns {Promise<{ok:boolean, command:string, data?:any, error?:string}>}
 */
export async function handleCommand(command, params, ctx) {
  params = safeParams(params);
  const obs = ctx && ctx.obs ? ctx.obs : null;

  // 1) Tolak perintah yang tidak ada di whitelist perintah — SELALU dicatat ke log
  if (!isCommandAllowed(command)) {
    logger.warn(`Perintah DITOLAK (tidak diizinkan): "${command}"`);
    return badRequest(
      command,
      `Perintah tidak dikenal atau tidak diizinkan: "${command}". Perintah yang diizinkan: ${ALLOWED_COMMANDS.join(', ')}`
    );
  }

  if (!obs) {
    return badRequest(command, 'Kesalahan internal bridge: klien OBS belum siap');
  }

  // 2) Catat setiap perintah yang diterima (nilai sensitif otomatis disanitasi)
  logger.info(`Perintah diterima: ${command}`, logger.sanitizeObject(params));

  // 3) Eksekusi
  switch (command) {
    case 'getStatus':
      // Boleh dipanggil kapan pun — tetap menjawab walau OBS belum terhubung (status disconnected)
      return { ok: true, command, data: await obs.getStatus() };

    case 'getScenes': {
      if (!obs.connected) return badRequest(command, 'OBS tidak terhubung');
      const data = await obs.getSceneList();
      // Sertakan whitelist agar panel website tahu scene mana yang boleh dipilih
      return { ok: true, command, data: { ...data, whitelist: getWhitelist() } };
    }

    case 'switchScene': {
      const scene = params.scene;
      if (!scene) {
        return badRequest(command, "Parameter 'scene' wajib diisi (nama scene persis seperti di OBS)");
      }
      // HANYA scene di whitelist yang boleh di-switch
      if (!isSceneAllowed(String(scene))) {
        logger.warn(`switchScene DITOLAK — scene "${scene}" tidak ada di whitelist`);
        return badRequest(
          command,
          `Scene "${scene}" tidak ada di whitelist (config.json). Scene yang diizinkan: ${getWhitelist().join(', ')}`
        );
      }
      if (!obs.connected) return badRequest(command, 'OBS tidak terhubung');
      const data = await obs.setCurrentScene(String(scene));
      return { ok: true, command, data };
    }

    case 'toggleSource': {
      const { scene, source, visible } = params;
      if (!scene || !source) {
        return badRequest(command, "Parameter 'scene' dan 'source' wajib diisi (opsional: 'visible' true/false)");
      }
      if (!obs.connected) return badRequest(command, 'OBS tidak terhubung');
      // Bila 'visible' tidak diberikan -> toggle dari keadaan sekarang
      const target =
        visible === undefined
          ? !(await obs.getSceneItemEnabled(String(scene), String(source)))
          : Boolean(visible);
      const data = await obs.getSourceVisibility(String(scene), String(source), target);
      return { ok: true, command, data };
    }

    case 'refreshOverlay': {
      // params.source = nama browser source di OBS (opsional; tanpa ini semua browser source di-refresh)
      const source = params.source ? String(params.source) : null;
      if (!obs.connected) return badRequest(command, 'OBS tidak terhubung');
      const data = await obs.triggerRefreshBrowserSource(source);
      return { ok: true, command, data };
    }

    case 'getOutputs': {
      if (!obs.connected) return badRequest(command, 'OBS tidak terhubung');
      const data = await obs.getOutputStatus();
      return { ok: true, command, data };
    }

    default:
      // Tidak akan pernah sampai ke sini (sudah difilter isCommandAllowed), tapi jaga-jaga
      return badRequest(command, 'Perintah tidak diizinkan');
  }
}

export default handleCommand;
