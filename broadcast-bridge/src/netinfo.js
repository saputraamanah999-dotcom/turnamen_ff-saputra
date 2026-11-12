/**
 * STIKAR BROADCAST BRIDGE — Deteksi IP LAN otomatis
 *
 * Laptop sering punya banyak adapter (Wi-Fi, Ethernet, VirtualBox, WSL, Hyper-V, VPN).
 * Modul ini memberi skor tiap adapter dan memilih yang paling mungkin dipakai
 * perangkat lain di jaringan (HP/TV), bukan sekadar "IP pertama".
 *
 * Prioritas utama: adapter yang DIPILIH ROUTING TABLE OS untuk trafik keluar
 * (default route). Diteksi lewat trik UDP-connect TANPA mengirim paket:
 * connect() ke 8.8.8.8:53 cukup membuat OS memilih adapter utama, lalu
 * address() memberi IP sumber adapter tersebut. Akurat walau nama adapter
 * aneh (mis. "Ethernet 3" = VirtualBox, "Wi-Fi 2" = hotspot Windows mshome.net).
 */

import os from 'node:os';
import dgram from 'node:dgram';

// Adapter virtual/tunnel yang TIDAK bisa dijangkau HP/TV di Wi-Fi venue.
const VIRTUAL_NAME = /vmware|virtualbox|vbox|vethernet|hyper-v|wsl|docker|loopback|bluetooth|tailscale|zerotier|vpn|tap-|npcap|host-only|utun|awdl|llw|veth|br-/i;
// Adapter yang biasanya fisik.
const PHYSICAL_NAME = /wi-?fi|wlan|wireless|ethernet|^eth\d|^en\d|^wl/i;

export function isPrivateIPv4(addr) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(addr || '');
}

function isIPv4(n) {
  return n.family === 'IPv4' || n.family === 4;
}

// ---------- IP adapter utama menurut routing table (cache sekali saat start) ----------
let routeIpCache = null;
(function probeRouteIp() {
  try {
    const s = dgram.createSocket('udp4');
    let settled = false;
    const done = (val) => {
      if (settled) return;
      settled = true;
      try { s.close(); } catch { /* sudah tertutup */ }
      routeIpCache = val;
    };
    const t = setTimeout(() => done(null), 1500);
    s.once('error', () => { clearTimeout(t); done(null); });
    s.connect(53, '8.8.8.8', () => {
      clearTimeout(t);
      try {
        const a = s.address();
        done(isPrivateIPv4(a.address) ? a.address : null);
      } catch { done(null); }
    });
  } catch { routeIpCache = null; }
})();

/** Semua adapter IPv4 non-loopback, diurutkan dari paling layak dipakai. */
export function listLanInterfaces() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (n.internal || !isIPv4(n)) continue;
      if (n.address.startsWith('169.254.')) continue; // APIPA = belum dapat IP dari router
      let score = 0;
      if (isPrivateIPv4(n.address)) score += 50;
      if (VIRTUAL_NAME.test(name)) score -= 100;
      if (PHYSICAL_NAME.test(name)) score += 20;
      if (n.address.startsWith('192.168.56.')) score -= 60; // default VirtualBox host-only
      if (n.address.startsWith('192.168.137.')) score += 10; // Windows Mobile Hotspot (laptop = pusat jaringan)
      // Adapter yang dipilih OS untuk trafik keluar (default route) = prioritas tertinggi.
      if (routeIpCache && n.address === routeIpCache) score += 200;
      out.push({ name, address: n.address, mac: n.mac, score, virtual: VIRTUAL_NAME.test(name) });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** IP LAN terbaik, atau null bila laptop belum tersambung ke jaringan mana pun. */
export function bestLanIp() {
  const list = listLanInterfaces();
  return list.length ? list[0] : null;
}
