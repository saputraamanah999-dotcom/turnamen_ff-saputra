# FIREBASE_SETUP.md — Setup Firebase untuk STIKAR ESPORTS (BOF)

Dokumen ini memandu panitia/developer menyiapkan **backend Firebase** dari nol sampai website bisa dipakai. Ikuti urutan bab secara berurutan. Semua langkah menggunakan **Spark plan (gratis)** — **jangan pernah mengaktifkan billing** atau upgrade ke Blaze.

**Yang dibutuhkan sebelum mulai:**
- Satu akun Google (disarankan akun resmi sekolah, bukan akun pribadi).
- Kode proyek website (Next.js) lengkap dengan file `firestore.rules`, `firestore.indexes.json`, dan folder `scripts`.
- Node.js terpasang di laptop.

> Catatan istilah: **project ID** adalah nama unik project Firebase Anda; **service account** adalah file kunci (JSON) yang dipakai script lokal untuk menulis ke Firestore.

---

## 1. Buat Project Firebase (Spark Plan, Tanpa Billing)

1. Buka `https://console.firebase.google.com` di browser.
2. Login memakai akun Google sekolah.
3. Klik **Create a project** (atau "Add project").
4. Isi nama project, misalnya `stikar-bof-smktibgk`.
5. Jika ditanya tentang Google Analytics: **pilih tidak aktif** (tidak diperlukan).
6. Klik **Create project** dan tunggu proses selesai.
7. **PENTING:** Buka menu ikon roda gigi (Project Settings) → tab **Usage and billing**. Pastikan tertulis **Spark plan**. Jangan pilih upgrade ke Blaze. Spark sudah cukup untuk Auth email/password + Firestore.

[Screenshot tempel di sini: halaman Usage and billing yang menampilkan Spark plan]

---

## 2. Aktifkan Firebase Auth (Email/Password)

1. Di menu samping console, pilih **Build → Authentication**.
2. Klik **Get started**.
3. Pada tab **Sign-in method**, pilih **Email/Password**.
4. Aktifkan (Enable) **Email/Password**, klik **Save**.
5. (Opsional) Tambahkan satu user admin sementara di tab **Users** → **Add user** → isi email dan password. User ini akan dipakai untuk login pertama di `/admin`.

**Kenapa email/password?** Karena sistem BOF hanya memakai metode ini. Operator panitia login di route `/admin` dengan email/password yang sudah didaftarkan di sini. Jangan mengaktifkan metode login lain (Google, HP, dll.) jika tidak dipakai — lebih sedikit metode, lebih aman.

---

## 3. Buat Cloud Firestore

1. Menu samping → **Build → Firestore Database**.
2. Klik **Create database**.
3. Pilih lokasi (region). Pilih yang terdekat, misalnya `asia-southeast2` (Jakarta). Lokasi tidak bisa diubah setelah dibuat.
4. Mode keamanan awal: pilih **Start in production mode** (aturan akan dideploy pada langkah berikutnya).
5. Klik **Create**. Firestore siap dipakai.

Ciri kerja realtime: setiap perubahan data (skor, poin, hasil match) langsung tampil di halaman publik tanpa refresh, karena website membaca Firestore secara realtime.

---

## 4. Deploy Rules & Indexes

Firestore Rules mengatur siapa yang boleh membaca/menulis data. Firestore Indexes membuat pencarian dan pengurutan leaderboard/match cepat.

**Sekali saja — siapkan alat:**

1. Buka folder proyek website di terminal/CMD.
2. Pastikan file `firestore.rules` dan `firestore.indexes.json` ada di root proyek.
3. Login ke Firebase dari terminal:

```bash
npm i -g firebase-tools
firebase login
```

Browser akan terbuka — login dengan akun yang sama seperti console.

**Deploy rules dan indexes:**

```bash
firebase use --add
```

