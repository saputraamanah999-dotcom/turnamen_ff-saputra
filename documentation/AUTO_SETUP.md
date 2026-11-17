# AUTO_SETUP.md — Bridge & Siaran Lokal Otomatis

Cukup **satu klik** di laptop produksi. Bridge mengurus sisanya.

> **Alternatif tanpa bridge sama sekali**: mode siaran **P2P** menyalurkan video langsung
> laptop → penonton via WebRTC dengan signaling Firestore — tanpa `start-bridge.bat`, tanpa
> MediaMTX, tanpa OBS, tanpa install apa pun (maks 2 penonton, dapat diatur 1–4; butuh internet
> hanya untuk signaling). Panduan lengkap & troubleshooting: **[P2P_MODE.md](./P2P_MODE.md)**.

## Yang dilakukan otomatis

| Hal | Cara kerja |
|---|---|
| `.env` + token | Dibuat dari `.env.example`, `BRIDGE_TOKEN` acak diisi dan **disimpan** (tidak berubah tiap restart). |
| Password OBS | Dibaca dari konfigurasi obs-websocket milik OBS di laptop ini (best-effort). Kalau gagal, isi `OBS_PASSWORD` di `.env`. |
| `config.json` | Disalin dari `config.example.json` (whitelist 9 scene). |
| MediaMTX | Dijalankan bridge dari `broadcast-bridge/mediamtx/bin/<os>-<arch>/`, config dibuat ulang tiap start (`mediamtx.generated.yml`), restart otomatis kalau crash. Kalau MediaMTX sudah jalan, dipakai ulang. |
| IP laptop | Dipilih otomatis dari adapter yang relevan (adapter VirtualBox/WSL/VPN dilewati). Perubahan IP dicatat di terminal. |
| Website admin | Halaman Admin membaca token + IP dari `http://127.0.0.1:8080/api/bootstrap` — tanpa isi manual. URL HLS / WHE / WHIP terisi dan tersimpan ke Firestore. |
| Penonton | Halaman `/live` menampilkan tombol **Buka siaran lokal** bila admin sudah mendeteksi IP laptop. |

## Cara pakai

1. (Sekali, Windows) klik kanan `broadcast-bridge/buka-firewall.bat` → **Run as administrator**.
2. Buka OBS → **Tools → WebSocket Server Settings** → aktifkan server + password.
3. Klik dua kali **`start-bridge.bat`** (di folder utama atau `broadcast-bridge/`). Pertama kali butuh internet untuk `npm install`.
4. Di terminal akan muncul ringkasan: IP laptop, link TV/HP, token.
5. Buka website → **Admin → Broadcast** **di browser laptop yang sama**. Chrome mungkin menanyakan izin akses jaringan lokal → **Izinkan**.
6. Mode stream **MediaMTX** → URL terisi sendiri (atau klik **Pakai jaringan ini**).
7. **Admin → Live Control** → pilih sumber capture → PREPARE → START LIVE (browser tetap meminta kamu memilih layar/jendela yang dibagikan — itu tidak bisa diotomatiskan).
8. TV / HP di Wi-Fi yang sama: buka `http://IP-LAPTOP:8080/display`.

## Keamanan `/api/bootstrap`

Token hanya diberikan bila **semua** ini terpenuhi: koneksi dari loopback (laptop ini), header Host `localhost`/`127.0.0.1` (anti DNS-rebinding), dan Origin ada di `ALLOWED_ORIGINS` di `.env` (default: `https://turnamen-ff-saputra.vercel.app`, plus `http://localhost:*`). Kalau domain Vercel kamu berbeda, tambahkan ke `ALLOWED_ORIGINS` (pisahkan koma).

## Batasan (jujur)

- Deteksi otomatis hanya jalan bila admin dibuka di **browser laptop yang menjalankan bridge**. Dari perangkat lain bridge tidak bisa ditebak.
- Penonton di halaman publik HTTPS tidak bisa dideteksi otomatis "sedang di LAN" — browser memblokir HTTPS→HTTP. Karena itu ada tombol **Buka siaran lokal**, atau pakai link `http://IP:8080/display`.
- Jaringan dengan *client isolation* memblokir HP/TV → laptop. Pakai hotspot laptop.
- Port yang dibuka di firewall hanya 8080/8888/8889 (TCP) dan 8189 (UDP, media WebRTC). Port 8078 (bridge) dan OBS 4455 jangan dibuka. Jangan port-forward di router.

## Binary MediaMTX

`broadcast-bridge/mediamtx/bin/windows-amd64/mediamtx.exe` dan `darwin-amd64/mediamtx` (v1.21.3, lisensi MIT). Untuk Linux/ARM taruh binary di `bin/linux-amd64/` dll, atau set `MEDIAMTX_BIN` di `.env`. Folder `bin` dikecualikan dari deploy Vercel (`.vercelignore`).
