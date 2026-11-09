# TROUBLESHOOTING.md — Masalah Umum dan Solusi

Dokumen ini berisi tabel masalah yang paling sering muncul saat operasional STIKAR ESPORTS — BOF, beserta penyebab dan solusinya. Untuk panduan langkah demi langkah, lihat dokumen setup masing-masing dan folder [guides/](guides/README.md).

---

## 1. Leaderboard Tidak Update

| Masalah | Kemungkinan Penyebab | Solusi |
|---|---|---|
| Leaderboard di `/leaderboard/:tournamentId` tidak berubah setelah skor diinput | **Firestore Rules belum dideploy** sehingga baca/tulis ditolak | Jalankan ulang di folder proyek: `firebase deploy --only firestore:rules,firestore:indexes`. Lihat [FIREBASE_SETUP.md](FIREBASE_SETUP.md) |
| Leaderboard tidak update pada HP/laptop tertentu | **Internet perangkat tersebut putih/lambat** | Cek koneksi Wi-Fi/LAN perangkat; buka situs lain untuk memastikan internet jalan; pindah ke jaringan sekolah yang stabil |
| Ada error di halaman leaderboard, data tidak muncul sama sekali | **Kesalahan pada console browser** (script error, gagal fetch) | Buka Developer Tools (F12) → tab **Console** → cari teks merah (error). Catat pesannya. Biasanya berisi nama masalah (permission denied / network error). Cek juga tab **Network**: request ke Firestore gagal berarti koneksi/rules bermasalah |
| Data diubah di `/admin` tapi tidak tampak di halaman publik | Match/hasil **belum dipublikasikan** (poin turnamen hanya dihitung dari match yang sudah dipublikasikan) | Publikasikan hasil match di `/admin` (lihat [guides/GUIDE_04](guides/GUIDE_04_memasukkan-hasil-pertandingan.md)), lalu cek lagi leaderboard |
| Semua halaman gagal memuat data | Project Firebase salah / environment tidak cocok | Pastikan config Firebase pada website mengarah ke project yang benar (project ID yang sudah di-setup) |

**Urutan cek cepat leaderboard:** (1) cek internet, (2) cek rules Firestore sudah dideploy, (3) cek console browser (F12), (4) cek apakah match sudah dipublikasikan.

---

## 2. Video Tidak Muncul di Website

| Masalah | Kemungkinan Penyebab | Solusi |
|---|---|---|
| Halaman `/live/:tournamentId` tidak menampilkan tayangan | **Embed disabled** pada siaran YouTube | YouTube Studio → buka siaran → pastikan pengaturan embedding **diizinkan**. Ubah dari "embedding disabled" ke izinkan, lalu muat ulang halaman website |
| Kotak video hitam / pesan "video unavailable" | **Stream offline** — siaran belum mulai atau sudah berakhir | Cek di OBS apakah **Start Streaming** sudah jalan dan di YouTube Studio status siaran **LIVE**. Jika siaran selesai, isi video ID rekaman di Broadcast Settings |
| Video tampil di YouTube tapi tidak di website | **youtubeVideoId salah/berubah** | Salin ulang video ID dari URL YouTube (bagian setelah `v=`) dan perbarui kolom **youtubeVideoId** di **Broadcast Settings** pada `/admin` |
| Video hanya untuk penonton tertentu | Visibility **Unlisted** | Unlisted tetap bisa di-embed lewat link, tapi hanya yang punya link. Untuk publik, ubah ke **Public** ([YOUTUBE_SETUP.md](YOUTUBE_SETUP.md)) |

---

## 3. Overlay Transparan Tapi Berlatar Hitam di OBS