Pilih project yang tadi dibuat, lalu jalankan:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Tunggu sampai muncul pesan sukses (`Deploy complete!`). Jika gagal karena project belum terhubung, ulangi `firebase use --add`.

📸 [Tempel screenshot: hasil terminal setelah firebase deploy --only firestore:rules,firestore:indexes berhasil]

---

## 5. Jalankan Seeding (Data Awal)

Seeding mengisi Firestore dengan data awal (misalnya struktur turnamen contoh) agar website tidak kosong.

1. Masuk ke folder `scripts` di dalam proyek:

```bash
cd scripts
npm install
```

2. Ambil **service account**: console Firebase → Project Settings → **Service accounts** → klik **Generate new private key** → file JSON akan terunduh.
3. Simpan file JSON itu di dalam folder `scripts` (jangan dipindah-pindah, jangan dibagikan).
4. Ikuti instruksi pemakaian di `scripts/README.md` (jika ada) atau bagian konfigurasi pada script seed: biasanya cukup meletakkan file service account dengan nama yang dicari script.
5. Jalankan seeding:

```bash
npm run seed
```

6. Buka kembali Firestore di console — koleksi data awal akan muncul. Jika terjadi error "permission denied", berarti file service account salah lokasi atau salah nama.

> **Keamanan:** file service account adalah kunci penuh ke database. Jangan dikirim lewat grup WhatsApp, jangan di-commit ke git.

---

## 6. Bootstrap Super Admin

Super admin adalah akun pertama yang punya akses penuh di Admin Panel.

1. Pastikan user sudah dibuat di Firebase Auth (langkah 2, bagian "Users"), atau buat sekarang.
2. Jalankan script bootstrap dari folder `scripts` (nama perintah mengikuti `package.json` di folder tersebut), yang memberi peran super admin pada email tersebut di Firestore.
3. Buka website, masuk ke route `/admin`, login dengan email/password tadi.
4. Jika berhasil masuk dan bisa melihat panel kelola turnamen, bootstrap sukses.
5. Tambahkan akun operator lain hanya bila benar-benar diperlukan. Semua operator login via Firebase Auth email/password.

---

## 7. Deploy Hosting (Website Online)

1. Masih di terminal, di root proyek website:

```bash
npm i -g firebase-tools      # lewati jika sudah terpasang
firebase init hosting
```

Saat `firebase init hosting`:
- Pilih project yang tadi dibuat.
- Public directory: sesuaikan dengan konfigurasi Next.js pada proyek (ikuti nilai yang sudah ditetapkan di repo — biasanya sudah ada file `firebase.json`).
- Single-page app: jawab sesuai konfigurasi repo.

2. Build website:

```bash
npm run build
```

3. Deploy:

```bash
firebase deploy
```

4. Terminal akan menampilkan **Hosting URL**, misalnya `https://stikar-bof-smktibgk.web.app`. Buka URL itu — beranda `/` harus tampil.
5. Uji cepat: buka `/leaderboard`, `/teams`, `/matches`, dan `/admin` (login). Semua harus tampil tanpa error.

**Update selanjutnya:** setiap kali konten berubah, cukup `npm run build` lalu `firebase deploy`.

---

## 8. Checklist Akhir Firebase

- [ ] Project Firebase berstatus **Spark plan** (tanpa billing).
- [ ] Auth **Email/Password** aktif, minimal 1 user admin ada.
- [ ] Firestore dibuat (production mode), lokasi region terdekat.
- [ ] `firebase deploy --only firestore:rules,firestore:indexes` sukses.
- [ ] `npm run seed` di folder `scripts` sukses (data awal muncul).
- [ ] Super admin bootstrap sukses, bisa login di `/admin`.
- [ ] `firebase deploy` hosting sukses, website bisa dibuka publik.
- [ ] File service account disimpan aman, tidak dibagikan.

Jika semua tercentang, lanjut ke [OBS_SETUP.md](OBS_SETUP.md).
