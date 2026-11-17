# PANDUAN LENGKAP: OBS STUDIO × YOUTUBE LIVE — Siaran Lancar, Minim Delay

> Untuk panitia **BATTLE OFF FRIENDS (BOF) — STIKAR ESPORTS** (SMK TI Bali Global Karangasem).
> Tujuan: siaran Free Fire lewat **OBS Studio → YouTube Live** yang **tidak patah-patah**,
> **tidak telat jauh** dari kondisi lapangan, dan otomatis tampil di website BOF (mode `youtube`).
>
> Panduan ini dari **nol sampai siaran lancar**. Ikuti urutannya.

---

## 0. Persiapan (sekali saja)

| Kebutuhan | Minimal | Direkomendasikan |
| --- | --- | --- |
| Laptop streaming | RAM 8 GB, CPU 4 inti | RAM 16 GB + GPU (NVIDIA) |
| Internet **upload** | 6 Mbps stabil | ≥ 10 Mbps (kabel LAN) |
| OBS Studio | versi 28+ | versi 30+ (unduh: obsproject.com) |
| Akun YouTube | sudah verifikasi nomor HP | — |

**Cek kecepatan internet** di fast.com atau speedtest.net. Yang dipakai adalah angka **UPLOAD**.
Rumus aman: `Upload ≥ 1,5 × bitrate OBS` (bitrate dijelaskan di §3). Contoh: bitrate 4500 Kbps → upload minimal ±7 Mbps.
Pakai **kabel LAN** kalau ada — Wi-Fi adalah penyebab no. 1 siaran patah-patah.

---

## 1. Aktifkan Live Streaming di YouTube (sekali saja)