| Masalah | Kemungkinan Penyebab | Solusi |
|---|---|---|
| Overlay tampak kotak hitam, gameplay di belakangnya tertutup | URL overlay dibuka **tanpa parameter transparan** / diambil sebagai gambar, bukan Browser Source | 1) Pastikan sumbernya tipe **Browser** di OBS. 2) Tambahkan `?transparent=1` pada URL, contoh: `/overlay/TOURNAMENT_ID/compact?transparent=1`. 3) Pastikan overlay diakses di dimensi yang didukung (1920×1080 / 1600×900 / 1280×720) |
| Overlay menampilkan navbar/footer website di dalam OBS | Overlay salah URL (membuka halaman biasa, bukan route overlay) | Gunakan URL route overlay yang benar: `/overlay/:tournamentId/full`, `/compact`, `/top3`, `/match-info`, atau `/lower-third`. Overlay memang dirancang tanpa navbar/footer |
| Overlay memuat data turnamen salah | `TOURNAMENT_ID` salah/ketukar | Salin `tournamentId` dari URL halaman leaderboard turnamen (lihat `/leaderboard/TOURNAMENT_ID`) dan tempel pada URL overlay |

---

## 4. scrcpy Gagal / HP Tidak Terdeteksi

| Masalah | Kemungkinan Penyebab | Solusi |
|---|---|---|
| `adb devices` daftar kosong | **Driver adb tidak terpasang** / kabel charger-only | Install driver adb (paket scrcpy biasanya sudah menyertakan; bila perlu install "Google USB Driver"/driver pabrikan). Ganti **kabel USB berkualitas data** (bukan kabel charger murah), coba port USB lain |
| Status `unauthorized` | **Popup izin USB debugging belum disetujui** | Buka layar HP → centang "Always allow from this computer" → tekan **Allow**. Jalankan `adb devices` lagi |
| Status `offline` | USB debugging terputus / HP tidur | Aktifkan layar HP, cabut-pasang kabel, pastikan USB debugging tetap ON di Developer options |
| scrcpy jalan tapi layar macet/lag | Latency tinggi (TCP/IP) atau laptop berat | Pakai **kabel USB**, jalankan `scrcpy --max-size 1080 --video-bit-rate 4M --max-fps 30`. Untuk TCP/IP: dekatkan HP ke router ([MIRRORING_SETUP.md](MIRRORING_SETUP.md)) |
| Mode TCP/IP gagal connect | `adb connect` salah IP / port 5555 tertutup | Cek IP HP di Settings → Wi-Fi → detail. Ulangi `adb tcpip 5555` (dengan kabel dulu), lalu `adb connect IP:5555` |

---

## 5. OCR AI Observer Gagal Membaca HUD

| Masalah | Kemungkinan Penyebab | Solusi |
|---|---|---|
| AI tidak mendeteksi angka HUD / hasil kosong | **Region HUD salah posisi/ukuran** | **Kalibrasi ulang region** HUD & minimap agar kotak pas di sekitar angka ([AI_OBSERVER_SETUP.md](AI_OBSERVER_SETUP.md) bagian 4) |
| Hasil baca sering salah/kacau | **Resolusi/scaling berubah** setelah kalibrasi | Jika resolusi scrcpy/layar diubah, **kalibrasi ulang** pada resolusi baru. Jaga resolusi output konsisten (1920×1080) |
| AI melihat layar hitam/frame kosong | Jendela gameplay **di-minimize / tertutup** | Pastikan jendela scrcpy/gameplay terlihat di layar laptop, tidak ditutup jendela lain. AI membaca frame lokal dari layar |
| Indikasi event terlambat | FPS analisis terlalu rendah / laptop penuh | Naikkan FPS ke 2–5, tutup program lain di laptop, pantau CPU |

Detail lanjutan: [guides/GUIDE_17](guides/GUIDE_17_atasi-ai-gagal-baca-hud.md).

---

## 6. Broadcast Bridge Tidak Connect

