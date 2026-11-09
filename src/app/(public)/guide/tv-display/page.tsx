"use client";
// /guide/tv-display — Panduan resmi PHASE 2 (§27):
// "CARA MENYAMBUNGKAN ZEROID ESPORTS KE TV DAN MONITOR BESAR"
// Untuk operator yang belum berpengalaman — urutan A–G, langkah nyata.

import Link from "next/link";
import { BoCard } from "@/components/common/bo";

const SECTIONS: { id: string; title: string; steps: string[]; warn?: string }[] = [
  {
    id: "a",
    title: "A. Persiapan Laptop",
    steps: [
      "Jalankan website ZEROID ESPORTS (Vercel atau localhost:3000) dan login sebagai admin.",
      "Pastikan laptop terhubung ke jaringan (Wi-Fi router / hotspot).",
      "Buka menu Admin → Live Control.",
      "Pilih sumber gameplay: Capture Jendela Game (pilih jendela Free Fire spectator) atau Capture Layar Penuh.",
      "Periksa preview — video harus terlihat, tidak hitam, tidak beku.",
    ],
  },
  {
    id: "b",
    title: "B. Menyalakan Hotspot / Menyambungkan Jaringan",
    steps: [
      "Windows: Settings → Network & internet → Mobile hotspot → ON. macOS: System Settings → Sharing → Internet Sharing.",
      "Sambungkan TV ke Wi-Fi hotspot laptop tersebut (nama & sandi muncul di laptop).",
      "Sambungkan smartphone tambahan bila diperlukan sebagai viewer.",
      "Pastikan laptop dan TV berada di jaringan yang SAMA.",
      "Password Wi-Fi tidak pernah diminta atau disimpan oleh sistem ZEROID.",
    ],
    warn: "Sebagian router/hotspot mengaktifkan client isolation yang memblokir TV ↔ laptop. Jika Connection Test gagal, gunakan hotspot laptop (Option 1).",
  },
  {
    id: "c",
    title: "C. Menyalakan Server Lokal",
    steps: [
      "Buka menu Admin → Local Network.",
      "Pastikan bridge berjalan di laptop: buka terminal di folder proyek lalu jalankan npm run bridge.",
      "Sistem menampilkan IP lokal laptop dan status gateway (port 8080).",
      "Jalankan MediaMTX (lihat broadcast-bridge/mediamtx/README.md) agar video bisa mengalir.",
      "Tekan Jalankan Semua Test di STEP 3 — semua harus OK sebelum lanjut.",
    ],
  },
  {
    id: "d",
    title: "D. Membuka TV",
    steps: [
      "Buka browser TV (atau browser perangkat yang terhubung ke TV besar).",
      "Masukkan Local Display URL yang tertera di Local Network, contoh: http://192.168.43.1:8080/display",
      "Atau scan QR Code dari halaman Local Network bila TV mendukung kamera (umumnya pakai HP untuk scan lalu ketik URL).",
      "Video gameplay + leaderboard akan muncul otomatis ketika siaran aktif.",
      "Tekan tombol fullscreen di TV untuk layar penuh (atau tombol F di keyboard).",
    ],
    warn: "TV lama yang tidak mendukung WebRTC otomatis memakai HLS. Jika autoplay diblokir, tombol PLAY akan muncul — cukup ditekan sekali.",
  },
  {
    id: "e",
    title: "E. Memulai Siaran",
    steps: [
      "Buka Admin → Live Control.",
      "Pilih Streaming Destination: LOCAL NETWORK (TV venue) / PUBLIC INTERNET / keduanya.",
      "Tekan PREPARE BROADCAST — sistem menjalankan preflight check semua syarat.",
      "Jika semua checklist hijau, tombol START LIVE aktif — tekan.",
      "Tunggu status berubah LIVE (bukan saat tombol ditekan, tapi saat koneksi benar-benar tersambung).",
      "TV menampilkan animasi LIVE NOW, lalu gameplay + leaderboard + header ronde/map.",
    ],
  },
  {
    id: "f",
    title: "F. Mengatur Overlay",
    steps: [
      "Buka Admin → Overlay Manager.",
      "Pilih preset (FULL BROADCAST, CLEAN GAMEPLAY, TOP 3, CHAMPION REVEAL, dst.).",
      "Nyalakan/matikan tiap layer dengan toggle; atur posisi/opacity bila perlu.",
      "Lihat hasilnya di Preview Editor 16:9.",
      "Tekan PUSH TO BROADCAST — TV, /live, dan OBS Browser Source berubah realtime.",
      "Salah? Tekan RESTORE PREVIOUS untuk kembali ke konfigurasi sebelumnya.",
    ],
  },
  {
    id: "g",
    title: "G. Mengakhiri Siaran",
    steps: [
      "Buka Live Control lalu tekan STOP LIVE (muncul konfirmasi).",
      "Setelah berhenti, tampilkan scene penutup: Presentation TV → Closing (TV mengikuti realtime).",
      "Pastikan status kembali OFFLINE dan badge LIVE hilang dari TV.",
      "Matikan MediaMTX & bridge bila venue selesai (Ctrl+C di terminal).",
    ],
  },
];

