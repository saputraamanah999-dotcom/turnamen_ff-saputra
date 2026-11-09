/**
 * STIKAR BROADCAST BRIDGE — Klien obs-websocket v5 (paket npm 'obs-websocket-js')
 *
 * - Koneksi ke OBS Studio di ws://127.0.0.1:4455 (LOCALHOST SAJA, tidak pernah publik)
 * - Password diambil dari .env (OBS_PASSWORD) dan TIDAK PERNAH dicatat ke log
 * - Auto-reconnect dengan backoff eksponensial: bridge tetap hidup walau OBS belum jalan
 * - Semua error diterjemahkan menjadi pesan Bahasa Indonesia yang ramah
 */

import { EventEmitter } from 'node:events';
import OBSWebSocket from 'obs-websocket-js';
import { logger } from '../logger.js';

const RECONNECT_INITIAL_MS = 2000; // jeda awal sebelum reconnect
const RECONNECT_MAX_MS = 30000; // jeda maksimum (backoff eksponensial)

/** Terjemahkan error obs-websocket menjadi pesan Indonesia yang aman untuk ditampilkan */
function describeObsError(err) {
  const raw = err && err.message ? String(err.message) : String(err || 'error tidak diketahui');
  if (/auth/i.test(raw)) {
    return 'Autentikasi ke OBS gagal — periksa OBS_PASSWORD di .env';
  }
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ETIMEDOUT|socket hang up|connect/i.test(raw)) {
    return 'OBS tidak dapat dihubungi — pastikan OBS Studio berjalan dan WebSocket Server aktif (port 4455)';
  }
  return raw;
}

