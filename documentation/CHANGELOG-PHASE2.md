# ZEROID ESPORTS — PHASE 2 CHANGELOG

**FIRESTORM ARENA — Advanced Live Broadcast, Local Network Streaming, TV Display & Esports UI**
Tournament: BATTLE OFF FRIENDS (BOF) · SMK TI BALI GLOBAL KARANGASEM
Developed by **Saputra Developer** — dibangun DI ATAS commit terakhir (tanpa menghapus fitur lama).

---

## 1. DESIGN SYSTEM — FIRESTORM ARENA

- Palet resmi baru: Deep Black `#080B10`, Charcoal `#111821`, Dark Panel `#18212C`, Fire Orange `#FF5A1F`, Flame `#FF8A00`, Gold `#FFC247`, Electric Cyan `#35D6FF`, White `#F7F9FC`, Muted `#98A2B3`.
- Font: **Barlow Condensed** (judul broadcast), **Rajdhani** (angka statistik/skor), Inter (body) — semua via `next/font` dengan fallback sistem.
- Komponen dasar (`bo-card`, `bo-btn`, `bo-badge`, `bo-kicker`, dsb.) ditata ulang ke gaya arena: sudut miring (clip-path), gradient api, glow terukur, panel gelap — **seluruh ±40 halaman ikut berganti tema tanpa kehilangan fungsi**.
- **5 tema resmi** (§24): Firestorm Orange (default), Obsidian Gold, Cyber Blue, Purple Arena, Black Championship — via design tokens `html[data-theme]`, bisa dipilih di **Admin → Pengaturan**, tersimpan di perangkat, tombol reset tersedia.
- Animasi baru: `fs-live-badge`, `fs-scanline`, `fs-onair`, `fs-connecting`, `fs-pop`, `fs-live-in`, ticker broadcast, progress bar api, dan `prefers-reduced-motion` dihormati.

## 2. LIVE CONTROL — PUSAT KENDALI SIARAN (§5)

`/admin/live-control` dibangun ulang total:

- **Mesin status resmi**: OFFLINE → PREPARING → READY → CONNECTING → STARTING → LIVE ⇄ PAUSED → RECONNECTING → STOPPING (+ ERROR). Status tersimpan realtime ke `broadcastSettings/{tid}.live` sehingga TV & /live ikut bereaksi.
- **Sumber video nyata**: capture jendela/layar penuh via `getDisplayMedia` (tab admin dikecualikan otomatis), atau OBS output. Preview 16:9 + deteksi **layar hitam**, **frame beku**, dan **sumber terputus** (sampling canvas, tanpa menyimpan video).
- **Destination**: LOCAL NETWORK / PUBLIC INTERNET / LOCAL+PUBLIC.
- **Preflight check** 6 poin (sumber, tujuan, WHIP endpoint, database, match current, OBS opsional) — START LIVE hanya aktif bila lolos.
- **Streaming stats** jujur (N/A bila tak tersedia): source, output, viewers (dari gateway lokal), bitrate (getStats WebRTC), fps, resolusi, latency, last frame.
- **Kontrol**: PREPARE / START LIVE / PAUSE / RESUME / RECONNECT (backoff maks 5 percobaan) / STOP LIVE (dengan konfirmasi).
- **Broadcast Announcement** (§11): 11 jenis event + pesan + preview animasi sebelum dikirim ke TV.
- **OBS panel**: status/versi/scene/output via broadcast-bridge — tidak pernah mengklaim terhubung bila gagal.

## 3. LOCAL BROADCAST ENGINE (§6, §7, §8)

- **Engine streaming browser** baru (`src/services/broadcast/stream.ts`): publish **WHIP** (getDisplayMedia → MediaMTX), stats koneksi, quality monitor, reconnect bertingkat, dan pemutar **WHE** (WebRTC playback).
- **broadcast-bridge v2** kini menjadi **Local Broadcast Gateway**:
  - HTTP server LAN (default 8080): halaman `/display/:tid` & `/live/:tid` bergaya ZEROID (Mode A — TV buka URL lokal, video muncul otomatis tanpa internet untuk video).
  - **Proxy MediaMTX** (`/mediamtx/*` → WHIP/WHE :8889, `/hls/*` → :8888) — same-origin, bebas masalah CORS/mixed-content untuk viewer LAN.
  - **Pairing** (Mode B): kode 6 digit berlaku 15 menit, bisa dicabut admin, redeem via `/api/pairing/redeem`.
  - **Presence viewer NYATA** via WebSocket `/ws-viewer` (hitungan & daftar perangkat sungguhan).
  - **Deteksi IP LAN asli** dari network interface laptop + probe MediaMTX + notifikasi bila IP berubah.
  - Endpoint admin dilindungi BRIDGE_TOKEN; tidak ada kredensial yang diekspos ke viewer (§22).
- Konfigurasi & panduan MediaMTX: `broadcast-bridge/mediamtx/` (gratis, open-source).

## 4. TV DISPLAY PROFESIONAL (§9, §10, §11)

- `/display` dan `/display/:tournamentId` (baru) — layout siaran: **header broadcast** (logo | ROUND/MAP/STATUS | LIVE + jam), **gameplay ±72%** kiri, **leaderboard ±28%** kanan, **ticker** bawah; fullscreen; mobile menumpuk (gameplay → info → leaderboard).
- **Animasi LIVE NOW** otomatis saat operator menekan START LIVE (event `LIVE_NOW` dari Firestore), banner event lain (MATCH PAUSED, dsb.).
- Kill feed dari **AI Observer** (event nyata; kosong = belum ada event).
- Layar **Reconnecting / Signal Lost / Starting Soon / Emergency** — tidak ada video kosong tanpa penjelasan (§26: fallback tombol PLAY untuk autoplay TV).
- **Presentasi TV (§17)**: state disimpan di `presentationState/{tid}` — kendali Start/Pause/Next/Prev/Auto dari admin dan **TV mengikuti realtime** (13 scene, scene "gameplay" menyerahkan layar ke gameplay).

