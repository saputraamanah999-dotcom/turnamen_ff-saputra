"use client";
// /guide — pusat panduan Bahasa Indonesia
import Link from "next/link";
import { BoCard } from "@/components/common/bo";

const GUIDES = [
  { n: 1, title: "Cara membuat turnamen", href: "/guide#turnamen" },
  { n: 2, title: "Cara menambahkan peserta dan tim", href: "/guide#tim" },
  { n: 3, title: "Cara menggunakan sistem poin BOF", href: "/guide#poin" },
  { n: 4, title: "Cara memasukkan hasil pertandingan", href: "/guide#hasil" },
  { n: 5, title: "Cara mengedit leaderboard", href: "/guide#leaderboard" },
  { n: 6, title: "Cara menghubungkan HP ke laptop", href: "/guide/mirroring" },
  { n: 7, title: "Cara memakai scrcpy", href: "/guide/mirroring" },
  { n: 8, title: "Cara memasukkan gameplay ke OBS", href: "/guide/obs" },
  { n: 9, title: "Cara memasang overlay STIKAR di OBS", href: "/guide/obs" },
  { n: 10, title: "Cara mengatur streaming publik", href: "/guide/streaming" },
  { n: 11, title: "Cara membuat streaming lokal sekolah", href: "/guide/local-network" },
  { n: 12, title: "Cara menjalankan AI Observer", href: "/guide/ai-observer" },
  { n: 13, title: "Cara membaca hasil analisis AI", href: "/guide/ai-observer" },
  { n: 14, title: "Cara mengganti scene OBS", href: "/guide/obs" },
  { n: 15, title: "Cara melihat pertandingan melalui HP", href: "/guide/local-network" },
  { n: 16, title: "Cara mengatasi masalah video dan leaderboard", href: "/guide#troubleshoot" },
  { n: 17, title: "Cara mengatasi AI Observer gagal membaca HUD", href: "/guide#ai" },
  { n: 18, title: "Cara setup Wi-Fi / hotspot turnamen", href: "/guide/hotspot" },
  { n: 19, title: "Cara menghubungkan TV ke streaming lokal", href: "/guide/local-network" },
  { n: 20, title: "Cara memakai Interactive Game Stream", href: "/guide/interactive-stream" },
  { n: 21, title: "Cara memainkan Free Fire di komputer (Google Play Games)", href: "/guide/google-play-games" },
];

