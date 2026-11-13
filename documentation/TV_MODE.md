# MODE TV — Autoplay, Layar Tetap Nyala & Musik (Zero Drama)

Panduan singkat menyalakan siaran di TV sekolah tanpa pusing.
Halaman untuk TV: **`/display`** (Panggung TV) atau **`/live`**.

> Link cepat TV: `https://turnamen-ff-saputra.vercel.app/display?fs=1`
> `?fs=1` = otomatis layar penuh saat halaman dibuka.

---

## 1. VIDEO LANGSUNG OTOMATIS (AUTOPLAY)

Yang dilakukan website otomatis (tanpa ketukan):

1. Embed YouTube dibuka dengan `autoplay=1&mute=1` — cara yang DIIZINKAN semua browser.
2. Setelah iframe siap, website mengirim perintah `playVideo` berulang
   (0,8 / 2 / 4 / 7 / 11 / 16 / 22 detik) — banyak browser TV baru mulai memutar
   setelah embed hangat.
3. Saat tab kembali terlihat / jendela fokus → perintah putar dikirim lagi.
4. Jika setelah ±6 detik masih tidak memutar → muncul **tombol PUTAR besar**
   di tengah layar. Tekuk sekali (remote/sentuh) → video langsung jalan **BERSUARA**.
5. Trik suara TV: ketukan pertama pada video (yang masuk ke iframe) terdeteksi
   website lewat event `blur` → suara video dinyalakan otomatis satu kali.

### Kalau TV benar-benar memblokir semuanya (TV sangat tua)

- Tekuk tombol PUTAR besar di layar **satu kali saja** — untuk selanjutnya
  halaman akan mengingat interaksi itu (suara & musik ikut terbuka).
- Atau pasang **mouse/kemanis USB** ke TV: satu klik selesai.

## 2. LAYAR TV TIDAK MATI SENDIRI (KEEP AWAKE)

Masalah lama: layar TV mati sendiri padahal siaran berjalan. Sekarang ditangani 3 lapis:

| Lapis | Cara | Berlaku di |
| --- | --- | --- |
| 1 | **Screen Wake Lock API** (resmi) | Chrome/Edge/Android TV modern |
| 2 | **Fallback NoSleep**: video 1px senyap dari Canvas | browser TV lama (Tizen/webOS/Android lawas) |
| 3 | **Re-acquire otomatis** saat tab kembali terlihat + gestur pertama | semua |

- Status tampil di bar bawah pemutar: chip hijau **"LAYAR NYALA"** = layar aman.
- Chip kuning **"NYALAKAN LAYAR"** = browser minta ketukan → tekuk sekali.
- Berlaku di `/display`, `/live`, dan halaman interaktif.

Catatan: pengaturan **sleep timer TV itu sendiri** (menu TV fisik) tetap sebaiknya
dimatikan: *Settings → General → System Manager → Time → Auto Protection/Sleep Timer → Off*.

## 3. MUSIK LATAR OTOMATIS

- Musik mengikuti panel **Musik Siaran** di `/admin/broadcast` — realtime, tanpa refresh.
- Otomatis diputar (tanpa ketuk) dengan strategi yang sama: bersuara bila diizinkan,
  kalau ditolak diputar senyap lalu **suara menyala otomatis** pada ketukan pertama,
  tekanan tombol remote, atau saat penonton menekuk video.
- Dicoba ulang otomatis tiap 15 detik sampai berhasil.
- Mendukung **link audio apa pun** (MP3/M4A/OGG/WAV/OPUS, termasuk Google Drive &
  Dropbox) **dan** YouTube / YT Music.

## 4. CHECKLIST CEPAT PANITIA (SEBELUM MATCH)

1. Buka `https://turnamen-ff-saputra.vercel.app/display?fs=1` di browser TV.
2. Lihat chip **LAYAR NYALA** (hijau). Kalau kuning → tekan sekali.
3. Kalau video belum jalan → tekan tombol PUTAR besar satu kali.
4. Set volume TV sekali; sisanya dikendalikan dari `/admin/broadcast`.
5. HP penonton cukup scan QR dari panel admin — semua fitur sama.

---

Dibuat oleh SAPUTRA DEVELOPER — Battle Off Friends · STIKAR ESPORTS.
