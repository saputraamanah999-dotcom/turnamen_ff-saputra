# STIKAR BROADCAST AGENT

Aplikasi lokal (Node.js) yang berjalan di **komputer produksi** — komputer tempat
Free Fire dijalankan lewat **Google Play Games on PC**.

Tugasnya:

1. **Mendeteksi jendela game** yang dipilih operator (Free Fire / Google Play Games).
2. **Mengambil tampilan jendela** itu dengan ffmpeg (`gdigrab`) lalu meng-push ke
   **MediaMTX** (RTSP), yang menyajikan video ke browser via **WebRTC (WHEP)** dan **HLS**.
3. **Menerima input** dari website (joystick virtual, tombol aksi, sentuh layar,
   keyboard) lewat **WebSocket terautentikasi**, lalu meneruskannya ke jendela game
   memakai **SendInput** (input level OS — sama seperti orang memakai mouse/keyboard).
4. **API status** yang jujur: tidak pernah mengaku "connected" kalau koneksi gagal,
   tidak pernah mengaku "capture aktif" kalau ffmpeg tidak berjalan.

```
FREE FIRE (Google Play Games on PC)
        ↓ window capture (ffmpeg gdigrab)
STIKAR BROADCAST AGENT  ←→  MediaMTX (RTSP 8554 → WebRTC 8889 / HLS 8888)
        ↓ WebRTC (WHEP)                       ↑ input (WebSocket, token)
WEBSITE (HP/TV/laptop di Wi-Fi yang sama) ────┘
        ↑ /live/interactive (viewer + controller) · /admin/interactive-stream (operator)
```

> **Video dan input TIDAK PERNAH melewati Firestore/internet.** Semuanya lokal di
> jaringan Wi-Fi/hotspot. Firebase hanya untuk metadata (status siaran, perangkat).

---

## 1. Instalasi

### 1.1 Node.js
Install Node.js **versi 20 atau lebih baru**: <https://nodejs.org> (pilih LTS).

Cek: buka Command Prompt → `node -v` → harus `v20.x` atau lebih.

### 1.2 Dependensi agent
Buka Command Prompt di folder `agent/` ini:

```bat
cd agent
npm install
```

Untuk **kontrol input** (wajib kalau mau touch control berfungsi, hanya Windows):

```bat
npm install koffi
```

Tanpa koffi, agent tetap jalan tapi input forwarding MATI dan statusnya jujur
menampilkan alasannya.

### 1.3 ffmpeg
1. Unduh **ffmpeg Windows build** (gpl-shared/essentials) dari <https://www.gyan.dev/ffmpeg/builds/> atau <https://github.com/BtbN/FFmpeg-Builds/releases>.
2. Ekstrak, lalu salin `bin/ffmpeg.exe` ke folder `agent/bin/` (buat foldernya), **atau** install ffmpeg ke PATH sistem.
3. Cek: `ffmpeg -version`.

### 1.4 MediaMTX
1. Unduh MediaMTX Windows amd64: <https://github.com/bluenviron/mediamtx/releases>
2. Ekstrak `mediamtx.exe` ke folder `agent/bin/` **atau** catat path-nya.
3. Tidak perlu konfigurasi manual — agent menulis `mediamtx-generated.yml` otomatis.

### 1.5 Google Play Games + Free Fire (di komputer yang sama)
1. Install **Google Play Games on PC** dari sumber resmi Google.
2. Login akun Google **langsung di aplikasi PC** — website STIKAR **tidak akan
   pernah** meminta password Google/Free Fire/OTP/cookie. Jangan pernah
   memberikan kredensial game ke halaman web mana pun.
3. Install & buka Free Fire dari aplikasi itu. Pastikan game bisa dimainkan
   langsung di komputer (keyboard + mouse).

---

## 2. Konfigurasi

`config.json` dibuat otomatis saat pertama kali jalan (meniru `config.example.json`),
lengkap dengan **adminToken** dan **viewerToken** acak yang langsung dicetak ke
console. Simpan token itu.

