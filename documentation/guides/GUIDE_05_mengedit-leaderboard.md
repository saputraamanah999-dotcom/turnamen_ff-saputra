# GUIDE 05 — Cara Mengedit Leaderboard

## Tujuan
Mengoreksi data hasil yang salah (placement/kill) sehingga leaderboard kembali akurat — tanpa merusak kepercayaan penonton dan peserta.

## Prasyarat
- Akses login `/admin`.
- **Bukti tertulis**: screenshot layar hasil, rekaman siaran, atau lembar penilaian panitia yang menunjukkan data yang benar.
- Persetujuan panitia (idealnya ketua panitia) untuk setiap koreksi.

## Langkah-langkah
1. Identifikasi **match dan game** yang salah: buka `/matches` → detail `/matches/:matchId` → bandingkan dengan bukti.
2. Catat dulu nilai **lama** dan nilai **benar** untuk setiap tim yang terdampak (bukti perubahan).
3. Login di **`/admin`**, buka match terkait.
4. Ubah hanya bagian yang salah:
   - Placement salah → perbaiki urutan peringkat.
   - Kill salah → perbaiki jumlah kill.
5. Biarkan sistem menghitung ulang poin: `placement + kill × 2`. Cocokkan lagi dengan tabel poin [GUIDE_03](GUIDE_03_sistem-poin-bof.md).
6. Simpan perubahan.
7. Jika match tersebut **sudah dipublikasikan**, pastikan statusnya tetap terpublikasi; leaderboard akan menghitung ulang karena **poin turnamen = jumlah poin dari match yang sudah dipublikasikan**.
8. Verifikasi di `/leaderboard/:tournamentId` dan `/results` — nilai baru harus muncul secara realtime untuk semua penonton.
9. **Umumkan koreksi** ke peserta/penonton (grup panitia, pengumuman di siaran) agar tidak ada kecurigaan: sebutkan match, data lama, data benar, dan alasannya.
10. Arsipkan bukti perubahan (screenshot sebelum/sesudah) di catatan panitia.

📸 [Tempel screenshot: halaman edit hasil match di /admin sebelum dan sesudah nilai dikoreksi]

## Tips
- Koreksi **secepat mungkin** sebelum match berikutnya dimulai — makin lambat, makin banyak penonton yang menyimpan tangkapan layar "versi lama".
- Tetapkan satu orang berwenang untuk edit; operator lain mengajukan permohonan dengan bukti.
- Untuk tiebreaker, koreksi poin bisa mengubah urutan — jalankan aturan tiebreaker resmi: total poin → placement points → placement game terakhir sesuai format → review manual panitia.

## Kesalahan Umum
- Mengedit **tanpa bukti** karena tekanan peserta — dilarang; semua koreksi harus berasal dari rekaman/screenshot.
- Mengedit saat gameplay berjalan dan lupa mengumumkan — penonton bingung leaderboard berubah tiba-tiba.
- Mengubah data game yang benar sambil mengoreksi game yang salah — edit **hanya** yang terbukti salah.
- Mengira leaderboard bisa "diketik manual" — leaderboard dibangun otomatis dari data match yang dipublikasikan; tidak ada input poin langsung.
- Tidak mencadangkan nilai lama — selalu screenshot sebelum mengedit.
