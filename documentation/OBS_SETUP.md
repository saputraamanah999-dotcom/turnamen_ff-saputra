# OBS_SETUP.md — Setup OBS Studio untuk STIKAR ESPORTS (BOF)

Dokumen ini memandu menyiapkan **OBS Studio** di laptop produksi: instalasi, 9 scene resmi BOF, pemasangan overlay transparan, plugin obs-websocket, dan pengaturan audio/video. Setelah selesai, laptop siap menerima gameplay dari scrcpy (lihat [MIRRORING_SETUP.md](MIRRORING_SETUP.md)).

---

## 1. Install OBS Studio

1. Buka `https://obsproject.com` dan unduh OBS Studio untuk sistem operasi laptop (Windows/Linux).
2. Jalankan installer, ikuti langkah default (**Next → Next → Install → Finish**).
3. Buka OBS Studio. Saat pertama kali dijalankan muncul **Auto-Configuration Wizard**:
   - Pilih **Optimize for streaming, recording is secondary**.
   - Base (Canvas) Resolution: **1920×1080**.
   - FPS: **30** (cukup untuk turnamen sekolah; 60 jika laptop kuat).
   - Klik **Apply Settings**.
4. Jika wizard tidak muncul: menu **Tools → Auto-Configuration Wizard**.

📸 [Tempel screenshot: jendela Auto-Configuration Wizard OBS dengan resolusi 1920x1080]

---

## 2. 9 Scene Resmi BOF

Buat 9 scene berikut dengan **nama persis**. Klik kanan pada panel **Scenes** (kotak Scenes di bawah) → **Add Scene** → ketik nama scene.

| No | Nama Scene | Isi / Kegunaan |
|---|---|---|
| 1 | **Starting Soon** | Layar pembuka "menunggu mulai" saat countdown sebelum match. |
| 2 | **Main Gameplay** | Gameplay full screen dari scrcpy. Scene utama selama match. |
| 3 | **Gameplay + Compact Leaderboard** | Gameplay dengan leaderboard ringkas kecil di sisi layar (overlay compact). |
| 4 | **Full Leaderboard** | Leaderboard penuh menutupi layar, misalnya di antara match. |
| 5 | **Top 3 Ranking** | Peringkat 3 teratas, dipakai saat seremoni peringkat. |
| 6 | **Match Results** | Hasil match (skor per tim) setelah game selesai. |
| 7 | **Break** | Layar jeda, dipakai saat istirahat antar game. |
| 8 | **Winner Announcement** | Layar pengumuman juara di akhir turnamen. |
| 9 | **Stream Offline** | Layar "stream selesai/offline" setelah siaran berakhir. |

**Susunan isi scene (contoh standar):**
1. Scene **Main Gameplay**: tambahkan sumber **Window Capture** atau **Display Capture** (dari scrcpy — lihat MIRRORING_SETUP.md), lalu **Fit to screen** (klik kanan sumber → Transform → Fit to screen).
2. Scene **Gameplay + Compact Leaderboard**: duplikat isi Main Gameplay, tambahkan Browser Source overlay compact.
3. Scene layar-layar statis (Starting Soon, Break, Winner Announcement, Stream Offline, dst.): tambahkan **Image** atau **Browser Source** sesuai aset sekolah.

**Tips mengatur urutan:** susun scene sesuai alur acara: Starting Soon → Main Gameplay → Gameplay + Compact Leaderboard → Match Results → Full Leaderboard → Break → Top 3 Ranking → Winner Announcement → Stream Offline. Urutan di panel Scenes adalah urutan klik saat siaran.

---

## 3. Browser Source Overlay STIKAR

Overlay adalah halaman web transparan yang dipasang **di atas** gameplay. Tersedia 5 overlay:

| Overlay | URL (ganti `TOURNAMENT_ID`) |
|---|---|
| Leaderboard penuh | `/overlay/TOURNAMENT_ID/full` |
| Leaderboard ringkas | `/overlay/TOURNAMENT_ID/compact` |
| Top 3 | `/overlay/TOURNAMENT_ID/top3` |
| Info match | `/overlay/TOURNAMENT_ID/match-info` |
| Lower third | `/overlay/TOURNAMENT_ID/lower-third` |

Cara menambahkan (contoh: overlay compact untuk scene Gameplay + Compact Leaderboard):

1. Di scene tujuan, klik **+** pada panel **Sources** → pilih **Browser**.
2. Beri nama, misalnya `Overlay Compact`.
3. Isi **URL**: alamat website sekolah diikuti path overlay, misalnya `https://alamat-website-sekolah.web.app/overlay/TOURNAMENT_ID/compact`. Untuk uji coba di laptop yang juga menjalankan website secara lokal, gunakan `http://localhost:3000/overlay/TOURNAMENT_ID/compact`.
4. Atur **Width** dan **Height** sesuai dimensi yang didukung: **1920×1080**, **1600×900**, atau **1280×720**. Overlay dirancang untuk ketiga dimensi ini.
5. Centang **Refresh browser when scene becomes active** (overlay selalu fresh saat scene dibuka).
6. Klik **OK**. Overlay transparan dan **tanpa navbar/footer** — sisa canvas transparan sehingga gameplay di layer bawah tetap terlihat.
7. Atur posisi: klik sumber overlay → tarik/geser, atau klik kanan → Transform → sesuaikan.

