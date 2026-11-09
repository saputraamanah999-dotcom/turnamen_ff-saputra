# GUIDE 02 — Cara Menambahkan Peserta dan Tim

## Tujuan
Mendaftarkan seluruh tim peserta ke dalam turnamen agar tampil di halaman `/teams` dan bisa diinput hasilnya di match.

## Prasyarat
- Turnamen sudah dibuat (lihat [GUIDE_01](GUIDE_01_membuat-turnamen.md)).
- Akses login `/admin`.
- Daftar tim final dari panitia: nama tim, nama anggota, dan kelas/jurusan asal. Minta ketua kelas mengumpulkan data lewat formulir terlebih dahulu agar tidak borong-berubah.

## Langkah-langkah
1. Login di **`/admin`**.
2. Masuk ke pengelolaan turnamen yang dituju, lalu pilih bagian **daftar tim/peserta**.
3. Pilih aksi **menambahkan tim**.
4. Isi **nama tim** persis seperti yang disepakati panitia, misalnya `TEAM ALPHA`, `TEAM BRAVO`. Konsisten: jika memakai huruf kapital, pakai untuk semua tim.
5. Isi **anggota tim** (4 pemain inti + cadangan bila ada) dan kelas asal. Periksa ejaan nama — ini tampil publik di `/teams/:teamId`.
6. Simpan. Ulangi langkah 3–6 untuk setiap tim sampai penuh.
7. Perhatikan **kapasitas default 12 tim**. Jika pendaftar melebihi, adakan seleksi/qualifier — jangan melampaui kapasitas yang diputuskan.
8. Setelah selesai, cek halaman publik **`/teams`**: semua tim harus tampil. Buka salah satu **`/teams/:teamId`** untuk memastikan anggota dan detail benar.
9. Terakhir, cek di leaderboard `/leaderboard/:tournamentId`: semua tim muncul dengan poin 0 (masih belum ada match).

📸 [Tempel screenshot: form tambah tim di /admin dan halaman /teams yang sudah berisi daftar tim]

## Tips
- Kunci nama tim **sebelum hari-H**; mengganti nama di tengah turnamen membingungkan penonton dan leaderboard.
- Tulis nomor WhatsApp ketua tim di lembar panitia (bukan di website) untuk keperluan koordinasi cepat.
- Jika ada tim mundur sebelum mulai, hapus/ubah datanya di `/admin` **sebelum** match pertama dipublikasikan, agar leaderboard tidak kacau.

## Kesalahan Umum
- Nama tim ganda (misalnya `TEAM ALPHA` dan `Team Alpha`) — gunakan satu penulisan yang sama.
- Salah ketik nama pemain: susah dikoreksi saat turnamen berjalan; selalu periksa ulang sebelum simpan.
- Menambah 13+ tim padahal kapasitas 12 — akibatnya jadwal match tidak cocok dengan format 12 slot.
- Mengisi anggota setelah match dimulai — lengkapi data tim **sebelum** game pertama.
- Menghapus tim yang sudah punya skor — jangan lakukan; ganti penanganannya lewat review panitia.
