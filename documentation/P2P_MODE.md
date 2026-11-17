# Mode Siaran P2P (tanpa bridge) — Battle Off Friends

> Mode **P2P** memancarkan gameplay **LANGSUNG dari laptop panitia ke penonton** lewat WebRTC
> peer-to-peer. **Tanpa broadcast-bridge, tanpa MediaMTX, tanpa OBS, tanpa install apa pun.**
> Firestore hanya dipakai untuk *signaling* (tukar SDP/ICE) — video TIDAK PERNAH lewat Firestore.

---

## 1. Kapan memakai mode P2P?

| Situasi | Rekomendasi |
| --- | --- |
| Ingin live **secepat mungkin** tanpa install/start-bridge.bat | **P2P** |
| Penonton banyak (>4) / butuh relay ke internet luas | MediaMTX / YouTube |
| TV/browser sangat tua (tanpa WebRTC) | MediaMTX (HLS) / YouTube |

**Batas utama P2P**: laptop mengirim **satu aliran per penonton**, default **maks 2 penonton
bersamaan** (bisa diatur 1–4). Keempat penonton berarti ±14 Mbps upload dari laptop — pastikan
koneksinya kuat (kabel LAN disarankan).

## 2. Cara pakai (langkah demi langkah)

1. **Broadcast settings** — buka `Admin → Broadcast`, pada kartu *Sumber Video Publik* pilih
   **Mode Stream: `P2P (tanpa bridge, maks 2 penonton)`**, atur *Batas penonton P2P* (1–4),
   klik **Simpan Pengaturan**. Field URL HLS/WHE/WHIP disembunyikan (memang tidak dipakai).
2. **Live Control** — buka `Admin → Live Control` **di laptop yang akan memancarkan game**
   (Chrome/Edge terbaru). Kartu *Preflight* otomatis menampilkan *Signaling Firestore (P2P)* —
   WHIP/MediaMTX tidak wajib di mode ini.
3. **Pilih sumber** — klik *Capture Jendela Game* atau *Capture Layar Penuh*. Untuk mode P2P
   capture otomatis diminta **1280x720 @ 30 fps** (menghemat upload venue).
4. **PREPARE → START LIVE**. Saat START LIVE:
   - `broadcastSettings.p2pLive = true` (penonton mulai boleh konek),
   - laptop mulai mendengarkan sesi penonton di `p2pSessions/{turnamen}/viewers`,
   - kartu **Penonton P2P (maks N)** menampilkan slot *terhubung / tersambung / ditolak* realtime.
5. **Penonton** — buka halaman `/live` (HP/TV/laptop, internet biasa untuk signaling, video lewat
   Wi-Fi lokal). Halaman menampilkan petunjuk *"Pastikan perangkat satu Wi-Fi dengan laptop panitia"*.
   Video mulai **muted** — ada tombol **Aktifkan Suara** setelah tersambung.
6. **STOP LIVE** saat selesai → `p2pLive = false`, semua sesi signaling dihapus, penonton kembali
   ke *Starting Soon*. **Selalu STOP sebelum menutup tab** (menutup tab langsung meninggalkan
   sesi answered yang dihapus otomatis >2 menit kemudian oleh cleanup).

PAUSE / RESUME / RECONNECT / STOP tetap berfungsi seperti mode lain (PAUSE membekukan frame di
semua penonton; RECONNECT menyalakan ulang signaling).

## 3. Bagaimana signaling bekerja (arsitektur)

```
Laptop operator (Chrome)                         Penonton (HP/TV, /live)
  capture 720p30 ── RTCPeerConnection ──────► RTCPeerConnection ──► <video>
        │            offer/answer via Firestore (viewer-initiated)
        └─ P2PHost mendengarkan p2pSessions/{tid}/viewers (state=waiting)
             ├─ slot tersedia → jawab (answer + state=answered) + tukar ICE
             ├─ slot penuh   → state=rejected + reason "Slot penonton P2P penuh"
             └─ cleanup tiap 60 dtk: hapus sesi waiting/closed > 2 menit
```