**Uji transparansi:** overlay harus terlihat menempel di atas gameplay tanpa kotak hitam di sekelilingnya. Jika muncul latar hitam, tambahkan parameter `?transparent=1` pada URL overlay (contoh: `/overlay/TOURNAMENT_ID/compact?transparent=1`) dan pastikan sumbernya benar-benar tipe **Browser** di OBS, bukan screenshot gambar. Detail di [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

**Untuk turnamen dengan ID berbeda:** setiap turnamen punya `tournamentId` sendiri (terlihat di URL halaman leaderboard, misalnya `/leaderboard/TOURNAMENT_ID`). Ganti `TOURNAMENT_ID` di URL overlay agar overlay membaca data turnamen yang sedang berjalan.

---

## 4. Plugin obs-websocket (Untuk Broadcast Bridge)

Broadcast Bridge (layanan Node lokal, port **8078**) menghubungkan OBS dengan website. Untuk itu OBS perlu **obs-websocket** aktif.

1. OBS versi 28 ke atas sudah menyertakan obs-websocket bawaan. Menu **Tools → WebSocket Server Settings**.
2. Centang **Enable WebSocket server**.
3. **Server Port**: gunakan port bawaan (default 4455).
4. **Server Password**: buat password kuat. **Catat password ini** — nanti diisi pada konfigurasi Broadcast Bridge sebagai token. Password ini jangan dibagikan keluar tim panitia.
5. Klik **Apply**/OK.
6. Cek status: pojok kanan bawah OBS ada ikon WebSocket (bilik kecil). Jika Broadcast Bridge sudah berjalan dan terhubung, indikator menunjukkan koneksi aktif. Jika bridge "tidak connect", penyebab umum: obs-websocket belum di-enable, port/password (token) tidak cocok — lihat [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

> Jika OBS versi lama (di bawah 28), unduh plugin obs-websocket 4.x dari situs resmi obsproject lalu restart OBS.

---

## 5. Pengaturan Audio

Audio turnamen sekolah biasanya: suara game dari HP (lewat mirroring/layar) + mikrofon komentator.

1. **Mikrofon:** panel **Audio Mixer** → klik ikon roda gigi pada Mic/Aux → **Properties** → pilih mikrofon yang benar. Uji suara dengan panel meter (bar hijau bergerak saat bicara).
2. **Audio game:** jika suara Free Fire tidak lewat Window Capture, tambahkan sumber audio: **+** → **Audio Output Capture** (Windows) atau **Audio Input/Application Audio Capture** sesuai setup — pilih perangkat yang memainkan suara game.
3. **Atur volume** di Audio Mixer: game jelas tapi tidak menenggelamkan komentator.
4. **Filter noise (opsional):** klik kanan mikrofon → Filters → **Noise Suppression** + **Noise Gate** untuk meredam noise ruang kelas.
5. **Advanced Audio Properties** (ikon roda gigi di Audio Mixer): pastikan **Monitor** tidak aktif ke speaker laptop yang sama saat pakai headphone — hindari gema.

---

## 6. Pengaturan Video/Encoder

Buka **Settings → Output (Output Mode: Advanced)**:

| Parameter | Rekomendasi |
|---|---|
| Video Bitrate (streaming) | **2500–4000 Kbps** (Mode A YouTube); untuk Mode B MediaMTX LAN, 2500–5000 Kbps cukup karena jaringan lokal |
| Keyframe Interval | 2 s |
| Encoder | **x264** (paling kompatibel) atau **Intel Quick Sync** (hemat CPU pada laptop Intel) — pilih salah satu, jangan keduanya |
| Rate Control | CBR |
| CPU Usage Preset (x264) | `veryfast` (aman untuk laptop standar) |

Buka **Settings → Video**:

| Parameter | Nilai |
|---|---|
| Base (Canvas) Resolution | **1920×1080** |
| Output (Scaled) Resolution | **1920×1080** (turunkan ke 1280×720 hanya jika koneksi/internet lemah) |
| Downscale Filter | Lanczos (jika scaling) |
| FPS | 30 |

Buka **Settings → Stream**:
- **Mode A (YouTube):** Service = YouTube - RTMPS, tempel **Stream Key** dari YouTube Studio (lihat [YOUTUBE_SETUP.md](YOUTUBE_SETUP.md)). **Stream key rahasia — jangan dibagikan.**
- **Mode B (MediaMTX):** Custom RTMP/RTSP sesuai panduan [LOCAL_STREAMING.md](LOCAL_STREAMING.md).

Klik **Apply → OK**.

---

## 7. Hotkey Ganti Scene

Ganti scene jangan dilakukan dengan mouse saat siaran (rawan salah klik). Atur hotkey:

1. **Settings → Hotkeys**.
2. Untuk setiap scene, isi tombol, contoh: `F1` = Starting Soon, `F2` = Main Gameplay, `F3` = Gameplay + Compact Leaderboard, `F4` = Full Leaderboard, `F5` = Top 3 Ranking, `F6` = Match Results, `F7` = Break, `F8` = Winner Announcement, `F9` = Stream Offline.
3. Apply → OK. Panduan pemakaian: [guides/GUIDE_14](guides/GUIDE_14_ganti-scene-obs.md).

---

## 8. Checklist Akhir OBS

- [ ] OBS terpasang, canvas 1920×1080, 30 FPS.
- [ ] 9 scene resmi dibuat dengan nama persis.
- [ ] Overlay Browser Source terpasang, transparan (tanpa latar hitam), dimensi 1920×1080/1600×900/1280×720.
- [ ] obs-websocket aktif dengan password (token) tercatat untuk Broadcast Bridge.
- [ ] Audio: mikrofon + suara game terbaca di Audio Mixer.
- [ ] Encoder x264 atau Quick Sync, bitrate sesuai mode streaming.
- [ ] Hotkey scene sudah diatur.

Lanjut ke [MIRRORING_SETUP.md](MIRRORING_SETUP.md).
