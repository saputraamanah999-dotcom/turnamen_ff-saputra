# Tournament Rules & Disciplinary Management

Modul pengelolaan peraturan, pelanggaran, sanksi, dan keberatan BATTLE OFF FRIENDS.
Sumber aturan: **Juknis Lomba Free Fire — BOF** (Rabu, 18 November 2026) — nilai default
konfigurasi TIDAK bertentangan dengan juknis.

## Halaman Admin (menu grup "Disiplin")

| Halaman | Fungsi |
| --- | --- |
| `/admin/rules` | Seluruh peraturan lomba (ketentuan umum, pendaftaran, sistem poin, peraturan match, ketertiban) |
| `/admin/violations` | Pencatatan pelanggaran + alur status PENDING → UNDER_REVIEW → VERIFIED/REJECTED → SANCTIONED → APPEALED → CLOSED |
| `/admin/team-warnings` | Penghitung peringatan per tim + eskalasi juknis (lisan → −5 → −10 → keluar dari match) |
| `/admin/penalties` | Semua sanksi poin: buat (usul/terapkan), batalkan (super admin, wajib alasan), hitung ulang |
| `/admin/suspensions` | Penangguhan tim + aktifkan kembali |
| `/admin/bans` | Status tim lengkap (REGISTERED…WITHDRAWN) + formulir keputusan ban/diskualifikasi |
| `/admin/zero-points` | MARK AS NO RESULT SCREENSHOT & terlambat >10 menit → poin match 0 (terikat matchId) |
| `/admin/evidence` | Bukti: upload inline ≤700 KB / tautan, preview, unduh, hapus terkunci setelah keputusan |
| `/admin/appeals` | Keberatan ketua tim + peninjauan; diterima = sanksi dibatalkan + poin dihitung ulang |
| `/admin/disciplinary-history` | Audit log create-only + filter (tim, match, aksi, ID, admin, tanggal) |
| `/admin/penalty-config` | Konfigurasi sanksi berversi (wajib alasan + identitas + riwayat) |
| `/admin/disciplinary-reports` | Ringkasan otomatis + export CSV + cetak/simpan PDF |

Halaman peserta: **/rules** (peraturan + tabel sanksi, publik).

## Koleksi Firestore baru

`disciplinaryViolations`, `disciplinaryPenalties`, `disciplinaryTeams`, `disciplinaryEvidence`,
`disciplinaryAppeals`, `disciplinaryLogs` (create-only), `disciplinaryConfig`.
Rules ada di `firebase/firestore.rules` (blok "Tournament Rules & Disciplinary Management");
deploy via `setup.html` tahap ⑤ atau `python3 scripts/deploy-firestore.py`.

## Cara kerja Point Penalty Engine (anti dobel-potong)

- SATU-satunya penulis `publicLeaderboards/{tid}` adalah `buildAndWriteBoard()`
  (`src/services/scoring/board.ts`) — dipakai oleh publish hasil match, recompute,
  penerapan sanksi, pembatalan sanksi, dan perubahan status tim.
- Poin selalu dihitung dari **hasil mentah + daftar sanksi berstatus APPLIED** —
  sanksi tidak pernah menimpa data hasil, sehingga penerapan ulang tidak mungkin dobel.
- `ZERO_MATCH` terikat `matchId` → hanya match tersebut yang 0.
- `DISQUALIFIED`/`BANNED` → seluruh poin tim = 0, tetap tampil berlabel di leaderboard.
- Setiap baris leaderboard menyimpan `rawPoints`, `violationPenalty`, `disciplineStatus`
  (transparansi spec §M); leaderboard menampilkan `−N` penalti + label DISQUALIFIED.
- Uji otomatis: `npx tsx scripts/test-disciplinary.ts` (18 kasus: contoh spec, zero-match,
  teaming dua tim, DQ, sanksi batal, penalti global sekali).

## Peran (memperluas `adminRoles.role`)

`superadmin` (semua kewenangan: DQ/ban/konfigurasi/batal sanksi) · `admin` (tournament admin:
catat, peringatkan, usul sanksi) · `judge` (periksa & verifikasi) · `scoring` (terapkan penalti ·
validasi) · `operator`. Ketua tim & peserta tanpa akun: dilayani via `/rules` dan dicatat
panitia (form keberatan memuat nama ketua tim).

## Batasan yang jujur

- Bukti inline maksimal 700 KB/dokumen (batas 1 MB Firestore); file besar → jenis LINK.
- Tidak ada akun ketua tim: pengajuan keberatan dicatat panitia atas nama ketua (tercatat siapa pencatatnya).
- Perubahan konfigurasi TIDAK mengubah hasil lama otomatis; gunakan "Hitung Ulang" bila diputuskan resmi.
