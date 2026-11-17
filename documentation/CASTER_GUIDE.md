# BOF CASTER — Bagikan Layar via Kode Pairing (ala hi.casts.app)

Fitur ini meniru persis pengalaman smartboard hi.casts.app untuk website turnamen:
**TV menampilkan kode 6 digit + QR → panitia membuka website di laptop/HP → ketik
kode → pilih layar → layar tayang REAL-TIME di website**, berdampingan leaderboard,
musik, dan semua fitur siaran. Tanpa OBS, tanpa install aplikasi, tanpa kabel.

> Halaman caster: **`/caster`** · Halaman TV: **`/display`** · Penonton: **`/live`**

---

## 1. Alur Lengkap (3 Langkah, ala hi.casts.app)

### Langkah A — Panitia mulai sesi (Admin)
1. Buka **`/admin/broadcast`** → kartu **BOF Caster — Layar via Kode Pairing**.
2. (Opsional) isi label sumber, mis. `Laptop Operator`.
3. Klik **Mulai Sesi Caster** → kode 6 digit dibuat otomatis, mode siaran otomatis
   pindah ke `BOF Caster`, dan kartu menampilkan kode + QR + link yang bisa disalin.

### Langkah B — TV/smartboard menampilkan kode
4. Buka **`/display?fs=1`** di browser TV (atau biarkan TV yang sudah terbuka —
   halaman mengikuti mode siaran secara realtime, tanpa refresh).
5. Karena mode sekarang **BOF Caster**, area video otomatis menampilkan **kartu
   pairing**: kode raksasa `528 346` + QR + 3 langkah. Leaderboard tetap tampil
   di sisi kanan seperti biasa.

### Langkah C — Laptop/HP panitia membagikan layar
6. Scan QR di TV (atau buka `https://turnamen-ff-saputra.vercel.app/caster`).
7. Masukkan kode dari TV → **Sambungkan**.
8. Klik **Bagikan Layar Sekarang** → pilih layar/jendela game (boleh centang
   *share audio*) → selesai! Layar langsung tayang di TV dan semua halaman `/live`
   penonton, **real-time**, berdampingan leaderboard.
9. Selesai? Klik **Hentikan Berbagi** di `/caster`, atau **Matikan Sesi** di admin.

## 2. Yang Terjadi di Balik Layar (arsitektur)

| Bagian | File | Peran |
| --- | --- | --- |
| Mesin signaling | `src/services/broadcast/p2p.ts` | `P2PHost`/`P2PViewer` — kini menerima `basePath` agar bisa dipakai di pohon mana pun |
| Sesi caster | `src/services/broadcast/caster.ts` | kode pairing, mulai/mati/ganti kode, host caster (base `casterSessions/{kode}`) |
| Kartu pairing TV | `src/components/broadcast/caster-card.tsx` | kode raksasa + QR + 3 langkah (persis gaya hi.casts.app) |
| Player | `src/components/video/player.tsx` | mode `caster`: video WebRTC + kartu pairing sampai tersambung |
| Halaman caster | `src/app/(public)/caster/page.tsx` | input kode → `getDisplayMedia` → tayang + statistik bitrate/fps/penonton |
| Panel admin | `src/components/admin/broadcast-extras.tsx` (`CasterPanel`) | mulai/mati/ganti kode, QR, link, sisa waktu |
| Rules | `firebase/firestore.rules` (`casterSessions`) | kode = kunci (bagian dari path), sesi aktif wajib, SDP/candidate dibatasi |
| Test | `scripts/test-caster.ts` (`npm run test:caster`) | 18 kasus fungsi murni |

Signaling Firestore (video TIDAK pernah lewat Firestore):
```
casterSessions/{KODE}/viewers/{viewerId}             ← offer (penonton) / answer (caster)
casterSessions/{KODE}/viewers/{viewerId}/candidates  ← ICE candidates
```

### Keamanan
- **Kode rahasia 6 digit = kunci.** Dokumen signaling berada DI DALAM path kode —
  pihak yang tidak tahu kode tidak bisa membaca/menulis apa pun (pola sama dengan
  hi.casts.app: "Device ID").
- Sesi **hanya bisa dibuat/dimatikan admin** (rules `isAdmin()`), kedaluwarsa
  otomatis **8 jam**, dan bisa dipadamkan/ganti kapan pun dari admin.
- List/enumerasi semua sesi hanya untuk admin; publik hanya `get` per kode.
- SDP dibatasi 12.000 karakter, candidate 2.000 (anti-spam), seperti rules P2P.

## 3. Kapasitas & Batasan (jujur)

- Aliran dikirim **langsung laptop caster → perangkat penonton** (WebRTC P2P).
  Satu aliran per penonton; kapasitas mengikuti **Batas penonton P2P (1–4)**.
- Cocok untuk: TV sekolah + beberapa HP panitia/penonton di LAN yang sama.
- Untuk **ratusan/ribuan penonton**: gunakan mode **YouTube Live** (caster tetap
  bisa dipakai sebagai sumber lokal).
- Kualitas terbaik: laptop caster **kabel LAN/Wi-Fi 5 GHz**, bagikan jendela game
  (bukan seluruh desktop), 30 fps sudah sangat mulus untuk turnamen FF.

## 4. Deploy Rules (WAJIB sekali saja setelah update ini)

```bash
npm run deploy:rules
```
Tanpa ini, `/caster` akan mendapat `permission-denied` saat menyambungkan penonton.

### Tidak punya service account? Tempel manual di Firebase Console (paling mudah)

1. Buka `firebase/firestore.rules` di repo (atau salinan di halaman `/setup.html`), **salin seluruh isinya**.
2. Buka **console.firebase.google.com** → project **turnamenffbof** → **Firestore Database** → menu **Rules**.
3. Hapus semua isi lama → **tempel** rules baru → klik **Publish**.
4. Muat ulang halaman admin. Selesai — semua fitur baru (livePresence, p2pSessions, casterSessions) langsung dikenali server.

> Gejala rules belum ter-deploy: kartu BOF Caster menulis
> **"Gagal memulai: Missing or insufficient permissions"**, kartu Penonton Online
> menulis **"database tidak terjangkau"**, dan halaman `/caster` menolak kode dengan
> pesan panjang berisi instruksi yang sama. Aplikasi kini otomatis menampilkan
> instruksi perbaikan ini setiap kali server menolak.

## 5. Pertanyaan Cepat

**Bedanya dengan mode P2P?** Sama-sama WebRTC, tapi P2P butuh login admin di Live
Control; **Caster cukup kode 6 digit** — bisa dari HP/laptop siapa pun yang diberi
kode oleh panitia, tampil di website lengkap dengan leaderboard.

**Penonton perlu ketik kode?** Tidak. TV & `/live` otomatis membaca sesi aktif dari
`broadcastSettings` dan langsung menampilkan layaran begitu caster tersambung.

**Kode salah tersebar?** Klik **Ganti Kode** di admin — kode lama mati seketika.
