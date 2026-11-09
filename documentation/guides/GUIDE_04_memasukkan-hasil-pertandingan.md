# GUIDE 04 — Cara Memasukkan Hasil Pertandingan

## Tujuan
Memasukkan hasil satu match (placement + kill setiap tim) ke website dan mempublikasikannya, sehingga leaderboard realtime ter-update untuk semua penonton.

## Prasyarat
- Match telah dimainkan dan hasil sudah diverifikasi dua panitia.
- Sistem poin BOF dipahami ([GUIDE_03](GUIDE_03_sistem-poin-bof.md)).
- Login `/admin` berfungsi.

## Langkah-langkah
1. Login di **`/admin`**.
2. Buka pengelolaan **match** untuk turnamen yang berjalan. Halaman publik match tersedia di `/matches` dan detailnya di `/matches/:matchId` — gunakan sebagai pembanding setelah input.
3. Pilih match/game yang akan diinput (Game 1, Game 2, dst. sesuai format BO3/BO5/BO7/Custom).
4. Untuk **setiap tim**, isi:
   - **Placement** (1st–12th) sesuai urutan finish di game.
   - **Jumlah kill** (angka keseluruhan tim).
5. Periksa total poin otomatis: `placement + kill × 2`. Cocokkan dengan lembar penilaian kertas.
   - Contoh: TEAM ALPHA 1st/8 kill = **36**; TEAM BRAVO 2nd/5 kill = **27**.
6. Pastikan seluruh 12 tim terisi — tidak boleh ada tim tanpa placement.
7. Simpan data hasil.
8. **Publikasikan hasil match.** Ingat aturan resmi: **poin turnamen hanya dihitung dari match yang sudah dipublikasikan**. Selama belum dipublikasikan, leaderboard tidak berubah.
9. Verifikasi di publik: buka `/results`, `/matches/:matchId`, dan `/leaderboard/:tournamentId`. Nilai harus sama dengan lembar panitia.
10. Ulangi untuk setiap game sampai turnamen selesai.

📸 [Tempel screenshot: form input hasil match di /admin berisi kolom placement dan kill untuk 12 tim]

## Tips
- **Input saat jeda antar game** (scene Break di OBS) agar fokus, bukan saat gameplay berjalan.
- Simpan **screenshot hasil di layar HP/game** sebagai bukti sebelum menutup hasil di Free Fire.
- Jika memakai AI Observer, hasil indikasi AI hanya membantu — skor resmi tetap dikonfirmasi manual operator ([GUIDE_13](GUIDE_13_baca-hasil-analisis-ai.md)).
- Publikasi serentak di akhir jeda membuat penonton melihat leaderboard baru tepat saat game berikutnya dimulai.

## Kesalahan Umum
- **Lupa publikasikan** — paling sering! Leaderboard terlihat "tidak berubah" padahal data sudah diinput. Cek status publikasi.
- Salah ketik angka kill (mis. 5 tertulis 15) — selalu cocokkan dua kali dengan lembar panitia.
- Mengisi placement dari ingatan — gunakan hasil yang tampil di layar/rekaman, bukan ingatan.
- Menginput game berikutnya sebelum game sekarang diverifikasi — urutkan satu per satu.
- Mengubah hasil game yang sudah dipublikasikan tanpa pengumuman resmi panitia (lihat [GUIDE_05](GUIDE_05_mengedit-leaderboard.md) untuk koreksi).
