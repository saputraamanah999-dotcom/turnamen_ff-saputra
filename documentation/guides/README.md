# Indeks Guide Operasional STIKAR ESPORTS — BOF

17 guide operasional harian untuk operator sekolah. Urutan baca disarankan mengikuti alur penyelenggaraan: **persiapan (G01–G05) → teknis siaran (G06–G11) → AI (G12–G13) → operasi hari-H (G14–G17)**.

| Guide | Judul | Fokus |
|---|---|---|
| [GUIDE_01](GUIDE_01_membuat-turnamen.md) | Cara membuat turnamen | `/admin`, format BO3/BO5/BO7/Custom, kapasitas 12 tim, `tournamentId` |
| [GUIDE_02](GUIDE_02_menambahkan-peserta-tim.md) | Cara menambahkan peserta dan tim | Daftar tim, anggota, halaman `/teams` |
| [GUIDE_03](GUIDE_03_sistem-poin-bof.md) | Cara menggunakan sistem poin BOF | Tabel poin resmi (1st=20 … 12th=0, kill ×2), contoh ALPHA 36 / BRAVO 27, tiebreaker |
| [GUIDE_04](GUIDE_04_memasukkan-hasil-pertandingan.md) | Cara memasukkan hasil pertandingan | Input placement + kill, publikasi, `/matches` & `/results` |
| [GUIDE_05](GUIDE_05_mengedit-leaderboard.md) | Cara mengedit leaderboard | Koreksi dengan bukti, aturan poin match dipublikasikan |
| [GUIDE_06](GUIDE_06_menghubungkan-hp-ke-laptop.md) | Cara menghubungkan HP ke laptop | Mode developer, USB debugging, `adb devices` — diagram |
| [GUIDE_07](GUIDE_07_memakai-scrcpy.md) | Cara memakai scrcpy | Mode USB & TCP/IP (`adb tcpip 5555`), latency — diagram |
| [GUIDE_08](GUIDE_08_gameplay-ke-obs.md) | Cara memasukkan gameplay ke OBS | Window/Display Capture, Fit to screen — diagram |
| [GUIDE_09](GUIDE_09_pasang-overlay-di-obs.md) | Cara memasang overlay STIKAR di OBS | 5 overlay `/overlay/:tournamentId/...`, dimensi, transparan — diagram |
| [GUIDE_10](GUIDE_10_streaming-publik.md) | Cara mengatur streaming publik | YouTube Live (Mode A), stream key, `youtubeVideoId` di Broadcast Settings |
| [GUIDE_11](GUIDE_11_streaming-lokal-sekolah.md) | Cara membuat streaming lokal sekolah | MediaMTX (Mode B), `http://IP-LAPTOP:8888/stream`, hanya LAN — diagram |
| [GUIDE_12](GUIDE_12_jalankan-ai-observer.md) | Cara menjalankan AI Observer | venv, kalibrasi HUD/minimap, FPS 1/2/5, port 8077 — diagram |
| [GUIDE_13](GUIDE_13_baca-hasil-analisis-ai.md) | Cara membaca hasil analisis AI | Jenis event, confidence, konfirmasi manual, privasi |
| [GUIDE_14](GUIDE_14_ganti-scene-obs.md) | Cara mengganti scene OBS | 9 scene resmi, hotkey, alur acara |
| [GUIDE_15](GUIDE_15_lihat-pertandingan-via-hp.md) | Cara melihat pertandingan melalui HP | `/live`, `/leaderboard`, YouTube, Mode B via browser/VLC |
| [GUIDE_16](GUIDE_16_atasi-masalah-video-leaderboard.md) | Cara mengatasi masalah video dan leaderboard | Embed, `youtubeVideoId`, rules Firestore, console browser |
| [GUIDE_17](GUIDE_17_atasi-ai-gagal-baca-hud.md) | Cara mengatasi AI Observer gagal membaca HUD | Kalibrasi ulang region, resolusi, FPS, beban laptop |

## Panduan Teknis Pendukung

| Dokumen | Isi |
|---|---|
| [../README.md](../README.md) | Ringkasan proyek, arsitektur, quick start |
| [../FIREBASE_SETUP.md](../FIREBASE_SETUP.md) | Firebase Spark plan, Auth, Firestore, rules & indexes, seeding, super admin, hosting |
| [../OBS_SETUP.md](../OBS_SETUP.md) | Install OBS, 9 scene, Browser Source overlay, obs-websocket, audio/video |
| [../MIRRORING_SETUP.md](../MIRRORING_SETUP.md) | scrcpy USB & TCP/IP, flowchart 10 langkah |
| [../LOCAL_STREAMING.md](../LOCAL_STREAMING.md) | MediaMTX, konfigurasi RTSP→HLS/WebRTC, jaringan sekolah |
| [../YOUTUBE_SETUP.md](../YOUTUBE_SETUP.md) | Channel, verifikasi live, stream key, embed |
| [../AI_OBSERVER_SETUP.md](../AI_OBSERVER_SETUP.md) | Python 3.10+, venv, kalibrasi, Admin > AI Observer |
| [../TROUBLESHOOTING.md](../TROUBLESHOOTING.md) | Tabel masalah → penyebab → solusi |

## Panduan di Website

Panduan ringkas juga tersedia di website pada route `/guide`, `/guide/obs`, `/guide/mirroring`, dan `/guide/streaming`.

## Ingat 4 Prinsip Operator BOF

1. **Skor resmi = konfirmasi manual operator** — AI Observer hanya indikasi.
2. **Poin turnamen dihitung hanya dari match yang sudah dipublikasikan.**
3. **Stream key YouTube rahasia**; streaming lokal MediaMTX **hanya LAN sekolah**, tidak untuk internet, dan jangan buka port router tanpa izin admin jaringan.
4. **Frame AI tetap lokal** — tidak diunggah ke internet.
