/**
 * STIKAR BROADCAST BRIDGE — Deteksi IP LAN otomatis
 *
 * Laptop sering punya banyak adapter (Wi-Fi, Ethernet, VirtualBox, WSL, Hyper-V, VPN).
 * Modul ini memberi skor tiap adapter dan memilih yang paling mungkin dipakai
 * perangkat lain di jaringan (HP/TV), bukan sekadar "IP pertama".
 */

import os from 'node:os';

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
