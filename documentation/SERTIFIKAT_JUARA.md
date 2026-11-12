# SERTIFIKAT JUARA & UPDATE SIARAN — Panduan Panitia

Update ini menambahkan **fitur sertifikat otomatis**, **musik autoplay**, **pindah match otomatis**,
**overlay BOOYAH!**, perbaikan **indikator penonton**, dan **logo sekolah di header siaran**.
Semua di-commit ke repo dan aktif otomatis setelah deploy Vercel (push ke `main`).

---

## 1. SERTIFIKAT JUARA OTOMATIS (fitur publik — di /leaderboard)

**Di mana:** halaman publik **`/leaderboard`** (dan `/leaderboard/{tournamentId}`) — bagian
**"Sertifikat Juara 1 · 2 · 3"** muncul di **bawah tengah**, tepat di bawah klasemen/area juara.
Bukan di admin panel, bukan di /live.

**Kapan muncul:** hanya saat **SEMUA match selesai** — yaitu juara resmi terkonfirmasi
(`computeChampion` → semua match dipublikasikan, tidak seri) **atau** status turnamen di
Admin → Tournaments diubah menjadi **Completed**. Sebelum itu, bagian ini sengaja disembunyikan.

**Cara pakai:**
1. Setelah match terakhir dipublikasikan, buka `/leaderboard`.
2. Klik kartu **Juara 1 / 2 / 3** → muncul **preview sertifikat**.
3. Tekan **"Unduh Sertifikat (PNG)"** → file `Sertifikat-Juara1-<NAMA-TIM>-BOF.png`
   (2000×1414, rasio A4 landscape, siap cetak).

**Isi sertifikat (otomatis dari data resmi):**
- Logo **SMK TI Bali Global Karangasem** (aset transparan panitia, `public/logos/`)
- Penyelenggara: **SMK TI BALI GLOBAL KARANGASEM × OSIS**
- Nama tim juara + poin & kill resmi dari klasemen
- Badge **JUARA 1/2/3** (emas/perak/perunggu), nomor seri otomatis (`BOF-2026-J1-XXXXXX`)
- **Tanda tangan digital "S"** (kurva tinta emas) atas nama **I KOMANG EDI SAPUTRA —
  Ketua Panitia · STIKAR ESPORTS**, plus ruang tanda tangan manual panitia di kiri bawah.

**File:**
| File | Fungsi |
| --- | --- |
| `src/lib/certificate.ts` | Generator sertifikat (canvas 2000×1414, tanda tangan bezier, serial, unduh PNG) |
| `src/components/leaderboard/certificate.tsx` | Bagian publik "Sertifikat Juara" + preview + tombol unduh |
| `src/app/(public)/leaderboard/page.tsx` | Tempel sertifikat di bawah-tengah (halaman indeks) |
| `src/app/(public)/leaderboard/[tournamentId]/page.tsx` | Idem untuk turnamen tertentu |
| `public/logos/smk-ti-bali-global.png` | Logo sekolah transparan |
| `public/logos/smk-ti-bali-global-kartu.jpg` | Logo sekolah latar putih (cadangan untuk kartu) |

Tidak butuh Firebase baru dan tidak menyimpan apa pun — sertifikat dirender di browser
pembuka, dari data klasemen resmi yang sudah publik.

---

## 2. MUSIK SIARAN — AUTOPLAY TANPA HARUS MENGETUK CHIP

**Perilaku baru (semua mengikuti `broadcastSettings/{tid}.music` realtime, tanpa refresh):**
1. Begitu panitia mengaktifkan lagu, halaman penonton **langsung mencoba memutar bersuara**.
2. Kalau browser menolak (kebijakan autoplay), musik **tetap diputar senyap**, lalu
   **suara menyala otomatis pada sentuhan/ketukan PERTAMA DI MANA PUN** di halaman —
   tidak perlu mencari/menekan chip musik.
3. Setiap kali tab kembali terlihat (pindah aplikasi lalu kembali), percobaan diulang.
   Chip status di kiri bawah video hanya memberi tahu kondisi.

**Link yang diterima (kartu "Musik Latar Siaran" di /admin/broadcast):**
- **Link audio apa pun** yang memutar suara langsung: `.mp3 .m4a .aac .ogg .opus .wav .webm .flac`
  dari hosting "audio to URL", server sekolah, dsb.
