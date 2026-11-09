/**
 * STIKAR BROADCAST BRIDGE — Logger sederhana
 * - Log berwarna ke console (ANSI color)
 * - Log polos ke file logs/bridge.log
 *
 * Aturan keamanan penting:
 * - Nilai password/token/secret TIDAK PERNAH ditulis apa adanya ke log.
 *   Semua method log otomatis memakai sanitizer di bawah.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Folder logs ada di root proyek (broadcast-bridge/logs)
const LOG_DIR = path.resolve(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'bridge.log');

// Warna ANSI untuk console
const COLORS = {
  info: '\x1b[36m',  // cyan
  ok: '\x1b[32m',    // hijau
  warn: '\x1b[33m',  // kuning
  error: '\x1b[31m', // merah
  debug: '\x1b[90m', // abu-abu
  obs: '\x1b[35m',   // magenta
  reset: '\x1b[0m',
};

// Pola nama field yang dianggap sensitif (diredaksi otomatis)
const SENSITIVE_KEY = /(password|passwd|pwd|token|secret|authorization|api[-_]?key)/i;

/** Redaksi teks yang mengandung kata kunci sensitif, mis. "token=abc123" -> "token=[REDAKSI]" */
export function sanitizeText(text) {
  return String(text).replace(
    /(password|passwd|pwd|token|secret|authorization|api[-_]?key)(["']?\s*[:=]\s*)("?)[^\s"',}&]+/gi,
    (_m, key, sep) => `${key}${sep}[REDAKSI]`
  );
}

/** Salin objek dengan semua nilai sensitif diganti "[REDAKSI]" (rekursif, aman untuk log) */
export function sanitizeObject(obj, depth = 0) {
  if (depth > 6) return '[terlalu dalam]';
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => sanitizeObject(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SENSITIVE_KEY.test(k) ? '[REDAKSI]' : sanitizeObject(v, depth + 1);
  }
  return out;
}

/** Siapkan satu bagian pesan log: string/objek/Error -> teks yang sudah disanitasi */
function prep(part) {
  if (typeof part === 'string') return sanitizeText(part);
  if (part instanceof Error) return sanitizeText(part.message || String(part));
  if (part === undefined) return 'undefined';
  if (part === null) return 'null';
  if (typeof part === 'object') {
    try {
      return sanitizeText(JSON.stringify(sanitizeObject(part)));
    } catch {
      return '[objek tidak bisa diserialisasi]';
    }
  }
  return sanitizeText(String(part));
}

// Pastikan folder logs ada (kalau gagal, jangan crash — log console tetap jalan)
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch {
  /* abaikan */
}

// Stream append ke file log (tanpa warna ANSI)
let fileStream = null;
try {
  fileStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  fileStream.on('error', () => {
    /* jangan crash karena gagal menulis log */
  });
} catch {
  /* abaikan */
}

function write(level, parts) {
  const ts = new Date().toISOString();
  const msg = parts.map(prep).join(' ');
  const tag = level.toUpperCase().padEnd(5);
  const color = COLORS[level] || '';
  // Console (berwarna)
  console.log(`${color}[${ts}] ${tag}${COLORS.reset} ${msg}`);
  // File (polos)
  if (fileStream) fileStream.write(`[${ts}] ${tag} ${msg}\n`);
}

export const logger = {
  info: (...parts) => write('info', parts),
  ok: (...parts) => write('ok', parts),
  warn: (...parts) => write('warn', parts),
  error: (...parts) => write('error', parts),
  // Debug hanya aktif bila BRIDGE_DEBUG=1 di .env
  debug: (...parts) => {
    if (process.env.BRIDGE_DEBUG === '1') write('debug', parts);
  },
  obs: (...parts) => write('obs', parts),

  /** Tutup file log dengan rapi (dipakai saat shutdown agar log terakhir tercatat) */
  close() {
    return new Promise((resolve) => {
      if (!fileStream) return resolve();
      fileStream.end(() => resolve());
    });
  },
};

export default logger;
