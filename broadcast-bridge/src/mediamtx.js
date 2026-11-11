/**
 * STIKAR BROADCAST BRIDGE — Pengelola MediaMTX otomatis
 *
 * Bridge menjalankan MediaMTX sendiri (tanpa klik dua kali mediamtx.exe):
 *  - mencari binary sesuai OS di broadcast-bridge/mediamtx/bin/<os>-<arch>/
 *  - menulis mediamtx.generated.yml (selalu baru, berisi IP LAN terdeteksi)
 *  - menjalankan, memantau, dan restart otomatis bila crash
 *  - kalau MediaMTX sudah jalan (port 8889 terpakai), dipakai ulang — tidak dobel
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { logger } from './logger.js';
import { ROOT_DIR } from './setup.js';

const MTX_DIR = path.join(ROOT_DIR, 'mediamtx');
const WEBRTC_PORT = 8889;

function platformDirs() {
  const plat = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const dirs = [`${plat}-${arch}`];
  // Windows ARM & Mac Apple Silicon bisa menjalankan build amd64 (emulasi/Rosetta).
  if (arch === 'arm64' && plat !== 'linux') dirs.push(`${plat}-amd64`);
  const exe = process.platform === 'win32' ? 'mediamtx.exe' : 'mediamtx';
  return { dirs, exe };
}

export function findMediamtxBinary() {
  if (process.env.MEDIAMTX_BIN && fs.existsSync(process.env.MEDIAMTX_BIN)) return process.env.MEDIAMTX_BIN;
  const { dirs, exe } = platformDirs();
  const candidates = [
    ...dirs.map((d) => path.join(MTX_DIR, 'bin', d, exe)),
    path.join(MTX_DIR, exe),
    path.join(ROOT_DIR, exe),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port, timeout: 800 });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
    s.once('timeout', () => { s.destroy(); resolve(false); });
  });
}

export class MediaMTXManager {
  /**
   * @param {object} opts
   * @param {string} opts.streamPath  nama path stream (bof-main)
   * @param {() => string[]} opts.getHosts  fungsi pengambil IP LAN terdeteksi
   */
  constructor({ streamPath = 'bof-main', getHosts = () => [] } = {}) {
    this.streamPath = streamPath;
    this.getHosts = getHosts;
    this.child = null;
    this.stopping = false;
    this.external = false; // true bila MediaMTX sudah dijalankan pihak lain
    this.binary = null;
    this.restarts = 0;
    this.configPath = path.join(MTX_DIR, 'mediamtx.generated.yml');
  }

  get running() {
    return Boolean(this.child) || this.external;
  }

  _writeConfig() {
    const hosts = this.getHosts().filter(Boolean);
    const yml = [
      '# DIBUAT OTOMATIS oleh STIKAR Broadcast Bridge setiap start — jangan diedit manual.',
      'logLevel: info',
      'moq: no', // tidak dipakai; mencegah pembuatan file sertifikat auto.key
      'hlsAddress: :8888',
      'hlsEncryption: false',
      'webrtcAddress: :8889',
      hosts.length ? `webrtcAdditionalHosts: [${hosts.join(', ')}]` : '# webrtcAdditionalHosts: (IP LAN belum terdeteksi)',
      'paths:',
      `  ${this.streamPath}:`,
      '',
    ].join('\n');
    fs.mkdirSync(MTX_DIR, { recursive: true });
    fs.writeFileSync(this.configPath, yml);
  }

  async start() {
    if (await portInUse(WEBRTC_PORT)) {
      this.external = true;
      logger.ok('MediaMTX sudah berjalan di laptop ini (port 8889) — dipakai ulang');
      return;
    }
    this.binary = findMediamtxBinary();
    if (!this.binary) {
      logger.warn('Binary MediaMTX tidak ditemukan di broadcast-bridge/mediamtx/bin/. Jalankan MediaMTX manual, atau taruh binary di sana.');
      return;
    }
    if (process.platform !== 'win32') {
      try { fs.chmodSync(this.binary, 0o755); } catch { /* abaikan */ }
    }
    this._spawn();
  }

  _spawn() {
    if (this.stopping) return;
    try {
      this._writeConfig();
    } catch (err) {
      logger.error(`Gagal menulis konfigurasi MediaMTX: ${err.message}`);
      return;
    }
    logger.info(`Menjalankan MediaMTX: ${path.relative(ROOT_DIR, this.binary)}`);
    const child = spawn(this.binary, [this.configPath], {
      cwd: path.dirname(this.binary),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;

    const pipeLines = (stream, level) => {
      let buf = '';
      stream.on('data', (chunk) => {
        buf += chunk.toString();
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).replace(/\r$/, '').trim();
          buf = buf.slice(i + 1);
          if (line) logger[level](`[mediamtx] ${line}`);
        }
      });
    };
    pipeLines(child.stdout, 'info');
    pipeLines(child.stderr, 'warn');

    child.once('error', (err) => {
      logger.error(`MediaMTX gagal dijalankan: ${err.message}`);
    });
    child.once('exit', (code, signal) => {
      this.child = null;
      if (this.stopping) return;
      this.restarts += 1;
      const delay = Math.min(30000, 2000 * 2 ** Math.min(this.restarts, 4));
      logger.warn(`MediaMTX berhenti (kode ${code ?? signal}) — mulai ulang dalam ${Math.round(delay / 1000)} dtk`);
      setTimeout(() => this._spawn(), delay).unref?.();
    });
    // Anggap stabil bila hidup > 30 dtk: reset penghitung restart.
    setTimeout(() => { if (this.child === child) this.restarts = 0; }, 30000).unref?.();
  }

  stop() {
    this.stopping = true;
    if (this.child) {
      try { this.child.kill(); } catch { /* abaikan */ }
      this.child = null;
    }
  }
}