| Field | Default | Arti |
|---|---|---|
| `httpPort` | `8082` | Port API + WebSocket agent (LAN) |
| `adminToken` | acak | Token panel operator (`/admin/interactive-stream`) |
| `viewerToken` | acak | Token HP/TV penonton (`/live/interactive`) |
| `gameTitles` | `["Free Fire","FreeFire","FF","Google Play Games"]` | Judul jendela yang dicari |
| `ffmpegPath` | `ffmpeg` | Path `ffmpeg.exe` (boleh absolut, boleh `bin/ffmpeg.exe`) |
| `mediaMtxPath` | `mediamtx` | Path `mediamtx.exe` |
| `rtspPort` | `8554` | Port ingest ffmpeg→MediaMTX |
| `hlsPort` | `8888` | Port HLS keluaran |
| `webrtcPort` | `8889` | Port WebRTC (WHEP) keluaran |
| `streamPath` | `bof-game` | Nama path video (`http://IP:8889/bof-game`) |
| `quality` | `high` | Preset video: `low` 720p@24 2.5Mbps · `medium` 900p@30 5Mbps · `high` 1080p@60 8Mbps |
| `inputEnabled` | `false` | **Mati** secara default (aman). Operator menyalakan dari website |
| `controllerLock` | `true` | Hanya 1 perangkat controller pada satu waktu |
| `joystickKeys` | WASD | Key arah joystick (up/down/left/right) |
| `buttonMap` | (lihat example) | Pemetaan tombol website → key target |
| `logFile` | `agent.log` | File log |

---

## 3. Start / Stop / Restart / Update

```bat
start.bat            rem start + auto npm install pertama kali (jendela console terlihat)
start-hidden.bat     rem start di latar belakang (hidden) — status via http://localhost:8082/
stop.bat             rem hentikan agent (graceful)
```

- **Restart**: `stop.bat` lalu `start.bat` (atau tutup jendela console → jalankan lagi).
- **Update**: `git pull` → `npm install` → jalankan lagi. Config.json aman tidak ditimpa.
- **Dashboard status**: buka `http://localhost:8082/` di browser komputer produksi —
  ada status jujur (game/capture/MediaMTX/input) + URL LAN untuk dibagikan.

---

## 4. Hubungkan ke Website

1. Jalankan agent → catat **IP LAN** (mis. `192.168.1.10`) dari banner/dashboard.
2. Buka website → `/admin/interactive-stream` (dari laptop operator, satu Wi-Fi).
3. Isi **URL Agent** `http://192.168.1.10:8082` + **adminToken** → **CONNECT**.
4. Cek pre-flight: game terdeteksi → pilih sumber → **MULAI CAPTURE**.
5. HP: buka `/live/interactive?agent=http://192.168.1.10:8082` + `viewerToken`.
6. TV: buka `/display` (leaderboard + gameplay) atau `/live/interactive` untuk gameplay penuh.
7. Untuk memberi izin kontrol: operator menyalakan **Input** di panel, perangkat menekan
   **AMBIL KONTROL**; controller lock menjamin hanya satu yang aktif. **E-STOP** melepas
   semua input kapan pun.

> ⚠ Website harus dibuka via **HTTP** atau dari jaringan yang sama — browser memblokir
> halaman HTTPS yang memanggil server HTTP lokal (mixed content). Di venue, gunakan
> Wi-Fi/hotspot lokal dan buka via IP LAN.

---

## 5. Keamanan

- Semua endpoint admin butuh `adminToken` (dibandingkan timing-safe).
- WebSocket butuh `viewerToken` atau `adminToken` di `?token=`.
- Agent **membaca file config lokal** dan **tidak pernah** menyimpan kredensial game/Google.
- Bind di `0.0.0.0` supaya HP/TV di LAN bisa akses — **jangan pernah port-forward
  port agent ke internet**. Ini aplikasi jaringan lokal.

---

## 6. KETERBATASAN (JUJUR)

