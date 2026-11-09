# STIKAR ESPORTS — BATTLE OFF FRIENDS (BOF)

**Platform manajemen turnamen esports Free Fire, leaderboard realtime, dan broadcast profesional** untuk **SMK TI Bali Global Karangasem**.

*Designed & Developed by **SAPUTRA DEVELOPER***

[![Firebase](https://img.shields.io/badge/Firebase-Spark%20Plan%20(gratis)-182CFF?style=for-the-badge)](https://firebase.google.com/pricing)
[![Next.js](https://img.shields.io/badge/Next.js-16-111111?style=for-the-badge)](https://nextjs.org)
[![Free-First](https://img.shields.io/badge/Infrastruktur-100%25%20Gratis-FFE600?style=for-the-badge&labelColor=111111)](documentation/README.md)

---

## ⚡ Apa ini?

Bukan sekadar website leaderboard. STIKAR ESPORTS menggabungkan:

1. **Website publik** — home, live match (video + leaderboard realtime), klasemen, tim, jadwal, statistik, panduan.
2. **Panel admin** — kelola turnamen, tim, match, entri hasil resmi dengan kalkulasi otomatis, publish realtime, audit log.
3. **Sistem poin resmi BOF** — placement 20/17/15/…/0 + 2 poin per kill, tiebreaker resmi, versi aturan dicatat per match.
4. **Overlay broadcast** — 7 layout overlay transparan untuk OBS Browser Source dengan tema emas/hitam BOF.
5. **Broadcast bridge** — service Node lokal untuk kontrol scene OBS (obs-websocket) dari dashboard.
6. **AI Observer** — service Python lokal: OCR nama pemain, indikasi pertarungan, deteksi map — semua event berstatus *pending* dan diverifikasi operator.

## 🏗️ Struktur Proyek

```
turnamen_ff-saputra/
├── src/                     # Next.js 16 — website + admin + overlay (Firebase client SDK)
├── public/
├── broadcast-bridge/        # Service Node LOKAL — OBS WebSocket bridge (port 8078, localhost)
├── observer-ai/             # Service Python LOKAL — AI Observer (port 8077, localhost)
├── firebase/
│   ├── firebase.json
│   ├── firestore.rules      # Security rules (publik baca-only, tulis via adminRoles)
│   └── firestore.indexes.json
├── scripts/
│   ├── seed-firebase.mjs    # Seed: super admin, turnamen, 12 tim, match, klasemen
│   └── deploy-rules-indexes.mjs
├── documentation/           # 8 dokumen setup + 17 guide operator (Bahasa Indonesia)
├── .env.example
├── package.json             # Aplikasi Next.js ada di ROOT repo → siap deploy Vercel
└── vercel.json
```

> **Catatan deploy:** aplikasi web sengaja diletakkan di **root repo** agar Vercel langsung
deteksi Next.js tanpa konfigurasi "Services". `broadcast-bridge` dan `observer-ai` adalah
service **lokal laptop produksi** — tidak dideploy ke Vercel (butuh akses OBS & layar).

## 🚀 Quick Start

```bash
# 1. Website (root repo)
cp .env.example .env                  # isi konfigurasi Firebase project kamu
npm install
npm run dev                           # http://localhost:3000

# 2. Firebase: rules + klasemen awal (butuh file service account)
#    Simpan service account JSON di ./secrets/serviceAccountKey.json
npm run seed                          # buat super admin + data turnamen BOF
npm run deploy:rules                  # deploy security rules + composite indexes

# 3. Layanan lokal (opsional, di laptop produksi)
cd broadcast-bridge && npm install && npm run dev   # OBS bridge
cd observer-ai && python -m venv .venv && source .venv/bin/activate
cp requirements.example.txt requirements.txt         # lalu:
pip install -r requirements.txt && python run.py    # AI Observer
```

## ▲ Deploy ke Vercel (gratis)

Aplikasi web ada di root repo → Vercel otomatis mendeteksi **Next.js**, tanpa vercel.json
khusus "Services". Langkah:

1. Push repo ini ke GitHub, lalu di [vercel.com](https://vercel.com) pilih **Add New → Project** dan import repo.
2. Framework preset otomatis: **Next.js**. Root directory biarkan `./` (jangan diubah).
3. Tambahkan Environment Variables (Production + Preview) — daftar lengkap lihat `.env.example`:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID` *(wajib — sering terlewat!)*
   - `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` *(opsional)*
4. Klik **Deploy**. Detail lengkap: [`documentation/DEPLOY_VERCEL.md`](documentation/DEPLOY_VERCEL.md).

> `BRIDGE_PASSWORD_HINT` dan service lokal **tidak perlu** diisi di Vercel —
> itu hanya untuk laptop produksi (broadcast-bridge).

## 🔑 Sistem Poin Resmi BOF

| Placement | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th | 8th | 9th | 10th | 11th | 12th |
|-----------|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|------|------|
| Poin      | 20  | 17  | 15  | 13  | 12  | 10  | 6   | 4   | 3   | 2    | 1    | 0    |

**Kill = 2 poin.** Total match = placement + kill. Tiebreaker: (1) total poin, (2) placement points, (3) placement game terakhir sesuai format (BO7 → game 7). Sisanya review manual panitia.

## 🔒 Keamanan

- Firestore Security Rules: publik hanya **baca** data yang dipublikasikan; tulis hanya akun dengan peran di `adminRoles`.
- Super admin pertama dibuat via script seeding — tidak ada pendaftaran admin publik.
- Kredensial (service account, token bridge, stream key) **tidak pernah** masuk kode publik.
- OBS WebSocket & AI Observer hanya berjalan di `127.0.0.1` laptop produksi.

## 📚 Dokumentasi

Semua panduan Bahasa Indonesia ada di [`documentation/`](documentation/README.md):
`FIREBASE_SETUP` · `OBS_SETUP` · `MIRRORING_SETUP` (scrcpy) · `LOCAL_STREAMING` (MediaMTX) · `YOUTUBE_SETUP` · `AI_OBSERVER_SETUP` · `TROUBLESHOOTING` + **17 guide operator**.

## 🎨 Desain

- **Website**: Neobrutalism premium — Electric Blue `#182CFF`, Purple `#8150F5`, Cyan `#66F0E6`, Yellow `#FFE600`, hitam tebal + hard shadow, font Space Grotesk & Inter.
- **Broadcast**: identitas sendiri — hitam, emas metalik, ungu elektrik, elemen angular.

## ⚠️ Catatan Jujur

- Statistik publik hanya dari hasil resmi yang dipublikasikan panitia.
- Event AI adalah **indikasi berbobot confidence** — tidak pernah mengubah skor resmi.
- Streaming lokal MediaMTX hanya bisa diakses dari jaringan sekolah (LAN).
- Tanpa Cloud Functions, tanpa billing, tanpa API berbayar — sesuai prinsip free-first.
