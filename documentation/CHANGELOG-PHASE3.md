# CHANGELOG — PHASE 3: STIKAR INTERACTIVE GAME STREAM

**Project:** STIKAR ESPORTS / BATTLE OFF FRIENDS (BOF) — SMK TI Bali Global Karangasem
**Developer:** SAPUTRA DEVELOPER
**Status:** Diimplementasikan penuh pada repo ini. Tidak mengganti sistem scoring, tidak mengganti database, tidak menghapus fitur lama.

---

## 1 · Modul baru

| Modul | Route/Lokasi | Fungsi |
|---|---|---|
| STIKAR BROADCAST AGENT | `agent/` (Node.js ≥20, Windows) | Deteksi jendela Free Fire (koffi/user32 + fallback PowerShell), capture ffmpeg `gdigrab` → MediaMTX (RTSP 8554 → WebRTC/WHEP 8889 + HLS 8888), forwarding input (touch/joystick/tombol) via WebSocket terautentikasi → SendInput, REST API + dashboard status jujur, proxy WHEP/HLS (anti-CORS), controller lock, E-STOP |
| Interactive Game Viewer | `/live/interactive` | Video gameplay besar (WHEP→HLS fallback), joystick virtual + tombol aksi + sentuh layar, Touch Map Editor (posisi/ukuran/opacity/label/key, tersimpan per perangkat), klaim/lepas kontrol, badge latency & controller, fullscreen, kualitas Low/Medium/High, mode menonton jujur saat input dimatikan |
| Operator Panel Interactive | `/admin/interactive-stream` | Hubungkan Agent (URL + admin token), status dashboard realtime (game/capture/MediaMTX/input/CPU/mem/freshness frame), pilih sumber (window/desktop), mulai/stop capture, kualitas, izin kontrol + RELEASE + EMERGENCY STOP, **Pre-Flight Broadcast** (10 pemeriksaan → READY / NOT READY + alasan), QR pairing perangkat, registrasi perangkat ke Firestore |
| Panduan Interactive Stream | `/guide/interactive-stream` | Instalasi agent, jaringan hotspot/router, pairing HP & TV, izin kontrol, touch control, keterbatasan jujur, troubleshooting |
| Panduan Google Play Games | `/guide/google-play-games` | Persiapan komputer, instalasi resmi, login **di aplikasi PC** (peringatan kredensial), checklist game siap + arti status GAME NOT FOUND → STREAM READY |
| Klien Agent (website) | `src/services/agent/client.ts` | Kontrak REST + WebSocket (`AgentInputChannel`) yang dipakai viewer & panel; juga acuan protokol `agent/src/ws.mjs` |

## 2 · Modul lama yang dipertahankan

Seluruh sistem sebelumnya tetap utuh: turnamen/tim/pemain/match, scoring engine BOF resmi, leaderboard realtime, TV Display (gameplay 72% + leaderboard 28% + ticker + scene presentasi), Overlay Manager (23 layer + preset + push/restore), Broadcast Control (state machine + WHIP), OBS integration (broadcast-bridge), Local Network wizard + pairing, AI Observer, Map History, Audit Logs, statistik admin/publik, awards/champion.

**Perbaikan atas sistem lama:**
- `broadcast-bridge`: perintah `startStreaming`/`stopStreaming` kini ada di whitelist dan dipetakan ke OBS `StartStream`/`StopStream` (sebelumnya tombol Start/Stop Output selalu ditolak).
- setup.html **v1.6**: fix 403 tahap ⑥ (composite index) — preflight izin IAM (`testIamPermissions`), tautan grant 1-klik (`roles/datastore.indexAdmin` / `roles/firebaserules.admin` / Owner), tahap index menjadi **non-blokir** (composite itu optional — semua query memakai single-field orderBy yang otomatis ter-index), koleksi `interactiveSettings/interactiveDevices/interactiveSessions` di seed & rules.

## 3 · Koleksi Firestore baru (metadata saja)

