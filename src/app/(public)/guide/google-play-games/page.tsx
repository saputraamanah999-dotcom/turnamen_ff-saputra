"use client";
// /guide/google-play-games — Free Fire di Komputer via Google Play Games on PC
import Link from "next/link";
import { CheckCircle2, MonitorPlay, ShieldAlert, XCircle } from "lucide-react";
import { BoCard, BoCardLg } from "@/components/common/bo";

export default function GooglePlayGamesGuidePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <span className="bo-kicker mb-2 inline-block">Panduan Persiapan Game</span>
      <h1 className="bo-title mb-4">Google Play Games on PC — Free Fire di Komputer</h1>
      <p className="mb-6 text-sm font-semibold text-fs-text/60">
        Interactive Stream STIKAR menyiarkan <strong>Free Fire yang berjalan di komputer produksi</strong> lewat
        aplikasi resmi <strong>Google Play Games on PC</strong>. Panduan ini memastikan game siap terdeteksi,
        dicapture, dan dikendalikan oleh Agent.
      </p>

      {/* A · PERSIAPAN KOMPUTER */}
      <BoCardLg className="bg-fs-panel p-5">
        <p className="font-display text-sm font-black uppercase text-fs-gold">A · Persiapan Komputer &amp; Kompatibilitas</p>
        <p className="mt-2 text-sm font-semibold text-fs-text/70">
          <strong>Jangan asumsikan semua PC bisa.</strong> Google Play Games on PC mensyaratkan virtualisasi
          (Hyper-V/WHP) dan spesifikasi minimum resmi Google. Periksa dulu sebelum dijadwalkan untuk match:
        </p>
        <ul className="mt-2 space-y-1.5 text-sm font-semibold text-fs-text/80">
          <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-fs-ok" /> Windows 10 (v2004+)/11 64-bit, SSD, RAM 8 GB+ (disarankan 16 GB).</li>
          <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-fs-ok" /> CPU 4 core+ dengan virtualisasi aktif di BIOS (Intel VT-x / AMD-V).</li>
          <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-fs-ok" /> GPU driver terbaru; driver graphics wajib (HAXM/Windows Hypervisor Platform).</li>
          <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-fs-ok" /> 20 GB ruang disk kosong untuk app player + game.</li>
          <li className="flex gap-2"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-fs-err" /> Bila virtualisasi tak bisa diaktifkan (BIOS terkunci / PC sekolah), Free Fire PC <strong>tidak bisa dijalankan</strong> — pakai opsi capture HP via scrcpy (lihat /guide/mirroring).</li>
        </ul>
      </BoCardLg>

      {/* B · INSTALASI RESMI + PERINGATAN BESAR */}
      <BoCard className="mt-4 border-fs-err/70 bg-fs-err/10 p-5">
        <p className="flex items-center gap-2 font-display text-base font-black uppercase tracking-wide text-fs-err">
          <ShieldAlert className="h-5 w-5" /> Peringatan Keamanan — WAJIB DIBACA
        </p>
        <p className="mt-2 text-sm font-bold leading-relaxed text-fs-text">
          Website STIKAR <strong>TIDAK PERNAH</strong> meminta password Google, password Free Fire, kode OTP,
          maupun cookie/login session. Login Google <strong>HANYA dilakukan di dalam aplikasi resmi
          Google Play Games di komputer</strong> — jangan pernah memberi kredensial apa pun ke halaman web,
          form, atau chat mana pun, termasuk yang mengaku &quot;tim STIKAR&quot;. Semua token di sistem ini
          hanyalah token akses input siaran, bukan kredensial akun game.
        </p>
      </BoCard>

      <BoCard className="bg-fs-panel mt-4 p-5">
        <p className="font-display text-sm font-black uppercase text-fs-gold">B · Instalasi Resmi + Login di Aplikasi PC</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm font-semibold text-fs-text/80">
          <li>Unduh Google Play Games on PC <strong>hanya dari situs resmi Google</strong> (play.google.com/googleplaygames).</li>
          <li>Install dan aktifkan virtualisasi bila diminta (ikuti wizard resmi; restart bila perlu).</li>
          <li><strong>Login Google dilakukan DI APLIKASI PC</strong> — bukan di website. Gunakan akun game turnamen resmi panitia.</li>
          <li>Download Free Fire dari katalog di dalam aplikasi; tunggu instalasi tuntas.</li>
          <li>Set keyboard layout ingame (controller keys) — Agent mengirim key/mouse standar (MouseLeft, Space, KeyC, dst.).</li>
        </ol>
      </BoCard>

      {/* C · JALANKAN FREE FIRE */}
      <BoCard className="bg-fs-panel mt-4 p-5">
        <p className="font-display text-sm font-black uppercase text-fs-gold">C · Jalankan Free Fire + Pengaturan Awal</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm font-semibold text-fs-text/80">
          <li>Luncurkan Free Fire <strong>dari dalam Google Play Games</strong> (bukan shortcut acak).</li>
          <li>Biarkan window game terbuka di monitor — tidak boleh minimize (capture = tampilan nyata).</li>
          <li>Set resolusi/graphics agar stabil di komputer produksi (prioritas: stabil &gt; indah).</li>
          <li>Matikan notifikasi Windows (Focus Assist) agar popup tidak ikut tersiar.</li>
          <li>Masuk lobby dan biarkan di layar — status di panel admin berubah menjadi GAME DETECTED.</li>
        </ol>
      </BoCard>

      {/* D · CHECKLIST GAME SIAP */}
      <BoCard className="bg-fs-panel mt-4 p-5">
        <p className="font-display text-sm font-black uppercase text-fs-gold">D · Checklist Game Siap</p>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {[
            { label: "Game window ditemukan", ok: "gameTitle terisi di status agent" },
            { label: "Game berjalan", ok: "gameProcess aktif di status agent" },
            { label: "Window dapat dicapture", ok: "muncul di daftar sumber section 3" },
            { label: "Resolusi terbaca", ok: "window WxH tampil di status" },
            { label: "Frame diterima", ok: "LAST FRAME < 5s (hijau)" },
            { label: "Input device tersedia", ok: "INPUT = ENABLED, e-stop CLEAR" },
          ].map((r) => (
            <div key={r.label} className="flex items-start gap-2 border border-fs-edge bg-white/[0.02] px-2.5 py-2 text-xs font-bold text-fs-text">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-fs-ok" />
              <span>{r.label}<span className="mt-0.5 block text-[10px] font-semibold text-fs-muted">{r.ok}</span></span>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1.5">
          <StatusChip tone="err" title="GAME NOT FOUND" desc="Proses/window Free Fire tidak ada — jalankan dulu dari Google Play Games." />
          <StatusChip tone="gold" title="WAITING FOR GAME" desc="Agent hidup dan menunggu — game belum terbuka." />
          <StatusChip tone="cyan" title="GAME DETECTED" desc="Window Free Fire terbaca, capture belum dimulai." />
          <StatusChip tone="gold" title="CAPTURE READY" desc="ffmpeg mengambil window; MediaMTX siap — tekan Mulai Capture bila belum." />
          <StatusChip tone="ok" title="STREAM READY" desc="Frame mengalir & WHEP tersedia — viewer bisa menonton. SIAP SIARAN." />
        </div>
      </BoCard>

      {/* E · LANJUT KE AGENT */}
      <BoCard className="bg-fs-panel mt-4 p-5">
        <p className="flex items-center gap-2 font-display text-sm font-black uppercase text-fs-gold">
          <MonitorPlay className="h-4 w-4 text-fs-cyan" /> E · Lanjut ke Agent + Interactive Stream
        </p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm font-semibold text-fs-text/80">
          <li>Install &amp; jalankan STIKAR Broadcast Agent di komputer yang sama (panduan lengkap di bawah).</li>
          <li>Hubungkan dari <strong>Admin → Interactive Stream</strong>, mulai capture, cek pre-flight hijau.</li>
          <li>Bagikan QR/link ke HP &amp; TV venue, atur izin kontrol (section 4).</li>
        </ol>
      </BoCard>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/guide/interactive-stream" className="bo-btn bo-btn-primary">Panduan Interactive Stream</Link>
        <Link href="/admin/interactive-stream" className="bo-btn bo-btn-cyan">Panel Operator</Link>
        <Link href="/guide" className="bo-btn bo-btn-white">Kembali ke Panduan</Link>
      </div>
    </div>
  );
}

function StatusChip({ tone, title, desc }: { tone: "ok" | "gold" | "cyan" | "err"; title: string; desc: string }) {
  const cls = tone === "ok" ? "border-fs-ok/60 text-fs-ok"
    : tone === "gold" ? "border-fs-gold/60 text-fs-gold"
      : tone === "cyan" ? "border-fs-cyan/60 text-fs-cyan"
        : "border-fs-err/60 text-fs-err";
  return (
    <div className="flex flex-wrap items-center gap-2 border border-fs-edge bg-fs-panel px-2.5 py-1.5">
      <span className={`bo-badge ${cls}`}>{title}</span>
      <span className="text-[12px] font-semibold text-fs-muted">{desc}</span>
    </div>
  );
}