- **Google Drive** (`drive.google.com/file/d/…`) dan **Dropbox** — otomatis dikonversi ke link langsung.
- **YouTube / YT Music** (termasuk `music.youtube.com`) — tetap didukung.

**File:** `src/components/broadcast/music-player.tsx` (player + `normalizeAudioUrl` +
`parseTrackInput`), `src/components/admin/broadcast-extras.tsx` (panel Musik Siaran).

---

## 3. PINDAH MATCH OTOMATIS (MATCH 1 → 2 → … realtime)

**Di mana:** `/admin/broadcast` → kartu **"Panggung TV & Countdown"** → blok
**"Mulai Game (Delay Diatur)"** → centang **"Otomatis pindah ke match berikutnya saat delay berakhir"**.

**Cara kerja:**
- Label sekuens terisi otomatis dari match berikutnya (mis. `MATCH 2 · KALAHARI`) — diambil dari
  **Admin → Match**; panitia masih boleh mengubah manual.
- Panitia menekan **Mulai Sekarang** (delay bebas, 5–600 detik). Saat delay HABIS:
  match berikutnya otomatis dijadikan **match berjalan** (`setCurrentMatch`) → header TV,
  chip "ROUND 02 · KALAHARI", dan info Map di `/live` **berganti realtime** di semua perangkat.
- Match selesai/tidak ada lagi → toast pemberitahuan; toggle tersimpan (field
  `broadcastSettings.autoNextMatch`).

**File:** `src/app/admin/broadcast/page.tsx` (logika auto-next + UI toggle),
`src/lib/types.ts` (tipe `autoNextMatch`, `booyah`).

---

## 4. OVERLAY BOOYAH! (momen juara match)

**Di mana:** `/admin/broadcast` → kartu **Panggung Juara** → blok **BOOYAH!**.
Tulis nama tim (opsional) → **BOOYAH Sekarang**. Semua TV & /live langsung meledak:
teks emas raksasa "BOOYAH!", nama tim, confetti + fanfare SFX, otomatis menutup ±8 detik
(halaman yang baru dibuka di tengah siaran tidak ikut meledak — perintah basi diabaikan).

**File:** `src/components/broadcast/presentation.tsx` (`BooyahOverlay`),
`src/components/admin/broadcast-extras.tsx` (`PodiumPanel`).

---

## 5. INDIKATOR PENONTON — PERBAIKAN

- Jendela "online" diperluas **65 → 105 detik** dan heartbeat ditulis ulang **setiap tab
  kembali terlihat** → penonton tidak lagi "hilang" padahal masih membuka website
  (tab HP yang disematkan lama dibatasi browser ±1 tulisan/menit).
- Panel admin kini **menampilkan diagnosis**: bila database terhubung tapi angka tetap 0
  padahal /live pasti terbuka, berarti **rules Firestore belum ter-deploy**.

**PENTING — lakukan sekali di laptop panitia (akar kasus "masih 0"):**
```bash
# dari folder repo (butuh secrets/serviceAccountKey.json seperti saat deploy sebelumnya)
npm run deploy:rules
```
Koleksi `livePresence` (indikator penonton) ada di rules sejak fitur ini dibuat — bila
deploy rules terakhir dilakukan sebelum fitur itu, tulisan heartbeat penonton ditolak
Firestore sehingga hitungan selalu 0 di mana pun. Setelah `npm run deploy:rules`,
indikator langsung hidup tanpa deploy ulang website.

**File:** `src/services/broadcast/presence.ts`, `src/components/admin/broadcast-extras.tsx`
(`PresencePanel`), `firebase/firestore.rules` (koleksi `livePresence` — tidak berubah,
cukup dideploy).

---

## 6. LOGO SEKOLAH DI HEADER SIARAN

Kotak logo "Z" merah pada header siaran TV (/display) **diganti logo resmi
SMK TI Bali Global Karangasem** (medali lingkaran putih + cincin emas, tetap terbaca jelas di
latar gelap), dan logo yang sama kini tampil di header halaman `/live`. Teks sekolah ikut
ditampilkan di bawah "STIKAR ESPORTS".

**File:** `src/components/broadcast/brand-logo.tsx` (`SmkLogoBadge`, `BrandLockup`),
`src/components/broadcast/tv-display.tsx`, `src/components/broadcast/live-viewer.tsx`.
