# GUIDE 01 — Cara Membuat Turnamen

## Tujuan
Membuat turnamen baru di Admin Panel (route `/admin`) sehingga website langsung punya halaman leaderboard, daftar match, dan halaman live untuk turnamen tersebut.

## Prasyarat
- Anda punya akun panitia (email/password Firebase Auth) dan bisa login di `/admin`.
- Setup Firebase sudah selesai (lihat [FIREBASE_SETUP.md](../FIREBASE_SETUP.md)).
- Nama turnamen, tanggal pelaksanaan, dan format pertandingan sudah diputuskan panitia.

## Langkah-langkah
1. Buka website sekolah di browser, masuk ke route **`/admin`**.
2. Login dengan email dan password akun panitia (Firebase Auth email/password).
3. Cari bagian kelola turnamen, lalu pilih aksi **membuat turnamen baru**.
4. Isi **nama turnamen** dengan benar, misalnya: `STIKAR ESPORTS — BOF SEMESTER GANJIL 2025`. Hindari nama yang membingungkan karena nama ini tampil di publik.
5. Isi **tanggal/jadwal** pelaksanaan sesuai rencana panitia.
6. Pilih **format pertandingan**:
   - **Best of 3 (BO3)** — pemenang ditentukan dari 3 game terbaik.
   - **Best of 5 (BO5)** — untuk babak lanjutan/penentuan.
   - **Best of 7 (BO7)** — biasanya final.
   - **Custom** — jumlah game ditentukan sendiri oleh panitia.
7. Periksa **kapasitas tim**: nilai default sistem adalah **12 tim**. Jangan diubah kecuali panitia benar-benar memutuskan lain.
8. Pastikan **sistem poin BOF** digunakan (poin resmi: placement 1=20 sampai 12=0, kill = 2 poin per kill — lihat [GUIDE_03](GUIDE_03_sistem-poin-bof.md)).
9. Simpan/terbitkan turnamen.
10. Catat **`tournamentId`** turnamen (terlihat di URL, misalnya `/leaderboard/TOURNAMENT_ID`). ID ini nanti dipakai untuk URL overlay OBS, halaman live `/live/:tournamentId`, dan leaderboard `/leaderboard/:tournamentId`.
11. Uji: buka `/leaderboard/:tournamentId` dan `/live/:tournamentId` — halaman harus tampil (masih kosong karena belum ada tim/match).

📸 [Tempel screenshot: form pembuatan turnamen di /admin beserta halaman leaderboard turnamen yang baru dibuat]

## Tips
- Buat turnamen **minimal 3 hari sebelum event** agar tim sempat diumumkan dan overlay OBS bisa diuji dengan `tournamentId` yang benar.
- Salin `tournamentId` ke catatan panitia (lembar operasional hari-H) supaya semua operator memakai ID yang sama.
- Jika format final BO7, pertimbangkan membuat turnamen terpisah untuk babak penyisihan dan final agar leaderboard rapi.

## Kesalahan Umum
- Lupa mencatat `tournamentId`, lalu operator OBS memasang overlay dengan ID yang salah sehingga leaderboard di overlay kosong.
- Mengubah-ubah format setelah turnamen berjalan — putuskan format **sebelum** menambah peserta.
- Menganggap poin otomatis muncul: poin baru terhitung setelah hasil match **dipublikasikan** (lihat [GUIDE_04](GUIDE_04_memasukkan-hasil-pertandingan.md)).
- Membagikan akun `/admin` ke banyak orang — batasi hanya operator resmi.