export default function GuideIndexPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <span className="bo-kicker mb-2 inline-block bg-zb-cyan text-fs-ink">Dokumentasi</span>
      <h1 className="bo-title mb-6">Panduan Operator</h1>
      <p className="mb-6 text-sm font-semibold text-fs-text/60">
        Semua panduan ditulis dalam Bahasa Indonesia untuk operator sekolah. Dokumen lengkap
        (dengan diagram) tersedia di folder <code>documentation/</code> pada repositori proyek.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <BoCard className="bg-zb-yellow p-5">
          <h2 className="font-display text-lg font-black uppercase">Panduan Website &amp; Data</h2>
          <ul className="mt-3 space-y-1.5 text-sm font-bold">
            {GUIDES.slice(0, 5).map((g) => (
              <li key={g.n} className="flex gap-2">
                <span className="text-fs-text/40">#{g.n}</span>
                <Link href={g.href} className="hover:underline">{g.title}</Link>
              </li>
            ))}
            {GUIDES.slice(11, 13).map((g) => (
              <li key={g.n} className="flex gap-2">
                <span className="text-fs-text/40">#{g.n}</span>
                <Link href={g.href} className="hover:underline">{g.title}</Link>
              </li>
            ))}
            <li className="flex gap-2">
              <span className="text-fs-text/40">#16</span>
              <a href="#troubleshoot" className="hover:underline">{GUIDES[15].title}</a>
            </li>
          </ul>
        </BoCard>

        <BoCard className="bg-zb-cyan p-5">
          <h2 className="font-display text-lg font-black uppercase">Panduan Broadcast</h2>
          <ul className="mt-3 space-y-1.5 text-sm font-bold">
            {GUIDES.slice(5, 11).map((g) => (
              <li key={g.n} className="flex gap-2">
                <span className="text-fs-text/40">#{g.n}</span>
                <Link href={g.href} className="hover:underline">{g.title}</Link>
              </li>
            ))}
            <li className="flex gap-2">
              <span className="text-fs-text/40">#14</span>
              <Link href="/guide/obs" className="hover:underline">{GUIDES[13].title}</Link>
            </li>
            <li className="flex gap-2">
              <span className="text-fs-text/40">#15</span>
              <Link href="/guide/streaming" className="hover:underline">{GUIDES[14].title}</Link>
            </li>
            <li className="flex gap-2">
              <span className="text-fs-text/40">#17</span>
              <Link href="/guide#ai" className="hover:underline">{GUIDES[16].title}</Link>
            </li>
          </ul>
        </BoCard>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <BoCard className="fs-cut bg-fs-panel p-5">
          <h2 className="font-display text-lg font-black uppercase">Interactive Game Stream</h2>
          <p className="mt-2 text-sm font-semibold text-fs-text/70">
            Siarkan gameplay Free Fire dari komputer (Google Play Games on PC) ke HP &amp; TV di venue,
            lengkap dengan joystick virtual + tombol aksi dan izin kontrol per pemirsa.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/guide/interactive-stream" className="bo-btn bo-btn-cyan !px-3 !py-1.5 !text-[11px]">Buka panduan →</Link>
            <Link href="/guide/interactive-stream#troubleshooting" className="bo-btn bo-btn-white !px-3 !py-1.5 !text-[11px]">Troubleshooting</Link>
          </div>
          <p className="mt-3 text-[10px] font-black uppercase tracking-[0.2em] text-fs-muted">Panduan #20 · #21</p>
        </BoCard>

        <BoCard className="fs-cut bg-fs-panel p-5">
          <h2 className="font-display text-lg font-black uppercase">Google Play Games on PC</h2>
          <p className="mt-2 text-sm font-semibold text-fs-text/70">
            Persiapan komputer, instalasi resmi, login Google DI APLIKASI PC (bukan di website!), dan
            checklist GAME NOT FOUND → STREAM READY sebelum Free Fire disiarkan lewat Agent.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/guide/google-play-games" className="bo-btn bo-btn-fire !px-3 !py-1.5 !text-[11px]">Buka panduan →</Link>
          </div>
          <p className="mt-3 text-[10px] font-black uppercase tracking-[0.2em] text-fs-muted">Panduan #21 · wajib sebelum match</p>
        </BoCard>
      </div>

      <section id="turnamen" className="mt-10 scroll-mt-20">
        <h2 className="bo-title mb-4">Membuat Turnamen, Tim &amp; Memasukkan Hasil</h2>
        <BoCard className="bg-fs-panel p-6 text-sm leading-relaxed">
          <ol className="list-decimal space-y-2 pl-5 font-semibold">
            <li>Masuk <strong>Admin → Tournaments</strong>, buat turnamen dengan format BO3/BO5/BO7 dan kapasitas tim (default 12).</li>
            <li>Aktifkan turnamen (status <em>active</em>) agar halaman publik menampilkan data.</li>
            <li className="scroll-mt-24" id="tim">Tambahkan tim di <strong>Admin → Tim</strong>: nama, tag, nomor, dan roster opsional.</li>
            <li>Buat match di <strong>Admin → Match</strong>: nomor, map, format, dan jadwal.</li>
            <li className="scroll-mt-24" id="hasil">Setelah match selesai, buka <strong>Admin → Entri Hasil</strong> pada match tersebut.</li>
            <li>Isi placement &amp; kill tiap tim — poin placement, kill points, dan total dihitung otomatis sesuai aturan resmi BOF.</li>
            <li className="scroll-mt-24" id="leaderboard">Gunakan <strong>Simpan Draft</strong> untuk menyimpan sementara, lalu <strong>Publish</strong> agar klasemen publik diperbarui realtime.</li>
          </ol>
        </BoCard>
      </section>

      <section id="poin" className="mt-8 scroll-mt-20">
        <h2 className="bo-title mb-4">Sistem Poin BOF</h2>
        <BoCard className="bg-fs-panel p-6 text-sm leading-relaxed">
          <p className="font-semibold">
            Placement: 1=20, 2=17, 3=15, 4=13, 5=12, 6=10, 7=6, 8=4, 9=3, 10=2, 11=1, 12=0.
            Kill: +2 poin per kill. Contoh: juara 1 dengan 8 kill = 20 + 16 = <strong>36 poin</strong>.
          </p>
          <p className="mt-2 font-semibold">
            Tiebreaker: (1) total poin, (2) placement points, (3) placement pada game terakhir
            sesuai format (BO7 → game 7). Sisanya ditandai <em>perlu review manual</em> dan tidak
            diputuskan otomatis.
          </p>
        </BoCard>
      </section>

      <section id="ai" className="mt-8 scroll-mt-20">
        <h2 className="bo-title mb-4">AI Observer</h2>
        <BoCard className="bg-fs-panel p-6 text-sm leading-relaxed">
          <p className="font-semibold">
            AI Observer berjalan di laptop produksi (bukan di website). Jalankan service Python
            di folder <code>observer-ai/</code> (port 127.0.0.1:8077), kalibrasi region HUD, lalu
            hubungkan dari <strong>Admin → AI Observer</strong>.
          </p>
          <p className="mt-2 font-semibold">
            Semua event AI berupa <strong>indikasi dengan tingkat confidence</strong> — operator
            memverifikasi manual sebelum event dikonfirmasi. Jika HUD tidak terbaca, AI
            menampilkan <em>PEMAIN TIDAK DIKENAL</em> dan <em>MAP TIDAK DIKENAL DENGAN YAKIN</em>,
            tidak pernah mengarang data.
          </p>
        </BoCard>
      </section>

      <section id="troubleshoot" className="mt-8 scroll-mt-20">
        <h2 className="bo-title mb-4">Masalah Umum</h2>
        <BoCard className="bg-zb-yellow p-6 text-sm leading-relaxed">
          <ul className="space-y-2 font-semibold">
            <li>• <strong>Leaderboard tidak update:</strong> cek koneksi internet, pastikan Firestore Rules ter-deploy, dan hasil sudah di-Publish.</li>
            <li>• <strong>Video tidak muncul:</strong> pastikan stream aktif dan ID YouTube / URL HLS sudah diatur di Admin → Broadcast Control.</li>
            <li>• <strong>Overlay berlatar hitam di OBS:</strong> gunakan Browser Source (bukan Window Capture) dengan transparan.</li>
            <li>• Panduan lengkap: <code>documentation/TROUBLESHOOTING.md</code>.</li>
          </ul>
        </BoCard>
      </section>
    </div>
  );
}
