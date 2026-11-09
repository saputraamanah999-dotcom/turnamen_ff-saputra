# GUIDE 15 — Cara Melihat Pertandingan melalui HP

## Tujuan
Membantu penonton/siswa menonton pertandingan dan memantau skor dari HP: via **website BOF** (live, leaderboard, hasil), **YouTube Live (Mode A)**, atau **streaming lokal sekolah (Mode B)**.

## Prasyarat
- HP dengan browser (Chrome) dan koneksi Wi-Fi sekolah / internet.
- Tautan website BOF dan/atau alamat stream lokal diketahui.

## Cara 1 — Lewat Website BOF (Realtime)
1. Buka browser HP → alamat website sekolah (Firebase Hosting).
2. Halaman utama `/` → menu tersedia:
   - **`/live`** untuk daftar tayangan live; **`/live/:tournamentId`** untuk turnamen yang ditonton.
   - **`/leaderboard`** dan **`/leaderboard/:tournamentId`** untuk poin realtime — data ter-update **tanpa refresh** (Firestore realtime).
   - **`/matches`** dan **`/matches/:matchId`** untuk jadwal/detail match; **`/results`** untuk hasil; **`/statistics`** untuk statistik; **`/teams`** untuk profil tim.
3. Cara pintas: bagikan link `/leaderboard/:tournamentId` di grup kelas agar siswa tinggal klik.
4. Jika panitia telah mengisi **`youtubeVideoId`** di Broadcast Settings, halaman `/live/:tournamentId` **menampilkan video YouTube langsung** di dalam website.

## Cara 2 — YouTube Live (Mode A, bisa dari mana saja)
1. Buka aplikasi YouTube di HP → cari channel sekolah atau klik tautan siaran.
2. Pilih siaran **Public** (umum) atau buka link **Unlisted** yang dibagikan panitia.
3. Kualitas video: pilih 720p bila koneksi HP bagus.

## Cara 3 — Streaming Lokal Sekolah (Mode B, hanya di Wi-Fi sekolah)
1. Hubungkan HP ke **Wi-Fi sekolah yang sama** dengan laptop produksi (bukan hotspot pribadi).
2. Buka browser → masukkan alamat yang diumumkan panitia:
   - HLS: `http://IP-LAPTOP:8888/stream`
   - WebRTC (delay terkecil): `http://IP-LAPTOP:8889/stream`
3. Alternatif **VLC**: Media → Open Network Stream → tempel `http://IP-LAPTOP:8888/stream` → Play.
4. Jika halaman tidak terbuka: pastikan satu Wi-Fi dengan laptop, coba ulang; masalah teknis dilaporkan ke panitia ([TROUBLESHOOTING.md](../TROUBLESHOOTING.md)).
5. **Catatan cakupan**: Mode B hanya menjangkau jaringan sekolah — **tidak bisa ditonton dari rumah/internet**. Untuk penonton luar, gunakan Mode A.

📸 [Tempel screenshot: tampilan /leaderboard/:tournamentId dan pemutar stream lokal di HP]

## Tips
- Agar hemat kuota, penonton di gedung gunakan **Mode B**; penonton di rumah gunakan **Mode A/website**.
- Matikan mode hemat data Chrome agar video tidak otomatis menurun kualitas.
- Rotasi HP landscape untuk menonton nyaman.
- Beritahu penonton: skor **paling valid** ada di `/leaderboard/:tournamentId` karena berasal dari input resmi panitia.

## Kesalahan Umum
- Penonton memakai **hotspot sendiri** untuk Mode B → tidak bisa akses (beda jaringan).
- Mengetik alamat MediaMTX dengan `https` → harus `http://IP-LAPTOP:8888/stream`.
- Mencari alamat IP yang benar tapi salah subnet (Wi-Fi beda) — konfirmasi ke panitia.
- Menganggap leaderboard "berat" karena terus refresh — tidak perlu refresh manual; datanya realtime.
- Memakai link turnamen lama (`tournamentId` salah) → halaman tampil tapi data kosong.
