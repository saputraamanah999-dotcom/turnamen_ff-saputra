# AI OCR SCREENSHOT — Isi Hasil Match Otomatis (BOF)

> Fitur: upload screenshot hasil match Free Fire → mesin OCR membaca
> **placement (top #) + total kill** → admin atur timnya (otomatis bila memori
> ada, manual pun bisa TANPA kapten/roster) → formulir Entri Hasil terisi
> OTOMatis → Simpan Draft → Preview → Publish.
> Dibuat khusus untuk BOF (STIKAR ESPORTS) oleh SAPUTRA DEVELOPER.

## 1. Cara pakai (alur admin)

1. Buka `/admin/matches` → pilih match → halaman **Entri Hasil**.
2. Di kartu **ANALISA SCREENSHOT (AI OCR)**: klik **Pilih Screenshot**
   (bisa kamera langsung di HP), lalu **Upload & Analisa**.
   Progres tampil di layar (siapkan gambar → baca 2 tahap → pulihkan angka
   buram → hitung & cocokkan).
3. Tabel hasil muncul per blok placement:
   - **Rank** = nomor top # di layar → masuk kolom PLACEMENT.
   - **Kills** = TOTAL penjumlahan kill semua pemain dalam satu top #
     (contoh 3+6+5+5 = 19) → masuk kolom KILLS. Rincian penjumlahan
     ditampilkan di bawah angka supaya mudah dicek.
   - **Tim terdaftar**: bila cocok otomatis (nama/tag/kapten/roster/alias),
     tidak perlu apa-apa. Bila "tidak cocok / manual" — **pilih tim dari
     dropdown** (boleh tanpa kapten/roster sama sekali).
   - Koreksi angka bila perlu, hilangkan centang baris yang tidak dipakai.
4. Klik **TERAPKAN KE FORMULIR** → kolom Placement & Kills terisi otomatis.
   PLACEMENT PTS, KILL PTS dan TOTAL dihitung OTOMATIS (kill = 2 poin) —
   admin hanya mengisi/ merevisi angka placement & kills.
5. **Simpan Draft** → **Preview** → **Publish** seperti alur resmi.

Link gambar otomatis tersimpan: di koleksi `ocrUploads` (arsip) dan di dokumen
match (`screenshotUrl`, tampil sebagai badge BUKTI SS).

## 2. Mesin OCR — berjalan DI BROWSER admin (utama)

- **Tesseract.js di perangkat admin** (bebas biaya, tanpa API key, bebas batas
  waktu server): membaca posisi kata (word boxes) → parser geometris
  `src/lib/ocr-blocks.ts` mendeteksi kolom angka placement → memecah blok
  per top # → menjumlahkan kill 4 pemain → rank & total kill.
- Angka kill yang buram dipulihkan lewat **re-OCR terarah** (zoom area +
  whitelist digit).
- Screenshot HP (±1080px) maupun tablet (≤1600px) didukung — gambar SELALU
  digambar ke canvas dulu (fix bug `o.toDataURL is not a function` yang
  dulu muncul di Chrome Android).
- Bila blok placement tidak terbaca → pesan error jelas: pastikan screenshot
  adalah layar skor akhir/BOOYAH!, cukup terang, tidak terpotong.

## 3. AI JERE (SATU-SATUNYA provider AI) — memperbaiki nama

- Angka (placement & kill) dihitung geometris — tidak tergantung AI.
- Nama pemain yang salah baca diperbaiki **aichat jerexd** bila
  `JERE_API_KEY` terpasang; lalu dicocokkan ke tim terdaftar
  (nama/tag/kapten/roster/alias `ocrAliases`).
- **Tanpa kapten/roster pun jalan**: semua baris tetap muncul dengan
  "tidak cocok / manual" — admin tinggal memilih tim per baris.
- Jika tampilan OCR dipakai tanpa blok (mode cadangan server), JERE Vision
  membaca gambar langsung (`chatvision-v2` + `chatvision` paralel, lalu
  `aichat` menstrukturkan JSON).

## 4. Endpoint & model — DIATUR DARI UI, BUKAN .env

Admin → **Pengaturan → AI & OCR** (tersimpan di Firestore `settings/ocr`,
berlaku untuk semua admin tanpa deploy ulang):

| Pengaturan | Default | Fungsi |
| --- | --- | --- |
| Endpoint AI (base URL) | `https://api.jerexd.my.id` | ganti di sini bila server pindah |
| Model vision Jerexd | (kosong = bawaan server) | dipakai chatvision-v2 |
| Model teks Jerexd | `google/gemini-3.1-flash-lite` | penstruktur JSON aichat |

Halaman itu juga menampilkan status key: terpasang / belum diisi.

## 5. Environment — HANYA 2 KEY (Vercel → Settings → Environment Variables)

```env
IMGBB_API_KEY=ae271538eef73c1305493b82bf34b9d5     # hosting gambar (ada bawaan)
JERE_API_KEY=jere_xxx                               # Jerexd — SATU-SATUNYA key AI
```

Tidak ada lagi GEMINI/OPENAI/OCR_SPACE di kode — prinsip BOF: **satu key per
provider**. Endpoint & model TIDAK di env (lihat §4).

## 6. Upload gambar

`POST /api/upload/screenshot` (file: `src/app/api/upload/screenshot/route.ts`):

- **HOSTING TUNGGAL: ImgBB** — `https://api.imgbb.com/1/upload`, TANPA
  expiration. Gagal jaringan → otomatis dicoba ulang 1×.
  (Supabase dihapus dari alur — keputusan owner: Firebase = database,
  ImgBB = hosting gambar.)
- Batas: PNG/JPG/WEBP maks 20 MB. API key tidak pernah dikirim ke browser.

## 7. Firestore

- Koleksi `ocrUploads` (arsip analisa) dan `settings` (dokumen `settings/ocr`)
  — ATURAN: hanya admin (dideploy LIVE via service account; tersinkron ke
  `public/setup.html`).
- Dokumen tim: field `captain`, `ocrAliases`.
- Dokumen match: field `screenshotUrl`, `screenshotThumbUrl`.
- Bootstrap: `GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccountKey.json \
  node scripts/bootstrap-ocr.mjs`

## 8. Kejujuran & batasan

- **Tanpa `JERE_API_KEY`** fitur tetap jalan (OCR browser geometris +
  pencocokan lokal) — hanya perbaikan nama otomatis yang mati; admin
  memilih tim manual. Selalu periksa tabel sebelum TERAPKAN.
- Baris dengan angka kill pemain yang tak terbaca ditandai **WAJIB DIPERIKSA**
  + catatan "total bisa KURANG" — koreksi angka Kills sebelum publish.
- AI tidak pernah mem-PUBLISH hasil — publish tetap lewat tombol resmi
  (draft → preview → publish) dan masuk audit log.
- Angka `points` dari layar hanya ditampilkan, tidak dipakai menghitung poin
  resmi (poin resmi tetap aturan BOF: kill = 2 poin).

## 9. Test

```bash
npx tsx scripts/test-analyze-blocks.ts   # penjumlahan kill + mode tanpa kapten
npm run test:ocr                         # 36 test fungsi murni OCR/pencocokan
npm run test:scoring                     # 16 test
```
