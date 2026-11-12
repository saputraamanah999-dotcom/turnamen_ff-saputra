# PANGGUNG TV & COUNTDOWN — Panduan Panitia

Kendali **presentasi realtime** untuk TV (`/display`) dan halaman penonton (`/live`).
Semuanya ada di satu tempat: **Admin → `/admin/broadcast` → kartu "Panggung TV & Countdown"**.
Tidak perlu menekan "Simpan Pengaturan" — setiap tombol langsung terkirim.

---

## 1. Countdown Besar (menjelang siaran/turnamen dimulai)

1. Isi **Label** (mis. `MENUJU SIARAN DIMULAI`), **Menit** dan **Detik**.
2. Klik **Mulai Countdown**.
3. TV dan halaman /live langsung menampilkan angka raksasa yang berjalan mundur,
   dengan kilau panggung. Saat waktu habis: flash **MULAI!** lalu hilang sendiri.
4. Klik **Stop** kapan pun untuk menghentikan.

Angka dihitung dari jam laptop panitia saat tombol ditekan — TV/HP menyesuaikan
waktu yang sama (bukan durasi diulang di tiap perangkat), jadi semua perangkat
menampilkan sisa waktu yang konsisten.

## 2. Mulai Game dengan Delay (sinkronisasi HP player)

1. Isi **Label match** (mis. `MATCH 3 · BERLIN`) dan **Delay (detik)** — 5–600.
2. Klik **Mulai Sekarang**.
3. TV & /live menampilkan 3 fase otomatis:
   - **Hitung mundur panjang** dengan progress bar (sisa delay),
   - **10…9…1** angka raksasa emas,
   - **GAME START** burst api.
4. **Batalkan** bila jadwal mundur.

Gunakan ini agar semua player menekan tombol "Masuk" di HP secara bersamaan.

## 3. Kirim Pengumuman Realtime

1. Tulis pengumuman di kolom **Kirim Pengumuman Realtime** → tekan **Kirim** (atau Enter).
2. Pengumuman langsung muncul:
   - **TV** (`/display`): di ticker info bar bawah,
   - **/live** (penonton): banner pengumuman beranimasi,
   - Daftar maksimal **5 pengumuman terakhir**; yang terbaru selalu paling atas.
3. **Bersihkan** menghapus semua pengumuman aktif.

## 4. Toggle Panggung

| Opsi | Efek |
| --- | --- |
| Sembunyikan judul & nama channel YouTube | Strip branding BATTLE OFF FRIENDS menutup judul/nama channel di atas video embed (YouTube sudah menghentikan parameter `modestbranding`). Matikan bila ingin tampilan YouTube asli. |
| Animasi & efek panggung | Kilau/glow, angka pop tiap detik, burst GAME START. Matikan untuk tampilan tenang (atau bila TV lemah). |

`prefers-reduced-motion` (TV/HP mode aksesibilitas) otomatis mematikan animasi.

## 5. Scene Presentasi Lengkap (13 section)

Untuk urutan presentasi resmi (Opening → Turnamen → Tim → … → Closing), tetap
gunakan **`/admin/presentation`** — scene-nya mengikuti TV secara realtime.
Scene **"Countdown"** di halaman itu kini otomatis menampilkan countdown nyata
bila countdown sedang berjalan dari kartu Panggung TV & Countdown.

## Catatan Teknis

- Data tersimpan di `broadcastSettings/{tournamentId}` pada field baru:
  `countdown` (`active`, `endsAt`, `label`), `startSequence` (`active`, `triggerAt`,
  `delaySeconds`, `matchLabel`), `presentation` (`cleanYouTube`, `effects`).
- Overlay dirender di dalam pemutar video (`LiveVideoPlayer`) sehingga otomatis
  muncul di `/live`, `/display` (TV), dan halaman interaktif — semua sumber video
  (YouTube / MediaMTX / P2P) mendapat perilaku yang sama.
- Tidak ada field pertandingan yang diubah — murni lapisan tampilan.

Panduan terkait: [YOUTUBE_SETUP.md](YOUTUBE_SETUP.md) · [P2P_MODE.md](P2P_MODE.md) · [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

## Pengaya Panggung (batch 2)

Semua fitur di bawah kendalinya dari **Admin → Broadcast → "Pengaya Siaran"** dan berlaku realtime
di TV (/display), halaman /live, dan halaman interaktif:

| Fitur | Cara pakai | Detail teknis |
| --- | --- | --- |
| **Musik Latar (loop)** | Kartu *Musik Latar Siaran*: tempel link MP3 atau YouTube/YT Music → Tambah → toggle Aktif, pilih lagu "Pakai", atur volume slider | Data `broadcastSettings.music`; MP3 pakai `<audio loop>`, YT pakai iframe embed `loop=1&playlist=ID` (komponen `components/broadcast/music-player.tsx`). Suara penonton keluar setelah interaksi pertama di halaman (kebijakan autoplay browser). |
| **Sound Effect Esport** | Kartu *Sound Effect*: BOOYAH!, Game Start, Airhorn, Tepuk Tangan, Match Selesai, Beep, Pop, Swoosh — satu klik, semua penonton bunyi | Data `broadcastSettings.sfx {type, at}`; perintah > 25 dtk diabaikan. Asset `public/sfx/*.mp3` (sintesis `scripts/make_sfx.py`). **Otomatis**: beep tiap detik di 10 detik terakhir countdown/sekuens + nada GO di GAME START (respects toggle efek). |
| **Panggung Juara** | Kartu *Panggung Juara*: toggle Tampilkan → layar penuh podium Top 3 (emas/perak/perunggu, mahkota melayang, shimmer, confetti) berdasar klasemen realtime + status juara resmi (jujur: hanya "Juara Resmi" bila semua match dipublikasikan & tidak seri) | Data `broadcastSettings.presentation.podium`; komponen `components/leaderboard/champion-podium.tsx`. |
| **Penonton Online** | Indikator otomatis: header /live, bar player, TV header, dan kartu admin *Penonton Online* (jumlah + nama) | Koleksi `livePresence/{tid}/viewers/{viewerId}`; heartbeat 20 dtk, offline > 65 dtk, singleton per tab (`services/broadcast/presence.ts`). Admin tidak ikut terhitung. |
