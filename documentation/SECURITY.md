# SECURITY — Model Keamanan STIKAR ESPORTS

Ringkasan model keamanan platform dan praktik yang wajib diikuti operator.

## 1. Autentikasi & Role-Based Access

- Login memakai **Firebase Authentication** (Email/Password) — tidak ada login palsu.
- Peran disimpan di koleksi `adminRoles/{uid}` dengan field `role` (`superadmin` | `admin` | `operator`).
- **Tidak pernah** memberikan hak admin dari input username/URL: setiap sesi diverifikasi ke dokumen `adminRoles` sebelum sidebar & halaman admin dirender.
- Bootstrap super admin pertama hanya lewat prosedur aman (`npm run seed` atau halaman `setup.html` dengan service account).

## 2. Firestore Security Rules

Aturan resmi (terpasang via `npm run deploy:rules` atau `setup.html`, sumber di `firebase/firestore.rules`):

- Publik hanya boleh **membaca** data yang memang untuk publik (`tournaments`, `teams`, `matches`, `publicLeaderboards`, `scoringConfigurations`, `broadcastSettings`, `announcements`, `awards`).
- Semua **penulisan** data turnamen wajib admin (`adminRoles/{request.auth.uid}` ada).
- Pengguna **tidak bisa menaikkan perannya sendiri** — penulisan `adminRoles` dibatasi superadmin.
- `auditLogs`: boleh dibuat (create) oleh admin, **tidak boleh diubah/dihapus** dari klien.
- Field penting divalidasi; data rehearsal terpisah dari data resmi.

## 3. Secret & Environment

- Frontend hanya memuat `NEXT_PUBLIC_FIREBASE_*` yang memang publik (API key web Firebase bukan rahasia; keamanan ditegakkan rules).
- Service account (`secrets/serviceAccountKey.json`) **tidak pernah** di-commit, di-gitignore, dan hanya dipakai di terminal/halaman setup.
- Stream key & password OBS WebSocket **tidak pernah** dikirim ke frontend publik dan tidak ditampilkan di penonton.

## 4. Jaringan Lokal

- Broadcast Bridge (8078) & AI Observer (8077) hanya mengikat localhost/LAN dan **wajib token** untuk command.
- Yang dibagikan ke penonton hanya alamat halaman live (`http://IP:8888/...` via MediaMTX).
- Jangan buat port-forward admin/OBS/bridge ke internet; panduan firewall ada di `LOCAL_STREAMING.md`.

## 5. Audit Log

Semua aksi penting tercatat di koleksi `auditLogs`: login/logout, CRUD tim-pemain-match, perubahan skor, publish/recompute, aksi AI (confirm/reject), emergency on/off, koreksi map, perubahan roster. Field: actor, action, target, timestamp, details.

## 6. Kejujuran Data

- Skor resmi hanya dihitung dari hasil yang di-publish admin.
- Event AI = indikasi ber-confidence; tidak pernah mengubah klasemen.
- Jika OCR gagal → status UNKNOWN, tidak menebak.
- Jika Firestore offline → halaman menampilkan banner MODE DEMO/OFFLINE, tidak berpura-pura tersimpan.