export default function GuideTvDisplayPage() {
  return (
    <div className="fs-arena-bg min-h-screen px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <p className="bo-kicker">Panduan Operator</p>
        <h1 className="mt-3 font-display text-3xl font-black uppercase leading-tight sm:text-4xl">
          Cara Menyambungkan ZEROID ESPORTS ke TV &amp; Monitor Besar
        </h1>
        <p className="mt-3 text-sm font-semibold leading-relaxed text-fs-muted">
          Panduan lengkap untuk operator yang belum berpengalaman. Ikuti urutan A → G.
          Semua status yang tampil di sistem adalah kondisi nyata — bila ada yang tidak
          tercentang, jangan lanjut sebelum beres.
        </p>

        <div className="mt-6 space-y-4">
          {SECTIONS.map((s) => (
            <BoCard key={s.id} className="p-5">
              <h2 className="font-display text-lg font-black uppercase tracking-wide text-fs-fire">
                {s.title}
              </h2>
              <ol className="mt-3 space-y-2">
                {s.steps.map((st, i) => (
                  <li key={i} className="flex gap-3 text-sm font-semibold text-fs-text/90">
                    <span className="font-stat flex h-6 w-6 shrink-0 items-center justify-center border border-fs-edge bg-fs-bg text-xs font-bold text-fs-flame">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{st}</span>
                  </li>
                ))}
              </ol>
              {s.warn ? (
                <p className="mt-3 border border-fs-gold/50 bg-fs-gold/10 px-3 py-2.5 text-xs font-bold leading-relaxed text-fs-gold">
                  ⚠ {s.warn}
                </p>
              ) : null}
            </BoCard>
          ))}
        </div>

        <BoCard className="mt-4 p-5">
          <h2 className="font-display text-lg font-black uppercase text-fs-cyan">Jika Terjadi Gangguan</h2>
          <ul className="mt-3 space-y-2 text-sm font-semibold text-fs-text/90">
            <li>• Video tiba-tiba berhenti → sistem otomatis RECONNECTING (maks 5 percobaan). TV menampilkan layar Reconnecting.</li>
            <li>• Gagal pulih → tekan RECONNECT / RESTART SOURCE di Live Control, atau tampilkan EMERGENCY SCREEN dari menu Emergency.</li>
            <li>• Skor tidak berubah → cek koneksi internet laptop (data skor lewat Firestore realtime, bukan lewat LAN).</li>
            <li>• Pemulihan tidak pernah mengubah hasil pertandingan — skor resmi aman.</li>
          </ul>
        </BoCard>

        <div className="mt-6 flex flex-wrap gap-3 text-xs font-bold uppercase tracking-widest">
          <Link href="/admin/live-control" className="bo-btn bo-btn-fire !px-4 !py-2">Buka Live Control</Link>
          <Link href="/guide/local-network" className="bo-btn bo-btn-white !px-4 !py-2">Panduan Local Network</Link>
          <Link href="/guide/obs" className="bo-btn bo-btn-white !px-4 !py-2">Panduan OBS</Link>
        </div>
      </div>
    </div>
  );
}