- **Struktur dokumen**: `p2pSessions/{tid}/viewers/{viewerId}` (offer/answer/state/expiresAt)
  dan subkoleksi `candidates/{autoId}` (`from: "viewer"|"host"`).
- **Viewer-initiated**: penonton membuat offer lebih dulu → admin tinggal menjawab; NAT di
  laptop maupun penonton dibuka dari sisi "menelepon".
- **Pemulihan penonton**: koneksi `failed/disconnected` > 5 detik → sesi baru dengan backoff
  **2 → 4 → 8 → 15 detik**. Sesi ditolak (slot penuh) **tidak** diulang otomatis — tombol
  *Coba Lagi* dipakai manual agar tidak spam.
- **Kualitas**: `maxBitrate` **3.500.000 bps** per penonton, `maxFramerate` **30**,
  `degradationPreference: "maintain-framerate"`, `contentHint: "motion"`. Konstanta bisa diubah
  di `src/services/broadcast/stream.ts` (blok "Konstanta kualitas mode P2P").

## 4. Aturan Firestore & indeks

Rules baru ada di `firebase/firestore.rules` (blok `p2pSessions`) — **seketat mungkin**:

- Penonton anonim hanya boleh **create** dokumen viewer miliknya sendiri, dan hanya bila
  `broadcastSettings` turnamen itu sedang `streamMode == 'p2p'` **dan** `p2pLive == true`.
- Validasi create: field terbatas (`viewerId, createdAt, expiresAt, state, offer` — `hasOnly`),
  `state == "waiting"`, `viewerId == viewerId di path`, `createdAt == request.time`
  (serverTimestamp), `offer.sdp` string ≤ **12000** karakter. Field `answer`/`reason` **tidak
  bisa** ditulis penonton.
- `update`/`delete` viewer **hanya admin**; `list` koleksi viewers **hanya admin** (`get` publik
  karena penonton mendengarkan dokumennya sendiri).
- Candidate: create publik hanya `from == "viewer"` dan ≤ **2000** karakter; `from == "host"`
  hanya admin; sisanya admin.
- Tidak ada koleksi lain yang dilonggarkan; blok default `deny all` tetap ada.

**Indeks** (sudah ditambahkan di `firebase/firestore.indexes.json`): query
`viewers where state == 'waiting' orderBy createdAt` butuh composite index
`(state ASC, createdAt ASC)`. Tanpa indeks, aplikasi otomatis fallback ke snapshot tanpa query
(filter di klien) — tetap jalan, tapi tetap deploy indeksnya.

### Risiko & mitigasi keamanan

| Risiko | Mitigasi yang sudah dipasang |
| --- | --- |
| Spam dokumen signaling saat fitur mati | create hanya saat `p2pLive == true` (dicek via `get()` ke broadcastSettings) |
| Dokumen besar membebani kuota | SDP ≤ 12000, candidate ≤ 2000 karakter, divalidasi rules **dan** klien |
| Sesi yatim menumpuk | cleanup admin tiap 60 detik (>2 menit waiting/closed) + `expiresAt` untuk TTL |
| Abuse anonim menulis sembarangan | `hasOnly` + `state` + `createdAt == request.time` + viewerId path-check |
| Penonton luar negeri/proxy lewat TURN | TURN opsional (env) — kosong secara default |

**Firebase App Check sangat disarankan** (Console → App Check → register Web app dengan
reCAPTCHA v3) untuk menaikkan pagar terhadap klien non-browser. Dokumen ini tidak mengaktifkannya
karena butuh akses console.

## 5. Deploy rules + indexes + TTL

```bash
# Dari folder repo (butuh login Firebase CLI ATAU service account):
cd firebase
firebase deploy --only firestore:rules,firestore:indexes

# Alternatif tanpa CLI (sudah tersedia di repo, pakai service account):
node firebase/../scripts/deploy-rules-indexes.mjs   # FIREBASE_SERVICE_ACCOUNT_PATH=../secrets/serviceAccountKey.json
python3 scripts/deploy-firestore.py                 # alternatif Python
```

