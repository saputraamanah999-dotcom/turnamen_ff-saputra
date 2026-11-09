# ▲ DEPLOY KE VERCEL — ZEROID ESPORTS (BOF)

Panduan deploy website turnamen ke **Vercel** (paket **Hobby / gratis**) — ditulis untuk
dikerjakan langsung dari **HP (Chrome Android)** maupun laptop.

> **Kenapa dulu gagal?** Repo lama berbentuk monorepo (`apps/web` + `observer-ai`) sehingga
> Vercel mendeteksi **2 aplikasi** dan masuk mode **"Services"** yang menuntut konfigurasi
> `vercel.json` multi-service. Sekarang aplikasi Next.js sudah dipindahkan ke **root repo**
> → Vercel langsung mendeteksi **satu proyek Next.js**. Tidak perlu konfigurasi apa pun.

---

## 1. Persiapan: hapus project lama yang gagal

1. Buka **vercel.com** → login (pakai akun GitHub).
2. Masuk dashboard team **saputraamanah999-…** → cari project `turnamen_ft-saputra` yang gagal.
3. **Project Settings → General → Delete Project** (ketik nama project untuk konfirmasi).
   Ini penting supaya saat import ulang tidak membawa setelan "Services" yang salah.

## 2. Import ulang repo

1. Dashboard → **Add New… → Project**.
2. Pilih repo **`turnamen_ff-saputra`** → klik **Import**.
3. Pastikan tampilan konfigurasi:
   - **Framework Preset**: `Next.js` (terdeteksi otomatis, TIDAK lagi "Services")
   - **Root Directory**: `./` (biarkan default, jangan diubah)
   - **Build Command**: `next build` · **Install Command**: `npm install`
   - **Node.js Version**: 20.x atau 22.x

   Kalau masih muncul dialog *"This repo requires a vercel.json"* → berarti kamu masih
   membuka project/import lama. Ulangi langkah 1 (hapus project lama) lalu import lagi.

## 3. Isi Environment Variables

Sebelum menekan **Deploy**, buka bagian **Environment Variables** dan isi **6 variabel**
(untuk **Production and Preview**). Semua nilainya diambil dari *Firebase console →
Project settings → Your apps → SDK setup and configuration* (sama dengan isi `.env`):

| Key | Wajib? | Keterangan |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | ✅ | Web API Key Firebase |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | ✅ | mis. `turnamenffbof.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | ✅ | mis. `turnamenffbof` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | ✅ | mis. `turnamenffbof.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | ✅ | Sender ID (angka panjang) |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | ✅ | **Sering terlewat!** format `1:…:web:…` |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | ⬜ opsional | untuk Analytics (`G-…`) |

> ⚠️ **`BRIDGE_PASSWORD_HINT` TIDAK PERLU di Vercel.** Itu variabel untuk
> `broadcast-bridge` yang berjalan di **laptop produksi** (OBS), bukan di server.
> Hapus kalau sempat diisi.

## 4. Deploy

1. Klik **Deploy** → tunggu ± 1–3 menit.
2. Kalau sukses, muncul tombol **Continue to Dashboard** + domain gratis
   `https://turnamen-ff-saputra.vercel.app` (atau serupa).
3. Buka domain itu → halaman publik BOF harus tampil.

## 5. Setelah deploy — checklist Firebase

Website sudah online, tapi untuk **data & admin** masih perlu (dari laptop, sekali saja):

1. **Firestore database** dibuat di Firebase console (*Build → Firestore Database → Create*).
2. **Seed data awal + super admin**:
   ```bash
   # simpan service account JSON di ./secrets/serviceAccountKey.json
   npm install
   npm run seed
   ```
3. **Security rules + composite indexes**:
   ```bash
   npm run deploy:rules
   ```
4. Login admin di `https://<domain>.vercel.app/admin` dengan akun super admin hasil seed.

> Tanpa langkah 2–3, halaman publik tetap tampil namun **kosong** (tanpa klasemen/tim) —
> itu perilaku normal karena Firestore masih belum berisi data & rules belum terpasang.

## 5b. Cara MUDAH tanpa laptop — halaman `/setup.html` ⚡

Repo ini menyertakan **halaman setup satu-klik**: `public/setup.html` → setelah deploy bisa
dibuka di **`https://<domain-vercel-kamu>/setup.html`** langsung dari HP.

1. Buka `/setup.html` di HP/laptop.
2. Konfigurasi sudah terisi otomatis (project `turnamenffbof`) — email & password super
   admin bisa diganti di kolom yang tersedia.
3. **Langkah 2**: tempel isi file JSON *service account* Firebase (diproses langsung di
   browser → Google; tersimpan hanya di perangkat kamu; bisa dihapus kapan saja).
4. Tekan tombol biru besar **"⚡ BUAT SEMUA — SEKALI PENCET"**. Halaman akan otomatis:
   aktifkan login Email/Password → buat akun super admin + `adminRoles` → seed data
   turnamen (12 tim, 7 match, 3 hasil resmi, klasemen) → pasang security rules →
   buat composite indexes → cek status.
5. Selesai! Login admin di `/admin`. Setelah setup, tombol-tombol ini tidak perlu
   dipakai lagi; opsional hapus service account dari perangkat (tombol 🗑).

> Halaman ini menggantikan `npm run seed` + `npm run deploy:rules` — tidak butuh laptop,
> tidak butuh Node.js. Tetap tersedia keduanya untuk yang terbiasa terminal.

## 6. Masalah umum

| Gejala | Solusi |
|---|---|
| Dialog "requires a vercel.json" saat import | Project lama belum dihapus / masih import setelan lama. Hapus project, import ulang. |
| Build gagal `NEXT_PUBLIC_FIREBASE_APP_ID` kosong | Variabel wajib belum diisi — lengkapi 6 variabel di langkah 3. |
| Halaman terbuka tapi klasemen kosong | Firestore belum di-seed / rules belum dideploy (lihat langkah 5 atau 5b). |
| Login admin gagal | Buat akun admin via `/setup.html` (langkah 5b) atau `npm run seed` dari laptop. |
| Deploy ulang | Cukup `git push` ke GitHub — Vercel otomatis build ulang. |

---

*Deploy guide — ZEROID ESPORTS · Designed by SAPUTRA DEVELOPER*