| Masalah | Kemungkinan Penyebab | Solusi |
|---|---|---|
| Bridge tidak terhubung ke OBS | **obs-websocket belum di-enable** | OBS → Tools → WebSocket Server Settings → centang **Enable WebSocket server** → Apply ([OBS_SETUP.md](OBS_SETUP.md)) |
| Bridge ditolak/gagal autentikasi | **Token/password salah** | Pastikan password (token) pada konfigurasi Broadcast Bridge **sama persis** dengan Server Password di obs-websocket. Jika password direset di OBS, perbarui juga di konfigurasi bridge |
| Bridge tidak terhubung ke website | Port 8078 diblokir / bridge belum dijalankan | Pastikan layanan Broadcast Bridge berjalan di **port 8078**; jika berjalan di laptop berbeda, izinkan port 8077/8078 di firewall untuk jaringan lokal saja |
| Koneksi sering putus-sambung | OBS di-restart saat bridge jalan | Restart bridge setelah OBS direstart; cek log bridge untuk status |

---

## 7. MediaMTX Tidak Bisa Diakses dari HP

| Masalah | Kemungkinan Penyebab | Solusi |
|---|---|---|
| HP gagal membuka `http://IP-LAPTOP:8888/stream` | **Firewall laptop memblokir** port 8888/8889/8554 | Windows: Firewall → Allow an app → centang `mediamtx.exe` untuk jaringan Private. Linux: buka port via ufw/firewalld. **Lakukan dengan izin admin jaringan sekolah** |
| HP dan laptop tidak bisa saling melihat | **Beda subnet / HP pakai hotspot sendiri** | Pastikan HP dan laptop **satu Wi-Fi/LAN sekolah** (contoh subnet sama: keduanya 192.168.1.x). Jangan pakai hotspot pribadi untuk penonton |
| Halaman terbuka tapi video tidak jalan | OBS belum **Start Streaming** ke RTSP MediaMTX | Jalankan urutan: MediaMTX berjalan → OBS Stream custom `rtsp://127.0.0.1:8554` key `stream` → Start Streaming → coba ulang di HP |
| Alamat IP laptop berubah sehingga tautan mati | DHCP selalu berganti | Minta admin jaringan memberi **IP statis/DHCP reservation** untuk laptop server |
| Muncul pertanyaan "apakah bisa dilihat dari luar sekolah?" | Salah paham cakupan | **Tidak.** MediaMTX Mode B hanya untuk LAN sekolah. Untuk penonton luar gunakan Mode A YouTube ([LOCAL_STREAMING.md](LOCAL_STREAMING.md)) |

---

## 8. Masalah Lain yang Sering Muncul

| Masalah | Kemungkinan Penyebab | Solusi |
|---|---|---|
| Tidak bisa login di `/admin` | Email/password salah, atau user belum dibuat | Cek user di Firebase Console → Authentication → Users. Reset password bila perlu ([FIREBASE_SETUP.md](FIREBASE_SETUP.md)) |
| Halaman website error setelah deploy | Build lama/rules belum sinkron | Jalankan `npm run build` lalu `firebase deploy`, tunggu 1–2 menit, hard refresh (Ctrl+Shift+R) |
| Suara game tidak terdengar di OBS | Sumber audio salah | Tambahkan Audio Output Capture / cek Audio Mixer ([OBS_SETUP.md](OBS_SETUP.md)) |
| Stream YouTube "dropped frames" tinggi | Internet upload lemah | Turunkan bitrate (2500 Kbps) atau resolusi 1280×720 ([OBS_SETUP.md](OBS_SETUP.md)) |

---

## Prinsip Umum Saat Ada Masalah

1. **Jangan panik di tengah siaran** — pindahkan scene ke **Break** atau **Starting Soon** dulu, perbaiki di belakang.
2. **Catat pesan error** (screenshot) sebelum menutup apa pun.
3. **Ubah satu hal per satu** dan tes — jangan mengubah banyak setting sekaligus.
4. **Punya rencana cadangan**: kabel USB kedua, koneksi Wi-Fi kedua, dan lembar pencatatan skor manual (kertas) selalu siap. Skor resmi bisa dicatat manual dulu, diinput ke website setelah masalah selesai.
