# GUIDE 13 — Cara Membaca Hasil Analisis AI

## Tujuan
Memahami tampilan hasil **AI Observer** di Admin Panel: jenis event, tingkat keyakinan (confidence), dan langkah konfirmasi manual sebelum data dipakai untuk skor resmi.

## Prasyarat
- AI Observer berjalan dan terhubung dari **Admin > AI Observer** (`http://127.0.0.1:8077`) — lihat [GUIDE_12](GUIDE_12_jalankan-ai-observer.md).
- Operator memahami prinsip: **AI hanya indikasi, tidak mengubah skor resmi**.

## Langkah-langkah Membaca Hasil
1. Buka website → `/admin` → menu **AI Observer**.
2. Amati daftar **event indikasi** yang muncul realtime. Setiap item berisi:
   - **Waktu** analisis (kapan frame dibaca).
   - **Jenis event** (mis. indikasi kill, indikasi perubahan kondisi permainan).
   - **Target/tim** yang terindikasi sesuai yang terbaca OCR/camera vision.
   - **Confidence** — persentase keyakinan AI.
3. Baca confidence dengan peta berikut:

| Confidence | Interpretasi | Aksi operator |
|---|---|---|
| Tinggi (± >70–80%) | Indikasi kuat | Cek layar sebentar; jika terlihat benar → catat |
| Sedang (± 40–70%) | Mungkin benar | Wajib konfirmasi visual lebih teliti |
| Rendah (<40%) | Kemungkinan salah baca (efek, angka kecil, glare) | Abaikan atau verifikasi ekstra |

4. **Konfirmasi manual**: lihat langsung jendela scrcpy/gameplay — apakah benar terjadi kill/peristiwa tersebut?
5. Jika benar → **catat** di lembar panitia (waktu, tim, jenis event).
6. Jika ragu → tanyakan ke pemain/panitia lapangan, atau tunda ke review rekaman.
7. Setelah game selesai, hasil yang terkonfirmasi dipakai sebagai dasar input **skor resmi** lewat `/admin` ([GUIDE_04](GUIDE_04_memasukkan-hasil-pertandingan.md)), lalu publikasikan.
8. Jika AI sering salah baca atau kosong → perbaiki kalibrasi ([GUIDE_17](GUIDE_17_atasi-ai-gagal-baca-hud.md)).

## Kapan Anda Mengandalkan AI?
- **Boleh sebagai alat bantu**: pengingat event yang terlewat mata operator, dokumentasi waktu kejadian, alur pencatatan lebih cepat.
- **Jangan sebagai hakim**: penentuan skor, tiebreaker, keputusan sengketa tetap di tangan panitia dengan bukti (rekaman/screenshot). AI berjalan 1–5 FPS sehingga bisa terlewat event cepat atau telat beberapa detik.

## Privasi
Hasil analisis muncul **hanya di jaringan lokal** (Admin Panel + laptop AI). Frame dianalisis di laptop dan **tidak diunggah ke internet**. Jangan menyebarkan tangkapan frame yang menampilkan data pribadi pemain tanpa izin panitia.

📸 [Tempel screenshot: daftar indikasi event di halaman Admin > AI Observer dengan kolom confidence]

## Tips
- Gunakan AI dengan FPS 2 untuk keseimbangan; naikkan ke 5 hanya bila laptop kuat dan hasil masih stabil.
- Beri tanda centang pada lembar panitia setiap kali indikasi tinggi dikonfirmasi — memudahkan rekonsiliasi saat input hasil.
- Simpan log/halaman analisis dalam screenshot setiap game sebagai bukti pendukung.

## Kesalahan Umum
- Langsung menginput skor hanya karena confidence tinggi — konfirmasi visual **tetap wajib**.
- Mengira jumlah indikasi kill = jumlah kill resmi — indikasi bisa ganda/terlewat; hitung dari layar hasil game.
- Mengabaikan jenis event dan hanya melihat angka — baca deskripsi eventnya.
- Membagikan hasil AI ke publik sebelum konfirmasi — bisa memicu salah informasi di penonton.
- Panik saat AI offline di tengah game — lanjutkan pencatatan manual; skor resmi tidak bergantung AI.
