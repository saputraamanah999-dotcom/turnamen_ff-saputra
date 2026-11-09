# YOUTUBE_SETUP.md — Streaming Publik YouTube Live (Mode A)

Mode A menayangkan pertandingan ke **internet umum** melalui YouTube Live. Penonton dari mana saja bisa menonton lewat tautan YouTube, dan tayangan bisa ditanam (embed) di halaman `/live/:tournamentId` website BOF.

---

## 1. Buat Channel YouTube

1. Buka `https://www.youtube.com` dan login dengan **akun Google resmi sekolah** (bukan akun pribadi).
2. Klik foto profil → **Create a channel** → isi nama channel, misalnya **SMK TI Bali Global Karangasem Official**.
3. Unggah foto profil dan banner sederhana (logo sekolah).
4. Isi deskripsi channel: nama sekolah, info turnamen BOF, kontak panitia.

> Tips: pakai satu channel khusus untuk kegiatan sekolah agar riwayat tayangan turnamen rapi dan bisa dikelola banyak panitia (minta admin channel menambahkan manager di YouTube Studio → Settings → Permissions).

[Screenshot tempel di sini: halaman YouTube Studio channel sekolah]

---

## 2. Aktifkan Fitur Live (Verifikasi 24 Jam)

YouTube mewajibkan akun **terverifikasi** dan "siap live" sebelum bisa menyiarkan.

1. Buka `https://www.youtube.com/verify` → verifikasi akun dengan nomor HP (kode SMS).
2. Buka **YouTube Studio** (`studio.youtube.com`) → **Create → Go live**.
3. YouTube akan menampilkan status aktivasi. Aktivasi akun untuk live bisa **memerlukan waktu hingga 24 jam** — **lakukan langkah ini minimal 1–2 hari sebelum pertandingan**, jangan di hari-H.
4. Setelah disetujui, halaman Go live akan menampilkan dashboard streaming.

**Jangan tunggu hari-H untuk menguji:** buat tayangan uji singkat (unlisted) untuk memastikan semuanya jalan.

---

## 3. Ambil Stream Key (RAHASIA)

1. YouTube Studio → **Go live → Stream (Stream key)**.
2. Salin **Stream key (kunci siaran)** — deretan huruf/angka panjang.
3. Di OBS: **Settings → Stream** → Service: **YouTube - RTMPS** → tempel stream key → Apply → OK.

> **ATURAN KEAMANAN:** JANGAN bagikan stream key ke siapa pun — termasuk panitia lain, siswa, atau guru yang tidak bertugas. Siapa pun yang punya stream key bisa menyiarkan di channel sekolah. Jika key terlanjur bocor, klik **Reset key** di Studio dan perbarui key di OBS.

4. Opsional (lebih aman): gunakan tombol **Select streaming service** di OBS untuk login Google — key tidak perlu di-copy manual.

---

## 4. Konfigurasi Siaran di YouTube Studio

Sebelum mulai, isi metadata siaran:

| Pengaturan | Saran |
|---|---|
| Title | "ZEROID ESPORTS — BOF [Nama Turnamen] — SMK TI Bali Global Karangasem" |
| Description | Jadwal, daftar tim, aturan poin BOF |
| Visibility | **Unlisted** untuk uji coba (hanya yang punya link), **Public** untuk hari-H |
| Schedule | Atur tanggal/jam mulai agar penonton bisa "set reminder" |
| Category | Gaming / Sports |

**Mode unlisted vs public:**
- **Unlisted:** tautan tayangan hanya disebar ke grup tertentu (papan pengumuman, grup kelas). Cocok untuk seleksi/latihan.
- **Public:** tayangan bisa ditemukan di YouTube dan **di-embed di website BOF**. Cocok untuk babak final/putaran utama.

---

## 5. Mulai Siaran (Rutinitas Hari-H)

1. Jalankan urutan produksi: MediaMTX **tidak diperlukan** untuk Mode A — langsung: scrcpy → OBS.
2. Pastikan scene **Starting Soon** aktif, audio bagus, overlay terbaca.
3. OBS → **Start Streaming**.
4. Cek di Studio (tab Stream health): status harus **"Excellent"** atau bagus, tidak ada "dropped frames" tinggi.
5. Di Studio klik **Go Live** jika memakai mode terjadwal.
6. Selama siaran: pantau chat YouTube dan health; ganti scene memakai hotkey (lihat [guides/GUIDE_14](guides/GUIDE_14_ganti-scene-obs.md)).
7. Selesai: scene **Stream Offline** → OBS **Stop Streaming** → di Studio klik **End Stream**. Rekaman otomatis tersimpan (aktifkan "Enable Auto-start/Auto-stop DVR" sesuai kebutuhan).

---

## 6. Embed ke Website BOF (youtubeVideoId)

Tayangan YouTube bisa ditampilkan langsung di halaman live website.

1. Setelah siaran berjalan, ambil **video ID**: bagian belakang URL tayangan, contoh `https://www.youtube.com/watch?v=abc123XYz` → video ID-nya `abc123XYz`. Untuk siaran berjalan, gunakan ID dari URL "Watch on YouTube" di Studio.
2. Buka website → login di `/admin`.
3. Buka pengaturan turnamen → **Broadcast Settings** → isi kolom **youtubeVideoId** dengan video ID tersebut.
4. Simpan. Halaman `/live/:tournamentId` kini menampilkan tayangan YouTube di dalam website — penonton tidak perlu keluar dari website.
5. Jika video tidak muncul di website: periksa **embed disabled** pada siaran (Studio → siaran → Visibility/embedding harus mengizinkan embed) dan pastikan siaran tidak offline — detail di [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

📸 [Tempel screenshot: kolom youtubeVideoId pada Broadcast Settings di /admin]

---

## 7. Checklist Akhir Mode A

- [ ] Channel YouTube resmi sekolah dibuat.
- [ ] Akun terverifikasi; fitur Live **sudah aktif** (dicek >24 jam sebelum event).
- [ ] Stream key dipasang di OBS, **disimpan rahasia**.
- [ ] Tes siaran unlisted berhasil (video + audio + overlay terlihat).
- [ ] Broadcast Settings di `/admin` berisi `youtubeVideoId` saat siaran public berjalan.
- [ ] Rencana hari-H: siapa operator OBS, siapa penjaga chat, siapa konfirmasi skor.

Panduan operator harian: [guides/GUIDE_10](guides/GUIDE_10_streaming-publik.md).
