# STIKAR BROADCAST BRIDGE

Service Node.js **lokal** yang menjembatani **website STIKAR ESPORTS** dengan **OBS Studio**
melalui plugin **obs-websocket v5**. Bridge berjalan di laptop produksi sekolah dan
**hanya listen di localhost/LAN** — OBS WebSocket **TIDAK PERNAH terekspos ke internet publik**.
100% gratis, tanpa API berbayar.

```
┌──────────────────┐     ws://127.0.0.1:8078      ┌────────────────────┐     ws://127.0.0.1:4455      ┌────────────┐
│ Website STIKAR   │ ───────────────────────────► │  Broadcast Bridge  │ ───────────────────────────► │ OBS Studio │
│ (panel operator) │   (?token=..., hanya lokal)  │  (Node.js + 'ws')  │  (plugin obs-websocket v5)   │            │
└──────────────────┘                              └────────────────────┘                              └────────────┘
```

Semua panah tetap di dalam laptop (localhost). Tidak ada komponen yang dibuka ke internet.

---

## Fitur

- **Switch scene** OBS — hanya scene yang ada di whitelist `config.json`
- **Toggle source** — tampil/sembunyikan sumber (mis. overlay) di sebuah scene
- **Refresh overlay** — refresh browser source (memakai hotkey OBS "Refresh browser sources")
- **Status OBS** — koneksi terhubung/bukan, versi OBS, status streaming & recording
- **Auto-reconnect** — bridge tetap hidup walau OBS belum jalan (status: `disconnected`)
- **Keamanan berlapis** — token auth, localhost-only, rate limit 30 pesan/detik,
  whitelist perintah, whitelist scene, log yang disanitasi (password tidak pernah dicatat)

## Struktur folder

```
broadcast-bridge/
├── src/
│   ├── index.js              # entry point: WebSocket server (127.0.0.1:8078) + koneksi OBS
│   ├── logger.js             # log berwarna ke console + file logs/bridge.log
│   ├── obs/
│   │   └── client.js         # klien obs-websocket v5 (auto-reconnect, localhost saja)
│   ├── websocket/
│   │   └── server.js         # WS server untuk website (paket 'ws' murni, ringan)
│   ├── commands/
│   │   └── handlers.js       # whitelist perintah: getStatus, getScenes, switchScene, ...
│   └── security/
│       ├── auth.js           # validasi token + rate limit (30 msg/dtk) + cek IP privat
│       └── whitelist.js      # load scene whitelist & overlay sources dari config.json
├── logs/                     # dibuat otomatis saat berjalan (bridge.log)
├── package.json
├── .env.example              # salin jadi .env
├── config.example.json       # salin jadi config.json
└── README.md
```

## Persyaratan

- **Node.js >= 18** di laptop produksi
- **OBS Studio >= 28** (plugin obs-websocket **v5** sudah bawaan sejak OBS 28)
- Website/panel berjalan di laptop yang sama (atau di LAN privat — lihat bagian Keamanan)

## Instalasi

```bash
cd broadcast-bridge
npm install
```

Lalu siapkan konfigurasi:

```bash
cp .env.example .env            # Windows: copy .env.example .env
cp config.example.json config.json
```

Isi `.env`:

| Variabel | Isi |
|---|---|
| `OBS_WS_URL` | `ws://127.0.0.1:4455` (biarkan default) |
| `OBS_PASSWORD` | password WebSocket OBS (lihat langkah setting OBS di bawah) |
| `BRIDGE_HOST` | `127.0.0.1` (default, **jangan** `0.0.0.0`) |
| `BRIDGE_PORT` | `8078` |
| `BRIDGE_TOKEN` | token kuat acak. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `BRIDGE_PASSWORD_HINT` | catatan internal untuk operator (opsional) |

Di `config.json`, samakan `sceneWhitelist` dengan **nama scene PERSIS** seperti di OBS
(besar/kecil huruf harus sama). `overlaySources` berisi path halaman overlay di website.

## Setting OBS Studio (plugin obs-websocket v5)

1. Buka OBS Studio → menu **Tools** → **WebSocket Server Settings**
2. Centang **Enable WebSocket Server**
3. **Server Port**: `4455`
4. Centang **Enable Authentication**, lalu isi **password yang kuat** (jangan kosong)
5. Klik **OK**
6. Catatan keamanan: OBS WebSocket ikat ke semua interface, jadi pastikan firewall laptop
   **memblokir port 4455 dari luar** (semua koneksi OBS dari bridge tetap lewat localhost),
   dan **jangan pernah port-forward 4455 maupun 8078 di router**.

## Menjalankan bridge

```bash
npm run dev
```

Contoh output:

```
[2025-01-01T09:00:00.000Z] INFO   STIKAR BROADCAST BRIDGE — mulai
[2025-01-01T09:00:00.010Z] OK     Config dimuat — scene whitelist berisi 9 scene
[2025-01-01T09:00:00.012Z] OBS    Menghubungkan ke OBS di ws://127.0.0.1:4455 ...
[2025-01-01T09:00:00.015Z] WARN   OBS belum terhubung (OBS tidak dapat dihubungi ...)
[2025-01-01T09:00:00.016Z] OK     STIKAR Broadcast Bridge siap di ws://127.0.0.1:8078 (hanya localhost/LAN)
[2025-01-01T09:00:02.020Z] OBS    Terhubung ke OBS Studio
```

- Log file: `logs/bridge.log`
- Log debug verbose: `BRIDGE_DEBUG=1 npm run dev`
- Mode produksi (biasa): `npm start`

## Cara website terhubung ke bridge

Buka WebSocket ke `ws://127.0.0.1:8078?token=TOKEN_ANDA` (token = `BRIDGE_TOKEN` di `.env`).