1. **Input hanya ke jendela foreground.** SendInput mengirim ke window yang sedang
   aktif — agent mencoba `SetForegroundWindow` ke jendela game dulu, tapi Windows
   membatasi ini (aturan focus stealing). Kalau operator sedang mengetik di jendela
   lain, input remote bisa salah sasaran. Untuk hasil terbaik: biarkan jendela game
   aktif, jangan mengetik di komputer produksi saat orang lain mengendalikan.
2. **Jendela minimize = capture & input berhenti.** `gdigrab` tidak bisa menangkap
   jendela yang di-minimize. Status berubah jujur ke `WAITING FOR GAME`.
3. **Tanpa audio** secara default (gdigrab video-only). Audio bisa lewat OBS jika
   diperlukan.
4. **Latency WebRTC di LAN ±0.3–1 detik** — normal untuk WebRTC+MediaMTX.
5. **Tidak ada macro/bot/otomatisasi** — semua input berasal dari tangan manusia di
   browser. **Tidak ada** injeksi memori / bypass anti-cheat / manipulasi game —
   hanya input level OS yang sah.
6. Kalau metode input dibatasi oleh game/Windows, agent melaporkannya dan mode
   **menonton** tetap tersedia.

---

## 7. Troubleshooting

| Masalah | Penyebab & Solusi |
|---|---|
| `GAME NOT FOUND` | Game belum dibuka / judul beda. Buka Free Fire dulu, atau tambahkan judul jendela di `gameTitles` |
| `WAITING FOR GAME` | Jendela game di-minimize — restore jendelanya |
| Capture error: ffmpeg tidak ditemukan | `ffmpegPath` salah — letakkan `ffmpeg.exe` di `agent/bin/` |
| Capture error: title not found | Judul jendela tidak cocok — cek dashboard `/` untuk daftar jendela terlihat |
| Video di HP tidak muncul | HP beda Wi-Fi / client isolation router / mixed content (buka via HTTP) — uji `http://IP:8889/bof-game` langsung |
| `mediamtx` tidak jalan | Binary tidak ada di `bin/` atau port 8888/8889 dipakai aplikasi lain — ganti port di config |
| Input tak merespons | `inputEnabled` masih false / koffi belum terpasang / game bukan jendela foreground |
| `E-STOP` menyalakan terus | E-STOP bersifat sticky — operator nyalakan lagi input via panel (`/api/input enabled:true`) |
| Port 8082 dipakai aplikasi lain | Ganti `httpPort` di config.json |
| Firewall blokir | Izinkan Node.js pada jaringan privat (Windows Firewall prompt saat start) |
| TV tidak terhubung | TV harus satu subnet; cek uji browser TV ke `http://IP:8082/` |
| Latency tinggi | Turunkan kualitas ke `medium`/`low`, gunakan 5 GHz / kabel, tutup unduhan lain |
| Layar hitam saat capture | Game berjalan exclusive fullscreen — pindahkan game ke **windowed/borderless** |

---

## 8. Struktur folder

```
agent/
├── package.json          # dependensi: ws (koffi optional untuk input)
├── config.example.json   # template config
├── config.json           # dibuat otomatis (berisi token — JANGAN di-push)
├── start.bat / start-hidden.bat / stop.bat
├── bin/                  # taruh ffmpeg.exe + mediamtx.exe di sini
└── src/
    ├── index.mjs         # entry: wiring semua modul
    ├── config.mjs        # load/normalize/persist config + token generator
    ├── logger.mjs        # log console+file + sanitize token
    ├── windows.mjs       # deteksi jendela game (koffi / fallback PowerShell)
    ├── input.mjs         # SendInput keyboard/mouse/joystick/touch (koffi)
    ├── capture.mjs       # ffmpeg gdigrab → RTSP MediaMTX
    ├── mediamtx.mjs      # manajemen proses MediaMTX + probe
    ├── httpapi.mjs       # REST API + dashboard HTML + proxy WHEP/HLS
    └── ws.mjs            # WebSocket input channel (auth, rate limit, controller lock)
```

DEVELOPED BY SAPUTRA DEVELOPER — STIKAR ESPORTS.