1. Buka [studio.youtube.com](https://studio.youtube.com) → kamera ikon **Create** → **Go live**.
2. Jika diminta, tunggu aktivasi live streaming (24 jam setelah verifikasi HP).
3. Setelah bisa live, catat **Stream key**: YouTube Studio → **Go live** → tab **Stream settings** → **Stream key** → *Copy*.
   - 🔒 Stream key = kunci siaran. **Jangan dibagikan / tidak disimpan di website BOF.**

---

## 2. Atur YouTube Studio agar tidak delay (SEBELUM buka OBS)

Di YouTube Studio → **Go live** → **Stream settings**:

| Pengaturan | Nilai | Kenapa |
| --- | --- | --- |
| **Latency** | `Low` (±5–10 detik) | Seimbang antara cepat & stabil. `Ultra low` sering buffer di penonton Indonesia — hindari kalau penonton banyak & jaringan biasa. `Normal` (±15–30 detik) PALING stabil — pakai ini kalau masih buffer. |
| **Enable DVR** | ✅ ON | Penonton bisa mundur beberapa detik tanpa merusak siaran. |
| **Resolution** | 1080p (atau 720p) | Pilih sesuai bitrate di §3 — jangan lebih tinggi dari kemampuan upload. |
| **Title / Category** | Judul turnamen · *Gaming* | — |
| **Made for kids** | ❌ No | Bisa pakai chat & fitur lengkap. |

> 💡 Penting dipahami: YouTube punya **delay server sendiri** 5–30 detik dan itu TIDAK bisa dihilangkan.
> Yang bisa kita kejar: siaran **tidak buffer/patah** dan delay **tidak makin besar** saat jaringan berat.

---

## 3. Atur OBS Studio (bagian terpenting)

Buka **OBS → Settings**:

### 3a. Output (tab Streaming)
| Setting | Nilai | Catatan |
| --- | --- | --- |
| Output Mode | `Advanced` | Wajib, supaya semua opsi muncul. |
| Encoder | `NVENC H.264` (ada GPU NVIDIA) / `x264` (tanpa GPU) | NVENC = CPU lega. |
| Rate Control | **`CBR`** | Wajib CBR — bitrate konstan = siaran stabil. |
| Bitrate | **4 500–6 000 Kbps** untuk 720p60; **6 000–9 000 Kbps** untuk 1080p60; **3 000–4 000 Kbps** untuk 720p30 | MULAI DARI ANGKA BAWAH. Kalau lancar 30 menit, boleh naik perlahan. |
| Keyframe Interval | **`2 s`** | ⭐ PALING BERPENGARUH ke delay & stabilitas. Jangan 0/1/4. |
| Preset | NVENC: `Quality` · x264: `veryfast` | Naikkan kalau CPU/GPU santai. |
| Profile | `main` / `high` | — |
| Tuning (NVENC) | `Low Latency` | — |

### 3b. Output → Audio
- Audio Bitrate: **160** (atau 192).
- Track 1 aktif (music/DJ track tidak perlu untuk siaran pertandingan — musik latar bisa diatur dari admin panel website, lihat §6).

### 3c. Video
| Setting | Nilai |
| --- | --- |
| Base (Canvas) Resolution | **1920×1080** (atau 1280×720 kalau laptop lemah) |
| Output (Scaled) Resolution | **SAMA dengan yang dipilih di YouTube** — mismatch = scaling = boros & lag |
| Downscale Filter | Lanczos (1080p) / Bicubic (720p) |
| FPS | **60** (match FF jelas lebih halus); 30 kalau laptop kesulitan |

### 3d. Advanced
- Process Priority: `Above Normal`.
- Renderer: Direct3D 11.

---

## 4. Scene dasar siaran turnamen FF

Buat minimal 4 scene di OBS:

1. **`STARTING SOON`** — background + logo BOF + jam. (Sementara itu, countdown besar yang sebenarnya bisa dinyalakan dari website: Admin → Broadcast → *Panggung TV & Countdown*.)
2. **`GAMEPLAY`** — sumber *Game Capture* (pilih Free Fire / emulator LDPlayer-BlueStacks) atau *Display Capture*.
3. **`BRB / TECHNICAL`** — dipakai saat ada gangguan (di website juga ada Emergency screen: Admin → Broadcast Control).
4. **`RESULTS / PANGGUNG JUARA`** — tabel klasemen. (Website punya *Panggung Juara* otomatis: Admin → Broadcast → toggle Panggung Juara → muncul di TV & semua penonton.)

Tips proyektor + TV venue: buka link **TV Display** dari Admin → Broadcast (QR/link `?fs=1`) agar TV venue menampilkan layout broadcast (gameplay 72% + klasemen 28% + ticker) — OBS cukup mengirim satu sumber utama.

---

## 5. Jalankan siaran pertama (checklist)

1. OBS → Settings → Stream → Server: `Primary YouTube ingest server` → tempel **Stream key**.
2. `Start Streaming` (OBS) — tunggu status hijau di pojok bawah.
3. YouTube Studio → pastikan preview muncul → **Go Live**.
4. Website: Admin → Broadcast → Mode Stream = **YouTube Live** → tempel **URL video siaran** (bukan stream key!) → Simpan. Semua penonton & TV otomatis menonton dari website.
5. Pantau 15 menit pertama:
   - OBS pojok bawah: **dropped frames < 1%**. Kalau naik terus → turunkan bitrate 500–1000 Kbps.
   - YouTube Studio → Stream health: harus "Excellent/Good".
6. Setelah selesai: `Stop Streaming` + **End Stream** di YouTube, dan di website matikan siaran.

### Kalau masih delay / patah-patah — urutan memperbaiki:
1. Keyframe interval sudah `2 s`?
2. Turunkan bitrate (langkah 500): 6000 → 5500 → 5000 → 4500 …
3. Turunkan 60fps → 30fps (durasi encode turun drastis).
4. 1080p → 720p (penonton HP mayoritas — 720p justru lebih aman).
5. Ganti Wi-Fi → LAN; matikan download/backup di jaringan yang sama.
6. YouTube latency `Low` → `Normal` (delay bertambah tapi patah-patah hilang).

---

## 6. Pengaya siaran dari website (tanpa OBS!)

Fitur ini semua dikendalikan dari **Admin → Broadcast** dan langsung tampil di TV + penonton:

| Fitur | Kegunaan |
| --- | --- |
| Countdown Besar & Sekuens Mulai Game (delay diatur) | sinkron mulai match — beep 10..1 + GAME START otomatis bersuara |
| Musik Latar (MP3 / YouTube Music, loop, volume) | menemani waktu menunggu |
| Sound Effect (BOOYAH!, airhorn, tepuk tangan, match selesai…) | satu klik terbunyikan di semua perangkat penonton |
| Panggung Juara | podium Top 3 penuh animasi + confetti |
| Indikator Penonton | berapa & siapa yang online realtime |

---

## 7. Pertanyaan cepat

**Q: Kenapa penonton di YouTube telat ±10 detik dari lapangan?**
A: Normal — itu delay YouTube (server). Pakai latency `Low` + keyframe 2 s untuk meminimalkan. Untuk penonton
**di venue** yang butuh hampir realtime, pakai mode **MediaMTX (LAN)** atau **P2P** di website — latensinya < 1 detik.

**Q: Bitrate berapa biar "HD tapi aman"?**
A: 720p60 @ 4 500–5 000 Kbps adalah titik manis untuk turnamen FF dengan internet Indonesia.

**Q: OBS macet saat gameplay?**
A: Kecilkan Canvas ke 1280×720, ganti encoder ke x264 `superfast`, tutup aplikasi lain (browser/tab banyak).

— SAPUTRA DEVELOPER · documentation/OBS_YOUTUBE_GUIDE.md
