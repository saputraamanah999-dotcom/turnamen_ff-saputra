# GUIDE 10 — Cara Mengatur Streaming Publik

## Tujuan
Menyiarkan pertandingan ke internet umum melalui **YouTube Live (Mode A)** dan menampilkan tayangan di website melalui **Broadcast Settings** (kolom `youtubeVideoId`).

## Prasyarat
- Channel YouTube sekolah aktif, fitur Live sudah terverifikasi (**proses 24 jam — lakukan H-2**) ([YOUTUBE_SETUP.md](../YOUTUBE_SETUP.md)).
- OBS siap dengan scene + overlay ([GUIDE_09](GUIDE_09_pasang-overlay-di-obs.md)).
- Stream key YouTube **rahasia**.

## Langkah-langkah
1. Login YouTube Studio dengan akun sekolah → **Go live → Stream**.
2. Salin **Stream key**. **Jangan bagikan ke siapa pun** — key ini akses menyiarkan di channel sekolah.
3. Buka OBS → **Settings → Stream** → Service: **YouTube - RTMPS** → tempel stream key → OK.
4. Isi metadata siaran di Studio: judul (`ZEROID ESPORTS — BOF ...`), deskripsi (jadwal + daftar tim + aturan poin BOF), dan visibility:
   - **Unlisted** → hanya yang punya link (cocok untuk uji/latihan).
   - **Public** → publik penuh, siap di-embed di website (hari-H).
5. Sebelum event, jalankan **siaran uji unlisted**: Start Streaming dari OBS → cek video + audio + overlay → Stop.
6. Hari-H: aktifkan scene **Starting Soon** → **Start Streaming** di OBS → di Studio klik **Go Live** (bila terjadwal).
7. Cek tab **Stream health** di Studio: pastikan tidak ada dropped frames besar; bitrate sesuai [OBS_SETUP.md](../OBS_SETUP.md).
8. Ambil **video ID** dari URL tayangan (bagian setelah `v=`).
9. Login `/admin` → buka turnamen → **Broadcast Settings** → isi kolom **`youtubeVideoId`** → simpan. Halaman `/live/:tournamentId` kini menampilkan tayangan langsung.
10. Selama siaran: operator ganti scene via hotkey; penjaga skor input hasil ([GUIDE_04](GUIDE_04_memasukkan-hasil-pertandingan.md)).
11. Selesai: scene **Stream Offline** → **Stop Streaming** → di Studio **End Stream**.

📸 [Tempel screenshot: halaman Stream di YouTube Studio yang menampilkan stream key (tutup sebagian saat dokumentasikan!)]

## Tips
- Reset stream key jika terlanjur terlihat orang lain (Studio → **Reset key**, lalu perbarui di OBS).
- Selalu mulai siaran uji 30 menit sebelum jadwal resmi.
- Siapkan jadwal siaran (schedule) agar penonton bisa pasang reminder.

## Kesalahan Umum
- Bagikan stream key di grup chat — **dilarang keras**; siapa pun yang punya key bisa menyiarkan di channel sekolah.
- Mengaktifkan Live di hari-H padahal verifikasi belum selesai (butuh sampai 24 jam) → siaran gagal.
- Visibility tetap Unlisted saat hari-H → video tidak bisa ditemukan/ter-embed untuk publik.
- `youtubeVideoId` di Broadcast Settings salah menyalin (ikut menyertakan URL penuh) → video tidak muncul di `/live/:tournamentId`.
- Embed disabled di YouTube sehingga website tidak menampilkan video — aktifkan izin embed ([TROUBLESHOOTING.md](../TROUBLESHOOTING.md)).
- Lupa End Stream di Studio sehingga rekaman panjang kosong tersimpan.