```js
const ws = new WebSocket('ws://127.0.0.1:8078?token=' + TOKEN);

ws.onopen = () => kirim('getStatus', {});
ws.onmessage = (e) => console.log('dari bridge:', JSON.parse(e.data));
ws.onclose = (e) => {
  // e.code 4001 = token tidak valid
  // e.code 4003 = koneksi bukan dari localhost/LAN privat
  // e.code 4008 = rate limit terlampaui
};

function kirim(command, params = {}) {
  ws.send(JSON.stringify({ type: 'request', id: Date.now(), command, params }));
}

kirim('getScenes');
kirim('switchScene', { scene: 'Main Gameplay' });
kirim('toggleSource', { scene: 'Main Gameplay', source: 'Overlay Compact', visible: true });
kirim('refreshOverlay', { source: 'Overlay Full' });
kirim('getOutputs');
```

### Daftar perintah

| Perintah | Params | Fungsi |
|---|---|---|
| `getStatus` | — | Status koneksi OBS + versi (boleh dipanggil kapan pun) |
| `getScenes` | — | Daftar scene, scene aktif, dan whitelist |
| `switchScene` | `scene` | Pindah scene — **whitelist saja** |
| `toggleSource` | `scene`, `source`, `visible?` | Tampil/sembunyi sumber; tanpa `visible` = toggle |
| `refreshOverlay` | `source?` | Refresh browser source; tanpa `source` = semua browser source |
| `getOutputs` | — | Status streaming & recording |

Perintah lain **ditolak** dengan pesan `"Perintah tidak dikenal atau tidak diizinkan"`.

### Format respons

```json
{ "ok": true,  "id": 1735700000000, "command": "getScenes", "data": { "scenes": ["Starting Soon"], "current": "Starting Soon", "whitelist": ["..."] } }
{ "ok": false, "id": 1735700000000, "command": "switchScene", "error": "Scene \"X\" tidak ada di whitelist (config.json)" }
```

### Event broadcast (push dari bridge)

Setiap perubahan status OBS, semua klien yang terhubung menerima:

```json
{ "type": "event", "event": "obs-update", "data": { "reason": "connected", "connected": true, "version": "30.1.2", "outputs": { "stream": { "active": true }, "recording": { "active": false } } } }
```

`reason`: `connected` | `disconnected` | `output` | `scene` | `version`.

---

## Keamanan (WAJIB DIBACA)

- ✅ Bridge listen hanya di **127.0.0.1** (default). Jangan set `BRIDGE_HOST=0.0.0.0`.
- ✅ Website wajib membawa **token** (`?token=...`) — dibandingkan secara time-safe.
- ✅ Hanya menerima koneksi dari **localhost / LAN privat** (10.x, 172.16–31.x, 192.168.x, ::1, fe80::, fc/fd).
- ✅ **Rate limit** 30 pesan/detik per koneksi; pelanggaran berulang → koneksi diputus (kode 4008).
- ✅ **Whitelist perintah** — hanya 6 perintah di atas yang boleh; lainnya ditolak.
- ✅ **Whitelist scene** — `switchScene` hanya untuk scene di `config.json`.
- ✅ **Password/token tidak pernah dicatat ke log** (otomatis disanitasi di `logger.js`).
- ❌ **JANGAN pernah port-forward port 8078 atau 4455 di router ke internet.**
- ❌ Jangan jalankan bridge di VPS/publik — memang didesain untuk laptop produksi lokal.
- ❌ Jangan bagikan `BRIDGE_TOKEN` / `OBS_PASSWORD` ke luar tim operator.
- 🔥 Firewall: pastikan port 8078 hanya bisa dijangkau dari laptop/LAN privat, dan 4455 diblokir dari luar.

## Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| Log berulang: `OBS belum terhubung (OBS tidak dapat dihubungi ...)` | OBS belum jalan / plugin belum enable / port bukan 4455 → cek **Tools > WebSocket Server Settings** |
| `Password OBS salah` | `OBS_PASSWORD` di `.env` tidak sama dengan password di OBS |
| Website terputus dengan close code `4001` | Token salah → cocokkan token yang dipakai website dengan `BRIDGE_TOKEN` di `.env` |
| Website terputus dengan close code `4003` | Koneksi bukan dari localhost/LAN privat |
| `Scene "X" tidak ada di whitelist (config.json)` | Tambahkan scene ke `sceneWhitelist` di `config.json` (nama harus persis) |
| `Sumber "X" tidak ditemukan di scene "Y"` | Nama source salah / source tidak ada di scene tersebut |
| Refresh overlay tidak berdampak | Fitur memakai hotkey OBS "Refresh browser sources" — cek manual: klik kanan browser source → Refresh. Pastikan overlay adalah browser source |
| Port 8078 sudah dipakai aplikasi lain | Ubah `BRIDGE_PORT` di `.env` (dan sisi website), lalu jalankan ulang |
| Klien sering terputus `4008` | Website mengirim lebih dari 30 pesan/detik — throttle di sisi website |
| Ingin lihat detail koneksi | `BRIDGE_DEBUG=1 npm run dev`, atau buka `logs/bridge.log` |

## Catatan lain

- Bridge **tidak akan crash** walau OBS belum dibuka — status tetap `disconnected` dan
  koneksi dicoba ulang otomatis (2 dtk, 4 dtk, 8 dtk, ... maks 30 dtk).
- Bila `BRIDGE_TOKEN` kosong saat bridge dijalankan, bridge membuat token sementara acak
  dan mencetaknya sekali ke console (untuk uji coba saja — tetap isi `.env` untuk produksi).
- Gratis untuk STIKAR ESPORTS / komunitas. Tanpa layanan berbayar.
