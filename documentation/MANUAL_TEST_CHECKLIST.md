# MANUAL TEST CHECKLIST — STIKAR ESPORTS (BOF)

Checklist QA manual sebelum go-live. Tandai ☑ hanya bila hasil benar-benar diverifikasi.
Automated scoring tests: `npx tsx scripts/test-scoring.ts` (harus semua PASS).

## A. Scoring engine
- [ ] Placement 1=20, 2=17, 3=15, 4=13, 5=12, 6=10, 7=6, 8=4, 9=3, 10=2, 11=1, 12=0
- [ ] Kill point 1 kill = 2 poin; contoh: juara 1 + 8 kill = 36
- [ ] Total = placement points + kill points di Entri Hasil
- [ ] Placement ganda ditolak dengan pesan jelas
- [ ] Kill negatif ditolak
- [ ] Tim tanpa placement diberi tanda (tidak dihitung)
- [ ] Tie-breaker: total poin → placement points → placement game terakhir
- [ ] Tie yang tidak selesai ditandai REVIEW MANUAL (bukan diputuskan paksa)
- [ ] Audit log mencatat publish & recompute

## B. Database & realtime
- [ ] Firestore read/write berjalan (status ONLINE di halaman publik)
- [ ] Akun tanpa peran ditolak di /admin
- [ ] Publish hasil → leaderboard publik/live/display/overlay berubah TANPA refresh
- [ ] Rules: klien publik ditolak saat menulis (tes dengan console browser)
- [ ] Mode offline menampilkan banner jujur (bukan data palsu)

## C. Streaming & broadcast
- [ ] OBS bridge connect/disconnect status nyata di Broadcast & Local Network
- [ ] MediaMTX jalan → HLS bisa dibuka dari TV di LAN
- [ ] WebRTC/HLS fallback tampil sesuai browser TV
- [ ] Beberapa penonton menonton dari satu sumber yang sama
- [ ] Sumber offline → fallback pesan tampil, status gangguan tidak disembunyikan
- [ ] QR code berisi alamat LAN yang benar; diagnosa menampilkan hasil nyata
- [ ] IP laptop berubah → alamat & QR diperbarui operator di Local Network

## D. AI Observer (opsional, laptop produksi)
- [ ] Service /status online; FPS/CPU/RAM tampil
- [ ] Event masuk dengan confidence; UNKNOWN tidak ditebak
- [ ] Confirm/False-positive bekerja dan tidak mengubah klasemen
- [ ] Hasil resmi tetap lewat Match → Entri Hasil

## E. Broadcast UI
- [ ] 9 overlay layout tampil transparan tanpa navbar di 1920×1080 / 1600×900 / 1280×720
- [ ] Presentation mode: 13 section, manual/auto/pause/skip berfungsi
- [ ] Rehearsal: banner NOT OFFICIAL DATA, tidak ada tulisan ke Firestore
- [ ] Emergency: preset tampil di overlay /display /live realtime; skor tak berubah; matikan kembali bersih
- [ ] /display: fullscreen (F), pause (spasi), pindah section (← →), auto-dwell jalan

## F. Halaman publik
- [ ] / live / leaderboard / teams / matches / results / awards / statistics / display / guide semuanya terisi data nyata
- [ ] Navbar + footer tampil di semua halaman publik; link tidak ada yang mati
- [ ] Halaman /teams/:id tidak crash (riwayat match muncul)
- [ ] Guide anchor #tim #hasil #leaderboard #ai #troubleshoot berfungsi

## G. Keamanan
- [ ] Password/stream key tidak muncul di frontend penonton
- [ ] Token bridge hanya di laptop operator
- [ ] auditLogs tidak bisa diedit/dihapus dari klien
- [ ] Tidak ada placeholder TODO/XXX yang tersisa di halaman utama