## 5. HALAMAN LIVE PUBLIK (§8)

- `/live`, `/live/:tournamentId` — dibangun ulang: auto-connect video (WHE → HLS → YouTube), info match, leaderboard broadcast-grade, banner pengumuman & status.
- `/live/connect` (baru) — halaman **pairing** Mode B: kode/QR → simpan konfigurasi aman di browser → redirect /live. Batasan browser HTTPS→HTTP dijelaskan jujur.
- `/live/status` (baru) — papan status: mesin siaran, database, gateway lokal (bila pairing), event terakhir.

## 6. OVERLAY MANAGER TOTAL REDesign (§13)

- **23 layer** resmi dengan toggle ON/OFF + posisi, opacity, ukuran, animasi, z-index, durasi per layer.
- **8 preset siaran**: FULL BROADCAST, CLEAN GAMEPLAY, FULL LEADERBOARD, TOP 3, MATCH INFO, RESULT PRESENTATION, CHAMPION REVEAL, EMERGENCY.
- **Konfigurasi per-scene** (6 scene) — perubahan satu scene tidak merusak scene lain.
- **Preview editor 16:9** visual (bukan sekadar checkbox) dengan mode EDIT / PREVIEW / ON AIR.
- **PUSH TO BROADCAST**: PREVIEW (simpan draft) → PUSH (tayang ke `/overlay/*`, TV, /live) → CANCEL → **RESTORE PREVIOUS** (backup on-air sebelumnya). Event `OVERLAY_PUSHED` terkirim realtime.
- Renderer `/overlay/:tid/:layout` kini membaca konfigurasi ON AIR + layout **announcement** baru; URL Browser Source OBS bisa disalin langsung dari UI.

## 7. LEADERBOARD ESPORTS (§14)

- Komponen baru `BroadcastLeaderboard` (7 mode: compact/full/broadcast/tv/mobile/top3/results) — rank emas/silver/bronze sesuai spek, chip inisial tim warna deterministik, badge kill, angka Rajdhani besar, rincian placement/kill points pada mode full/results.
- Animasi: layout-slide saat pindah peringkat, pop+kilat emas saat poin berubah (pola React resmi, tanpa kedipan terus-menerus), indikator naik/turun/NEW.
- Satu sumber data: `publicLeaderboards` (scoring engine resmi) — tidak ada sistem skor kedua.

## 8. ADMIN PANEL (§4)

- Shell baru: sidebar bergrup dengan **collapse/expand + tooltip**, **drawer mobile** (tutup otomatis, tanpa horizontal overflow), logo ZEROID, topbar **status siaran realtime + Notification Center**.
- **Notification Center** (§18): hanya event NYATA (bridge connect/disconnect, OBS connect/output, gateway viewer, status siaran, event broadcast, match current) + filter kategori + timestamp.
- **Dashboard** (§4): Live status, turnamen, match berjalan, perangkat penonton (N/A bila bridge offline), sumber stream, OBS, jaringan lokal, AI Observer, klasemen ringkas — semua dari kondisi nyata.
- Halaman statistik admin (dibuat pada iterasi sebelumnya) ikut bergaya FIRESTORM.

## 9. ROUTING

- Baru: `/display/[tournamentId]`, `/live/connect`, `/live/status`, layout overlay `announcement`.
- Dipertahankan semua route lama; folder dynamic `[matchId]` diverifikasi benar (publik & admin).
- 47 halaman ter-compile (sebelumnya 34).

## 10. KEAMANAN & KEBENARAN DATA (§22, §21)

- Tidak ada frame video / binary ke Firestore. Viewer tidak bisa mengakses kontrol admin. Pairing punya masa berlaku & dapat dicabut. Password OBS & stream key tidak pernah tampil di publik. CORS proxy dibatasi LAN + loopback.
- Semua indikator status **jujur**: `N/A` bila data tidak tersedia, label `CACHED/DEMO` bila Firestore offline, `LIVE` hanya setelah koneksi benar-benar terhubung.

## 11. SETUP FIREBASE — v1.4

- `public/setup.html`: panduan error jelas per penyebab (403 IAM → peran yang dibutuhkan; SERVICE_DISABLED → API yang harus diaktifkan; UNAUTHENTICATED → kunci SA; FAILED_PRECONDITION → index masih dibangun), ringkasan komponen pada langkah ⑦. Terverifikasi test vm (payload ③④⑤⑥ semua sesuai kontrak REST).

## 12. VERIFIKASI

- `npm run build` — **sukses, 47 halaman**.
- `npm run lint` — **0 error, 0 warning** (12 error praproses diperbaiki, termasuk 3 di kode lama).
- `npm run test:scoring` — **16/16 pass**.
- Test vm `setup.html` — **pass (langkah ③④⑤⑥)**.
- Keterangan jujur: jalur **WHIP publish, MediaMTX, OBS, dan presence viewer** tidak dapat dijalankan end-to-end di lingkungan sandbox tanpa OBS/MediaMTX/hardware TV; kode mengikuti protokol resmi (WHIP/WHE MediaMTX, obs-websocket v5 via bridge yang sudah teruji) dan semua statusnya dirancang jujur. Pengujian lapangan mengikuti `documentation/CHECKLIST*.md` dan panduan `/guide/tv-display`.
