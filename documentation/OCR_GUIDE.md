# AI OCR SCREENSHOT — Isi Hasil Match Otomatis (BOF) · v3 AKURAT

> Fitur: upload screenshot layar hasil match Free Fire → OCR membaca **SEMUA
> blok placement** (rank + **total kill tim** = penjumlahan kill 4 pemain,
> setiap angka diverifikasi ulang) → admin pilih tim terdaftarnya di dropdown
> → formulir Entri Hasil terisi OTOMATIS → Simpan Draft → Preview → Publish.
> **TANPA NAMA PEMAIN** — hasil hanya rank + total kill; penentuan tim
> dilakukan admin (bisa tanpa kapten/roster sama sekali).
> Dibuat khusus untuk BOF (STIKAR ESPORTS) oleh SAPUTRA DEVELOPER.

## 0. Yang baru di v3 (kenapa sekarang akurat)

| Masalah versi lama | Solusi v3 |
| --- | --- |
| Hanya 3 team terdeteksi padahal 10 di layar | Anchor deteksi pindah ke kata **"Kill"** yang selalu terbaca (bukan badge emas yang sering gagal terbaca) — semua blok ikut terdeteksi |
| Angka kill salah (top 1 terbaca 12, seharusnya 19) | **Setiap sel angka di-zoom ulang** dengan *mask warna kuning* (angka kill kuning pekat, nama pemain putih — terpisah bersih) + whitelist digit `0-9` + normalisasi ukuran glyph. Angka yang tidak yakin DITOLAK, bukan ditebak |
| OCR menghitung/menampilkan nama pemain | Nama pemain **tidak dibaca lagi**; output = `{rank, total kill}`; admin memilih tim per rank |
| Badge rank 1-3 (emas) tak terbaca → blok hilang | Rank tidak terbaca → **diisi otomatis dari urutan** (kolom kiri mulai 1, kolom kanan lanjut). Badge yang terbaca selalu menang |
| Angka bersatu dengan "Kill" ("4Kil", "TKill") | Token menempel dideteksi + selalu di-rescue; kalau tidak yakin, sel diisi ulang dari slot grid-nya (posisi kolom angka sangat konsisten ±3 px) |

Hasil uji nyata pada screenshot turnamen (11 blok terlihat): **10 blok terbaca
lengkap 4/4 sel, semua total benar** — Top 1 = 3+6+5+5 = **19**, Top 2 = 18,
Top 3 = 15, dst. (0 salah). Uji otomatis: `npx tsx scripts/test-ocr-rows.ts <gambar>`.

## 1. Cara pakai (alur admin)

1. Buka `/admin/matches` → pilih match → halaman **Entri Hasil**.
2. Di kartu **ANALISA SCREENSHOT (AI OCR)**: klik **Pilih Screenshot**
   (bisa kamera langsung di HP), lalu **Upload & Analisa**.
   Progres tampil di layar (siapkan gambar → baca 2 tahap → teliti ulang
   tiap angka → susun hasil).
3. Tabel hasil muncul per blok placement:
   - **Rank** = nomor top # di layar → masuk kolom PLACEMENT.
   - **Kills** = TOTAL penjumlahan kill semua pemain dalam satu top #
     (contoh 3+6+5+5 = 19) → masuk kolom KILLS. Angka bisa diedit langsung.
   - **Tim terdaftar**: pilih tim dari dropdown — cocokkan urutan rank di
     layar dengan daftar tim. Tanpa kapten/roster pun tetap jalan.
   - Baris dengan keyakinan rendah = angka kurang lengkap / rank otomatis —
     cek baris itu. Hilangkan centang baris yang tidak dipakai (blok terpotong).
4. Klik **TERAPKAN KE FORMULIR** → kolom Placement & Kills terisi otomatis.
   PLACEMENT PTS, KILL PTS dan TOTAL dihitung OTOMATIS (kill = 2 poin).
5. **Simpan Draft** → **Preview** → **Publish** seperti alur resmi.

Link gambar otomatis tersimpan: di koleksi `ocrUploads` (arsip) dan di dokumen
match (`screenshotUrl`) sebagai bukti SS hasil.

## 2. Cara kerja mesin (ringkas)

1. **2 pass Tesseract.js** di browser admin (PSM 6 + PSM 11, koordinat kata).
2. **Parser kill-anchored** (`src/lib/ocr-rows.ts`):
   - kata "Kill" = anchor; angka di kirinya = kill per pemain;
   - posisi-x angka sangat konsisten → GRID kolom (band) × baris;
   - sel tanpa bukti teks dibaca dari slot grid-nya (zoom ulang);
   - blok = 1-2 baris sel per paruh kolom; rank dari badge (strip sejajar)
     atau urutan otomatis;
   - total kill tim = penjumlahan sel blok.
3. **Rescue digit**: mask kuning pekat (R-B ≥ 85) memisahkan angka dari
   nama/kata "Kill" → bbox glyph dinormalisasi tinggi 48 px → Tesseract
   whitelist `0-9` (PSM 10/7/8) → hasil paling yakin dipakai.
4. **Fallback server**: bila browser membaca 0 blok dan link ImgBB tersedia,
   pipeline sama dijalankan di server (`/api/ai/ocr`, `runOcrPipeline`).

## 3. Screenshot yang bagus

- Layar **hasil/klasemen akhir** (yang ada angka 1, 2, 3… dan "N Kill").
- Semua rank terlihat (kalau 12 tim tidak muat, screenshot sisanya lalu
  analisa lagi — baris sama akan diperbarui di formulir).
- Hindari screenshot layar detail pemain / booyah tunggal tanpa tabel.

## 4. Pengaturan & arsitektur

- OCR utama berjalan **di browser admin** — tanpa biaya server, tanpa batas
  waktu. Fallback server otomatis.
- **Endpoint & model** diatur dari UI: Admin → Pengaturan → AI & OCR
  (dokumen Firestore `settings/ocr`) — BUKAN di .env.
- `.env` hanya berisi key (satu per provider): `IMGBB_API_KEY` (hosting
  gambar) + `JERE_API_KEY` (cadangan AI).
- Koleksi Firestore: `ocrUploads` (arsip analisa), `matches/{id}`
  (`screenshotUrl` bukti).

## 5. Uji otomatis

```bash
# parser vs screenshot asli (verifikasi akurasi):
npx tsx scripts/test-ocr-rows.ts /path/screenshot-hasil.jpg
```
Test memverifikasi: ≥10 blok, top 1 = 19 (3+6+5+5), tanpa rank ganda,
≥8 blok lengkap 4/4 sel.