`interactiveSettings/{tid}` (publik baca, admin tulis — di-seed default `inputEnabled:false`, `controllerLock:true`, `defaultQuality:"high"`), `interactiveDevices/{id}` + `interactiveSessions/{id}` (signedIn baca, admin tulis). **Video dan input real-time TIDAK PERNAH lewat Firestore** — jalurnya WebRTC (MediaMTX) + WebSocket (Agent) di jaringan lokal.

## 4 · Perbaikan bug (hasil audit penuh)

1. **Date bug utama**: `admin/map-history` menampilkan "Invalid Date" — observer mengirim ISO string tetapi dikonversi `Number(iso)` → NaN. Kini di-parse `Date.parse` + format tolerant `formatTime` (juga di `/live/status`).
2. `updatedAt` match kini konsisten `serverTimestamp()` (sebelumnya campur number).
3. Hydration mismatch overlay `?w=` — ukuran jendela diukur setelah mount (rAF).
4. Placement input `max` kini mengikuti `tournament.teamCapacity` (bukan hardcode 12).
5. Wizard `/admin/settings` langkah 7–9 kini pakai sinyal nyata (streamMode, probe AI Observer, status live).
6. `/api` bukan lagi "Hello, world!" — info aplikasi.
7. Dead code dihapus: `src/lib/db.ts` (Prisma), dependency `gsap` (tidak pernah dipakai).
8. Link guide kini `next/link` (bukan `<a>` full reload).

## 5 · Keamanan

- Tidak ada password Google/Free Fire/OTP/cookie diminta/disimpan di mana pun.
- Video & input tidak lewat Firestore; input lewat WebSocket dengan token (admin/viewer) dibandingkan timing-safe, rate limit 30 msg/s, cap 64KB.
- `inputEnabled` default **false**; controller lock default **true**; hanya admin yang memberi izin; E-STOP melepas semua input; input dihentikan saat disconnect.
- Pairing (menonton) ≠ izin kontrol (diberikan admin terpisah).
- Tidak ada macro/bot/otomatisasi/injeksi memori/bypass anti-cheat — hanya SendInput level OS ke jendela foreground.

## 6 · Keterbatasan teknis (jujur)

1. Input hanya teruskan ke **jendela foreground**; komputer produksi sebaiknya tidak dipakai mengetik saat ada controller jarak jauh.
2. Jendela game **minimize = capture & input berhenti** (gdigrab tidak bisa jendela minimize) — status jujur `WAITING FOR GAME`.
3. Tanpa audio default (gdigrab video-only); audio opsional via OBS.
4. Latency WebRTC LAN ±0.3–1 s.
5. Website HTTPS yang memanggil Agent HTTP lokal diblokir browser (mixed content) — gunakan Wi-Fi lokal/hotspot dan buka via IP LAN (dokumentasi lengkap di guide).
6. Hal yang belum bisa diuji di sandbox (Linux tanpa GPU/Windows): SendInput nyata (koffi), gdigrab, MediaMTX end-to-end, OBS WebSocket live. Kode sudah lolos `node --check` + smoke test config; pengujian lapangan tinggal dijalankan di PC Windows produksi sesuai `agent/README.md`.

## 7 · Hasil verifikasi

- `npm run build` ✓ — 51 halaman sukses (termasuk 4 halaman baru).
- `npx tsc --noEmit` ✓ — tanpa error.
- `npm run lint` ✓ — **0 error** (75 warning terdokumentasi: aturan react-hooks v7 gaya React Compiler yang diturunkan ke warning karena pola animasi siaran disengaja + komponen shadcn vendor).
- `node scripts/test-setup-html.mjs` ✓ — 63 dokumen seed + skenario 403/IAM/index/rules lolos.
- `npx tsx scripts/test-scoring.ts` ✓ — 16 test scoring lolos.
- `node --check` semua 9 file `agent/src/*.mjs` ✓ + smoke test `loadConfig` ✓.
- Smoke test halaman dev: `/live/interactive`, `/admin/interactive-stream`, `/guide/interactive-stream`, `/guide/google-play-games`, `/guide` → HTTP 200.
