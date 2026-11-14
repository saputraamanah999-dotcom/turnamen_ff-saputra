# AI OCR SCREENSHOT — Isi Hasil Match Otomatis (BOF)

> Fitur: upload screenshot hasil match Free Fire → AI membaca placement +
> nama tim + kill → formulir Entri Hasil terisi OTOMATIS → lanjut match berikutnya.
> Terinspirasi alur pointmaster, dibuat khusus untuk BOF (STIKAR ESPORTS).

## 1. Cara pakai (alur admin)

1. Buka `/admin/matches` → pilih match → halaman **Entri Hasil**.
2. Di kartu **ANALISA SCREENSHOT (AI OCR)**: klik **Pilih Screenshot**
   (bisa kamera langsung di HP), lalu **Upload & Analisa**.
3. Tabel hasil muncul: rank, nama tim di layar, tim terdaftar yang dicocokkan,
   kills, dan tingkat keyakinan (%). Koreksi bila perlu (pilih tim manual /
   ubah angka / hilangkan centang baris yang salah).
4. Klik **TERAPKAN KE FORMULIR** → kolom Placement & Kills tabel entri terisi
   otomatis. Periksa sekali lagi → **Simpan Draft** → **Preview** → **Publish**.
5. Ulangi untuk match berikutnya.

Link gambar otomatis tersimpan: di koleksi `ocrUploads` (arsip) dan di dokumen
match (`screenshotUrl`, tampil sebagai badge BUKTI SS).

## 2. Memori tim (kapten + alias) — inti pencocokan

AI mencocokkan nama di layar dengan tim terdaftar memakai urutan sumber:

| Sumber | Contoh di layar → cocok ke |
| --- | --- |
| Nama tim | "REVENGE ESPORTS" |
| Tag | "RVS" |
| **Kapten (nama akun FF)** | nama kapten tercantum di layar skor |
| Roster | nickname pemain |
| **Alias OCR (memori)** | "TEAM REVNGE" yang pernah dikonfirmasi admin |

- Isi **Kapten** dan **Roster** di `/admin/teams` → semakin lengkap semakin akurat.
- Setiap kali admin menekan TERAPKAN, nama mentah dari screenshot disimpan
  sebagai **alias** di dokumen tim (`ocrAliases`) → screenshot berikutnya
  langsung cocok tanpa koreksi.

## 3. Endpoint AI OCR — rantai mesin

`POST /api/ai/ocr` (file: `src/app/api/ai/ocr/route.ts`) memilih mesin
pertama yang key-nya tersedia:

1. **Gemini Vision** (REKOMENDASI — gratis, paling akurat untuk font FF)
   - env: `GEMINI_API_KEY`, model `AI_OCR_MODEL` (default `gemini-2.0-flash`)
   - ambil key gratis: <https://aistudio.google.com/apikey> (±2 menit)
2. **OpenAI-compatible** (opsional)
   - env: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` (boleh endpoint lain)
3. **OCR.space** (fallback TANPA key — langsung jalan)
   - env: `OCR_SPACE_KEY` (default `helloworld`, key uji publik, dibatasi kuota)
   - hasil OCR polos ditandai **WAJIB DIPERIKSA** (`needsReview: true`)

Bila semua gagal → respons berisi `detail` per mesin + petunjuk memperbaiki.

## 4. Endpoint upload gambar

`POST /api/upload/screenshot` (file: `src/app/api/upload/screenshot/route.ts`):

- **Utama: ImgBB** — `https://api.imgbb.com/1/upload`, TANPA expiration
  (gambar permanen; bila ingin sementara: `?ttl=detik`).
  env: `IMGBB_API_KEY` (kosong → memakai key bawaan turnamen di kode).
- **Cadangan: Supabase Storage** — bucket publik `bof-screenshots`
  DIBUAT OTOMATIS saat dibutuhkan. env: `NEXT_PUBLIC_SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY`.
- Batas: PNG/JPG/WEBP maks 20 MB. API key tidak pernah dikirim ke browser.

## 5. Environment (Vercel → Settings → Environment Variables)

```env
IMGBB_API_KEY=ae271538eef73c1305493b82bf34b9d5     # opsional (ada bawaan)
GEMINI_API_KEY=                                      # SANGAT disarankan (gratis)
AI_OCR_MODEL=gemini-2.0-flash
OCR_SPACE_KEY=helloworld                             # fallback
NEXT_PUBLIC_SUPABASE_URL=https://abbbqjahqehewyvkzoro.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...                     # cadangan hosting
```

Setelah menambah env di Vercel → **Redeploy** agar terbaca.

## 6. Firestore

- Koleksi baru `ocrUploads` — ATURAN: hanya admin (sudah dideploy LIVE via
  service account; juga tersinkron otomatis ke `public/setup.html`).
  Isi: link gambar, dimensi, host, hasil analisa, status applied.
- Dokumen tim menambah field: `captain`, `ocrAliases`.
- Dokumen match menambah field: `screenshotUrl`, `screenshotThumbUrl`.
- Bootstrap: `GOOGLE_APPLICATION_CREDENTIALS=./secrets/serviceAccountKey.json \
  node scripts/bootstrap-ocr.mjs`

## 7. Kejujuran & batasan

- **TANPA `GEMINI_API_KEY`**, fitur tetap jalan via OCR.space tetapi akurasi
  menurun pada font stylized FF (terutama nama dengan simbol). Selalu periksa
  tabel hasil sebelum TERAPKAN.
- AI tidak pernah mem-PUBLISH hasil — publish tetap lewat tombol resmi
  (draft → preview → publish) dan masuk audit log.
- Angka `points` dari layar hanya ditampilkan, tidak dipakai menghitung poin
  resmi (poin resmi tetap dari aturan BOF: kill = 2 poin).
- Key yang pernah ditempel di chat publik sebaiknya dirotasi berkala
  (ImgBB: regenerasi di akun; GitHub token; service account bila perlu).

## 8. Test

```bash
npm run test:ocr        # 36 test fungsi murni OCR/pencocokan
npm run test:scoring    # 16 test
npm run test:p2p        # 18 test
npm run test:caster     # 18 test
```

Sudah diverifikasi nyata: upload PNG uji → ImgBB OK (url/thumb/delete),
fallback Supabase OK (bucket otomatis + baca publik), analisa OCR.space
membaca skor uji dan memori alias mencocokkan "TEAM REVNGE" → "REVENGE
ESPORTS" tanpa koreksi.
