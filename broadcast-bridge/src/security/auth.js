/**
 * STIKAR BROADCAST BRIDGE — Modul keamanan koneksi
 * 1. Hanya menerima koneksi dari localhost / LAN privat (cek remoteAddress)
 * 2. Validasi token (?token=...) dengan perbandingan time-safe
 * 3. Rate limit per koneksi (maks 30 pesan per detik)
 */

import crypto from 'node:crypto';

/** Normalisasi alamat IP (buang prefix IPv4-mapped IPv6, mis. ::ffff:192.168.1.10 -> 192.168.1.10) */
export function normalizeIp(raw) {
  if (!raw) return '';
  let ip = String(raw).trim().toLowerCase();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

/**
 * Cek apakah alamat adalah localhost atau LAN privat.
 * Diizinkan: 127.0.0.1, ::1, 10.x.x.x, 172.16-31.x.x, 192.168.x.x,
 *            169.254.x.x (link-local), fe80::/10 (IPv6 link-local), fc00::/7 (IPv6 ULA).
 * Segala alamat publik -> DITOLAK.
 */
export function isAllowedRemoteAddress(raw) {
  const ip = normalizeIp(raw);
  if (!ip) return false;
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('169.254.')) return true; // link-local IPv4
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true; // 172.16.0.0 - 172.31.255.255
  if (ip.startsWith('fe80:')) return true; // IPv6 link-local
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // IPv6 unique local address
  return false;
}

/**
 * Validasi token: hash SHA-256 lalu bandingkan dengan crypto.timingSafeEqual
 * (tahan timing attack, panjang token tidak bocor).
 */
export function isValidToken(provided, expected) {
  if (typeof expected !== 'string' || expected.length === 0) return false;
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Ambil token dari query string request upgrade, mis. ws://127.0.0.1:8078?token=abc */
export function extractTokenFromRequest(req) {
  try {
    const url = new URL(req.url, 'http://localhost');
    return url.searchParams.get('token');
  } catch {
    return null;
  }
}

/**
 * Rate limiter sederhana PER KONEKSI.
 * Maksimum `max` pesan dalam jendela waktu `windowMs` (default: 30 pesan / 1000 ms).
 * Pesan yang melebihi batas ditolak (di-drop) dan dihitung sebagai pelanggaran.
 */
export function createRateLimiter({ max = 30, windowMs = 1000 } = {}) {
  let count = 0;
  let windowStart = Date.now();
  let violations = 0;

  return {
    /** true = boleh lewat; false = melebihi batas (pesan harus di-drop) */
    check() {
      const now = Date.now();
      if (now - windowStart >= windowMs) {
        windowStart = now;
        count = 0;
      }
      count += 1;
      if (count > max) {
        violations += 1;
        return false;
      }
      return true;
    },
    get violations() {
      return violations;
    },
  };
}
