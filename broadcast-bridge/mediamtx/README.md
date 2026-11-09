# MediaMTX untuk Siaran Lokal ZEROID (gratis & open-source)

Alur: **Browser capture (WHIP) → MediaMTX → TV/HP (WebRTC/HLS)**

## Setup 3 menit

1. Unduh binary MediaMTX dari https://github.com/bluenviron/mediamtx/releases
   (pilih sesuai OS laptop, gratis, tanpa registrasi).
2. Letakkan di folder ini, salin `mediamtx.yml.example` → `mediamtx.yml`,
   lalu isi `webrtcAdditionalHosts` dengan IP laptop (contoh `192.168.43.1`).
3. Jalankan `./mediamtx` (Windows: klik dua kali `mediamtx.exe`).
4. Buka **Admin → Local Network** → Start Local Server (broadcast-bridge).
5. Di **Admin → Live Control**: pilih sumber capture → PREPARE → START LIVE.
6. Di TV: buka `http://<ip-laptop>:8080/display` → gameplay + leaderboard muncul.

Port yang dipakai (izinkan di firewall JIKA perlu, sebatas LAN):
- 8080  : Local Gateway (halaman display/live) — wajib terbuka untuk TV/HP
- 8078  : Bridge WebSocket (localhost saja, tidak perlu dibuka)
- 8889  : MediaMTX WebRTC (WHIP/WHE)
- 8888  : MediaMTX HLS (fallback TV lama)
- 9997  : MediaMTX API (localhost saja)

Catatan:
- Client isolation pada hotspot/router dapat memblokir TV ↔ laptop.
  Cek dengan tombol "Test Connection" di Local Network.
- Jangan buka port ke internet; semua ini hanya untuk jaringan lokal.
