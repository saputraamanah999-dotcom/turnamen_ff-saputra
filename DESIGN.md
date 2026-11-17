# DESIGN.md — BATTLE OFF FRIENDS (BOF / STIKAR ESPORTS)

Arah visual resmi situs turnamen Free Fire SMK TI Bali Global Karangasem.
Ditulis dari brief pemilik (SAPUTRA DEVELOPER): "tampilan harus kece, esport
turnamen beneran, HD, mulus di TV, dan admin bisa ganti tema secara real-time."

Filter yang dipakai: **antislop** (mode: during, sesi eksplisit dari pemilik).
antislop adalah filter, bukan gaya; dokumen ini yang memberi arah.

## Identitas

- **Produk**: platform siaran & manajemen turnamen e-sport sekolah (Free Fire).
- **Audiens**: pemain & penonton usia SMA, guru, panitia; layar utama = TV/smartboard 1080p.
- **Suara visual**: grafis siaran olahraga elektronik profesional (pikiran: broadcast
  turnamen FPS resmi): permukaan gelap, tipografi display sempit seperti papan skor,
  aksen tunggal yang tegas, sudut elemen terpotong miring (clip-path) sebagai tanda
  "arena", bukan bulat lembut.

## Dials

ENERGY 3 (broadcast hari pertandingan: berani) / RHYTHM 2 (konsisten dengan beberapa
patahan: panel besar siaran vs baris data rapat) / MOTION 2 (transisi & denyut
bermakna: LIVE, countdown, masuk podium; tanpa parallax).

## Keputusan tetap (dengan alasan satu baris, R-31)

- **Latar gelap secara default**: layar dipakai di ruang gelap saat siaran dan konten
  utamanya adalah video game; gelap membuat video menonjol dan hemat OLED TV.
- **Font display condensed (Rajdhani/condensed)**: bahasa papan skor stadion; angka
  rapat mudah dibaca dari jauh di TV 3 meter.
- **Sudut terpotong (`.fs-cut`, clip-path)**: motif identitas BOF yang berulang di
  tombol, badge, kartu; membedakan dari UI admin generik yang bulat.
- **Gradien hanya pada tombol primer & kicker**: memisahkan lapisan aksi dari konten
  (hierarki), bukan dekorasi latar penuh halaman (R-01).
- **Glow hanya pada elemen tunggal per layar** (badge LIVE, angka countdown): penanda
  fokus, bukan gaya semua kartu (R-13).
- **Warna**: tiap tema = 2 warna inti + 1 aksen di atas netral (R-29).
- **Teks di atas permukaan aksen (`--fs-on-fire`)**: tema dengan aksen terang
  (oranye/emas/sian/hijau asam) memakai tinta gelap di atasnya; merah tempur & biru
  frost memakai putih. Alasan: WCAG AA di semua tema terverifikasi skrip
  `scripts/check-theme-contrast.mjs` (8/8 PASS).

## Roster tema (admin pilih real-time)

Semua tema WAJIB lolos kontras WCAG AA dan tidak merusak komponen (R-34).

| Tema | Inti | Aksen | Alasan identitas | Motif berulang |
| --- | --- | --- | --- | --- |
| `firestorm` (default) | hitam pekat + oranye api | sian elektrik | warna lidah api Free Fire; energi match utama | strip bahaya diagonal |
| `obsidian-gold` | hitam obsidian + emas | perak kebiruan | trofi juara; malam final berwibawa | kilau emas pada tepi panel |
| `cyber-blue` | biru laut malam + sian | hijau mint | arena teknologi; cocok smartboard terang | garis pemindai (scanline) |
| `purple-arena` | ungu arena + magenta | sian | opsi pemilik; ungu = warna panggung turnamen malam | sorot magenta pada judul |
| `black-championship` | monokrom perak | emas | final bergaya "black tie"; angka menjadi fokus | garis tipis perak |
| `red-combat` | arang militer + merah tempur | kuningan | zona tempur Free Fire; tegas untuk mode turnamen | strip peringatan merah |
| `toxic-green` | hitam + hijau asam | putih | energi arena malam; kontras ekstrem di LED besar | grid halus hijau |
| `frost-glass` (TERANG) | putih es + biru beku | sian | ruang kelas terang/proyektor: layar gelap memutih | panel kaca es pada header |

## Kualitas siaran (BOF Caster)

- Resolusi, FPS, bitrate bisa diatur panitia di halaman `/caster` (per perangkat,
  disimpan lokal, bukan di Firestore: perangkat caster pemilik encoder).
- Preset: HD Maksimal (1080p/60/8 Mbps), Seimbang (720p/30/4,5 Mbps), Hemat CPU
  (720p/15/2,5 Mbps + degradationPreference balanced).
- Audio: default "audio game murni" = tanpa echo cancellation/noise suppression/AGC
  agar musik game tidak berubah aneh; mode "komunikasi" tersedia bila membagikan
  suara bicara. Monitor lokal selalu mute (mencegah echo ke ruangan).