> **PENTING**: fitur P2P **tidak akan berfungsi di produksi sebelum rules baru aktif**. Penonton
> akan melihat pesan jujur *"Signaling ditolak server (permission-denied) — aturan Firestore P2P
> belum diaktifkan panitia"* sampai rules dideploy.

### TTL (opsional tapi disarankan)

`expiresAt` sudah diisi `+6 jam` tiap sesi. Untuk menghapus otomatis lewat kebijakan TTL:

1. Firebase Console → **Firestore → Data → TTL policies → Add policy**
2. Collection group: `viewers` · Field: `expiresAt` · Enable.
3. Firestore menghapus sesi kadaluarsa dalam ±24 jam — gratis, tanpa cron.

Atau via gcloud:

```bash
gcloud firestore fields ttl update expiresAt --collection-group=viewers --enable-ttl
```

## 6. TURN opsional (kalau venue bermasalah NAT)

Tiga penonton tersambung tapi video tidak jalan (host candidate tidak cocok — mDNS/NAT ketat)?
Pasang TURN (mis. coturn di VPS) lalu set **environment variables** di Vercel + `.env` lokal:

```
NEXT_PUBLIC_TURN_URL=turn:ip-vps:3478
NEXT_PUBLIC_TURN_USERNAME=bof
NEXT_PUBLIC_TURN_CREDENTIAL=****
```

Jangan pernah commit kredensial TURN ke repo. Tanpa env ini, hanya STUN Google yang dipakai —
cukup untuk LAN/satu subnet.

## 7. Troubleshooting

| Gejala | Sebab & solusi |
| --- | --- |
| Penonton: "permission-denied — aturan belum diaktifkan" | Rules baru belum dideploy → bagian 5 |
| Penonton: "Slot penonton P2P penuh" | Sudah maks penonton — tunggu slot bebas, atau naikkan `p2pMaxViewers` (1–4) |
| Penonton tersambung tapi video beku/hitam | Operator belum capture/START, atau laptop memilih jaringan berbeda — cek kartu Penonton P2P (terhubung/tidak) |
| Candidate mDNS `.local` gagal (TV lama) | Browser TV tidak mendukung mDNS — pakai TV/browser lebih baru, atau mode MediaMTX |
| Video putus-putus di HP | Wi-Fi 2.4 GHz padat — laptop pakai **kabel LAN**, turunkan penonton ke 1, atau kecilkan konstanta bitrate |
| Semua gagal, internet venue lemah | Signaling butuh internet — cek koneksi laptop ke Firestore |
| Sasi lama menumpuk di console | Normal — dibersihkan otomatis (>2 menit) atau aktifkan TTL (bagian 5) |
| Laptop ditutup tanpa STOP | Sesi answered ditinggalkan — dibersihkan otomatis; selalu STOP LIVE dulu |

## 8. Yang sudah & belum diuji

- **Sudah**: unit test logika murni (`npm run test:p2p` — 18 kasus: slot penuh, backoff,
  mapping status, ICE servers, validasi payload, deteksi sesi basi), lint/tsc/build, uji rules
  dengan emulator Firestore (bagian hasil di laporan deploy), halaman /live & /admin memuat
  tanpa error.
- **Belum bisa diuji dari sandbox**: video nyata laptop → HP/TV di Wi-Fi venue, perilaku
  mDNS/ICE di router sekolah, TURN. Laporkan hasil uji venue ke `documentation/TROUBLESHOOTING.md`.

## 9. Catatan teknis

- Mode lain (`youtube`, `mediamtx`, `offline`), pairing lokal, dan broadcast-bridge **tidak
  berubah perilaku**. P2P hanya menambah cabang baru di pemilih mode.
- Kode: `src/services/broadcast/p2p.ts` (`P2PHost`, `P2PViewer`, logika murni), integrasi UI di
  `src/app/admin/live-control/page.tsx`, `src/app/admin/broadcast/page.tsx`,
  `src/components/video/player.tsx`, `src/components/broadcast/live-viewer.tsx`.
- Test: `npm run test:p2p`.