export class OBSClient extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.url      URL obs-websocket (default ws://127.0.0.1:4455)
   * @param {string} opts.password password WebSocket OBS dari .env (JANGAN di-log)
   */
  constructor({ url, password } = {}) {
    super();
    this.url = url || 'ws://127.0.0.1:4455';
    this.password = password || ''; // rahasia — hanya dipakai untuk connect()
    this.obs = new OBSWebSocket();
    this.connected = false;
    this.obsVersion = null;
    this.websocketVersion = null;
    this._stopped = false;
    this._reconnectTimer = null;
    this._reconnectDelay = RECONNECT_INITIAL_MS;
    this._bindEvents();
  }

  /** Pasang listener event internal obs-websocket-js */
  _bindEvents() {
    this.obs.on('ConnectionOpened', () => {
      this.connected = true;
      this._reconnectDelay = RECONNECT_INITIAL_MS; // reset backoff
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }
      logger.obs('Terhubung ke OBS Studio');
      this._refreshVersion(); // ambil versi OBS (async, tidak memblokir)
      this.emit('changed', 'connected');
    });

    this.obs.on('ConnectionClosed', () => {
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) logger.obs('Koneksi ke OBS terputus');
      this.emit('changed', 'disconnected');
      if (!this._stopped) {
        logger.obs('OBS belum terhubung — bridge tetap berjalan (status disconnected), mencoba ulang otomatis...');
        this._scheduleReconnect();
      }
    });

    this.obs.on('ConnectionError', (err) => {
      logger.warn(`Koneksi OBS gagal: ${describeObsError(err)}`);
    });

    this.obs.on('AuthenticationFailure', () => {
      // Password tidak dicatat di log — hanya petunjuk lokasi config
      logger.error('Password OBS salah — periksa OBS_PASSWORD di file .env');
    });

    // Event OBS -> beri tahu bridge bahwa ada perubahan (untuk broadcast ke website)
    this.obs.on('StreamStateChanged', () => this.emit('changed', 'output'));
    this.obs.on('RecordStateChanged', () => this.emit('changed', 'output'));
    this.obs.on('CurrentProgramSceneChanged', () => this.emit('changed', 'scene'));
  }

  /** Mulai koneksi awal ke OBS. Tidak pernah melempar error — kegagalan dijadwalkan reconnect. */
  async start() {
    this._stopped = false;
    logger.obs(`Menghubungkan ke OBS di ${this.url} ...`);
    await this._connect();
  }

  async _connect() {
    if (this._stopped || this.connected) return;
    try {
      // obs-websocket-js v5: connect(url, password)
      await this.obs.connect(this.url, this.password || undefined);
      // sukses ditandai oleh event 'ConnectionOpened'
    } catch (err) {
      logger.warn(`OBS belum terhubung (${describeObsError(err)})`);
      logger.warn('Bridge tetap berjalan dengan status disconnected — tidak ada yang crash.');
      this._scheduleReconnect();
    }
  }

  /** Jadwalkan percobaan ulang dengan backoff eksponensial (2s, 4s, 8s, ... maks 30s) */
  _scheduleReconnect() {
    if (this._stopped || this._reconnectTimer) return;
    const delay = this._reconnectDelay;
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, RECONNECT_MAX_MS);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._connect();
    }, delay);
  }

  /** Ambil & simpan versi OBS setelah koneksi sukses */
  async _refreshVersion() {
    try {
      const v = await this._call('GetVersion');
      this.obsVersion = v.obsVersion || null;
      this.websocketVersion = v.websocketVersion || null;
      this.emit('changed', 'version');
    } catch {
      /* abaikan — status koneksi tetap connected */
    }
  }

  /** Wrapper obs.call() yang aman: cek koneksi + terjemahkan error ke Bahasa Indonesia */
  async _call(requestType, params = {}) {
    if (!this.connected) {
      throw new Error('OBS tidak terhubung');
    }
    try {
      return await this.obs.call(requestType, params);
    } catch (err) {
      logger.debug(`OBS call ${requestType} gagal: ${describeObsError(err)}`);
      throw new Error(describeObsError(err));
    }
  }

  /** Status ringkas untuk website: { connected, version, ... } */
  async getStatus() {
    return {
      connected: this.connected,
      version: this.obsVersion,
      websocketVersion: this.websocketVersion,
      url: this.url,
      reconnecting: !this.connected && Boolean(this._reconnectTimer),
    };
  }

  /** Daftar scene + scene program aktif: { scenes: [nama], current } */
  async getSceneList() {
    const data = await this._call('GetSceneList');
    return {
      scenes: (data.scenes || []).map((s) => s.sceneName),
      current: data.currentProgramSceneName || null,
    };
  }

  /** Pindah scene OBS (dipanggil hanya setelah scene diverifikasi ada di whitelist) */
  async setCurrentScene(sceneName) {
    await this._call('SetCurrentProgramScene', { sceneName });
    logger.obs(`Scene dipindah ke: "${sceneName}"`);
    return { scene: sceneName };
  }

  /** Cari sceneItemId sebuah sumber di dalam scene (obs-websocket v5 butuh sceneItemId, bukan nama) */
  async _getSceneItemId(sceneName, sourceName) {
    const list = await this._call('GetSceneItemList', { sceneName });
    const item = (list.sceneItems || []).find((it) => it.sourceName === sourceName);
    if (!item) {
      throw new Error(`Sumber "${sourceName}" tidak ditemukan di scene "${sceneName}"`);
    }
    return item.sceneItemId;
  }

  /** Ambil status visibilitas sumber (dipakai untuk fitur toggle) */
  async getSceneItemEnabled(sceneName, sourceName) {
    const sceneItemId = await this._getSceneItemId(sceneName, sourceName);
    const res = await this._call('GetSceneItemEnabled', { sceneName, sceneItemId });
    return Boolean(res.sceneItemEnabled);
  }

  /** Set visibilitas sumber di scene (tampil / sembunyi) */
  async getSourceVisibility(sceneName, sourceName, visible) {
    const sceneItemId = await this._getSceneItemId(sceneName, sourceName);
    const enabled = Boolean(visible);
    await this._call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: enabled });
    logger.obs(`Sumber "${sourceName}" @ "${sceneName}" -> ${enabled ? 'TAMPIL' : 'SEMBUNYI'}`);
    return { scene: sceneName, source: sourceName, visible: enabled };
  }

  /**
   * Refresh browser source (overlay).
   * Catatan: obs-websocket v5 tidak punya request "refresh satu browser source",
   * jadi kita pakai hotkey bawaan OBS "OBSBS.RefreshBrowserSource"
   * (efeknya: semua browser source di-refresh — aman untuk overlay).
   * Bila hotkey gagal dan nama sumber diketahui, fallback: terapkan ulang settings sumber.
   */
  async triggerRefreshBrowserSource(sourceName = null) {
    try {
      await this._call('TriggerHotkeyByName', { hotKeyName: 'OBSBS.RefreshBrowserSource' });
      logger.obs(`Overlay di-refresh${sourceName ? ` (target: "${sourceName}")` : ' (semua browser source)'}`);
      return { refreshed: sourceName || 'semua browser source', via: 'hotkey OBSBS.RefreshBrowserSource' };
    } catch (err) {
      if (!sourceName) throw err;
      // Fallback: set ulang settings browser source agar OBS memuat ulang halamannya
      const { inputSettings } = await this._call('GetInputSettings', { inputName: sourceName });
      await this._call('SetInputSettings', { inputName: sourceName, inputSettings, overlay: true });
      logger.obs(`Overlay di-refresh via settings ulang: "${sourceName}"`);
      return { refreshed: sourceName, via: 'set-input-settings' };
    }
  }

  /** Status output OBS: streaming & recording aktif atau tidak */
  async getOutputStatus() {
    const [stream, record] = await Promise.all([this._call('GetStreamStatus'), this._call('GetRecordStatus')]);
    return {
      stream: { active: Boolean(stream.outputActive), timecode: stream.outputTimecode || null },
      recording: { active: Boolean(record.outputActive), timecode: record.outputTimecode || null },
    };
  }

  /** Hentikan klien & timer reconnect (dipakai saat shutdown bridge) */
  stop() {
    this._stopped = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this.connected = false;
    try {
      this.obs.disconnect();
    } catch {
      /* abaikan */
    }
    logger.obs('Klien OBS dihentikan');
  }
}

export default OBSClient;
