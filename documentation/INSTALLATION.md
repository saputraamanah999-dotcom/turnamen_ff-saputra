# INSTALLATION — Instalasi & Menjalankan STIKAR ESPORTS

Panduan lengkap instalasi platform STIKAR ESPORTS (BATTLE OFF FRIENDS) dari nol.

## 1. Prasyarat

- **Node.js 20.9+** — unduh di <https://nodejs.org> (pilih LTS). Cek: `node -v`.
- **npm** (ikut Node.js). Cek: `npm -v`.
- Akun Firebase gratis (Spark Plan) — cukup untuk seluruh platform.
- Git untuk clone repositori.

## 2. Ambil kode proyek

```bash
git clone https://github.com/saputraamanah999-dotcom/turnamen_ff-saputra.git
cd turnamen_ff-saputra
```

## 3. Instalasi dependency

```bash
npm install
```

## 4. Konfigurasi environment

Salin contoh lalu isi dari Firebase Console (Project Settings → General → Your apps → Web app):

```bash
cp .env.example .env
```

Isi 6 variabel `NEXT_PUBLIC_FIREBASE_*` (semuanya **publik**, aman untuk frontend):

| Variabel | Sumber |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Console → Project Settings → Web API Key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `<project-id>.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `<project-id>` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `<project-id>.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Project Settings → Sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Project Settings → App ID |

> Jangan pernah menaruh service account / secret server di `.env` frontend. Service account hanya untuk setup lokal (`npm run seed`) dan disimpan di `secrets/serviceAccountKey.json` (di-gitignore).

## 5. Jalankan mode development

```bash
npm run dev
# buka http://localhost:3000
```

## 6. Setup database Firebase (satu-klik)

Pilih salah satu:

- **Halaman setup tanpa terminal (disarankan):** buka `public/setup.html` di browser, tempel JSON service account, isi project ID + email/password super admin, lalu tekan **BUAT SEMUA**. Halaman ini membuat akun admin, `adminRoles`, data seed turnamen, security rules, dan composite index.
- **Terminal:**

```bash
npm run seed          # seed Firestore + super admin
npm run deploy:rules  # pasang security rules + composite index
```

## 7. Build produksi & deploy

```bash
npm run build         # verifikasi build lokal
```

Deploy ke Vercel: import repositori di Vercel (framework otomatis Next.js), isi 6 env `NEXT_PUBLIC_FIREBASE_*` di Project Settings → Environment Variables, lalu Deploy. Detail: `documentation/DEPLOY_VERCEL.md`.

## 8. Layanan opsional di laptop produksi

| Layanan | Perintah | Port |
| --- | --- | --- |
| Broadcast Bridge (OBS) | `npm run bridge` | 8078 (WS) |
| AI Observer | `cd observer-ai && pip install -r requirements.example.txt && python run.py` | 8077 (HTTP/WS) |
| MediaMTX (LAN streaming) | unduh binary MediaMTX, jalankan dengan config default | 1935 RTMP / 8888 HLS / 8889 WebRTC |

Layanan ini **opsional dan terisolasi**: website tetap berfungsi penuh tanpa ketiganya; panel admin menampilkan status "offline" secara jujur.

## 9. Login admin pertama

1. Buka `/admin`.
2. Masuk dengan email + password super admin yang dibuat di langkah 6.
3. Sistem memverifikasi peran dari koleksi `adminRoles` — akun tanpa peran ditolak.

---

Developed by SAPUTRA DEVELOPER — SMK TI BALI GLOBAL KARANGASEM.
