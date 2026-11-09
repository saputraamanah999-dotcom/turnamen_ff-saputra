"use client";
// /guide/local-network — streaming LAN via OBS → MediaMTX → TV/HP
import Link from "next/link";
import { BoCard, BoCardLg } from "@/components/common/bo";

const STEPS = [
  ["1. Jalankan MediaMTX di laptop produksi", "Unduh MediaMTX (gratis, single binary), jalankan dengan konfigurasi default: RTMP masuk di port 1935, HLS keluar di port 8888, WebRTC di port 8889."],
  ["2. Arahkan output OBS ke MediaMTX", "OBS → Settings → Stream → Custom RTMP: Server rtmp://127.0.0.1:1935/live, Stream Key bof-main (bebas, sama dengan path)."],
  ["3. Cek alamat lokal", "Buka Admin → Local Network: sistem menampilkan alamat HLS http://<IP-laptop>:8888/live dan halaman penonton. IP diambil dari konfigurasi nyata — jika IP berubah, perbarui dan QR otomatis mengikuti."],
  ["4. Hubungkan TV", "TV dibuka lewat browser (Chrome/TV browser), ketik alamat atau scan QR yang tampil di Admin → Local Network. TV harus satu jaringan Wi-Fi/LAN dengan laptop."],
  ["5. Perangkat tambahan", "Beberapa HP/ tablet boleh membuka alamat yang sama. Jumlah pemutar bervariasi tergantung kapasitas laptop — pantau health di Admin → Local Network."],
  ["6. Fallback HLS", "WebRTC lebih rendah latensi; jika browser TV tidak mendukung, HLS (latensi 2–6 detik) otomatis dipakai sebagai fallback di halaman live."],
];

export default function LocalNetworkGuidePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <span className="bo-kicker mb-2 inline-block bg-zb-blue">Panduan Broadcast</span>
      <h1 className="bo-title mb-4">Streaming Jaringan Lokal (LAN)</h1>
      <p className="mb-6 text-sm font-semibold text-fs-text/60">
        Alur resmi: <strong>Laptop capture → OBS → MediaMTX → Wi-Fi/Hotspot lokal → TV &amp; perangkat tambahan</strong>.
        Streaming LAN tetap berjalan tanpa internet.
      </p>

      <div className="space-y-3">
        {STEPS.map(([title, body]) => (
          <BoCard key={title} className="bg-fs-panel p-5">
            <p className="font-display text-sm font-black uppercase">{title}</p>
            <p className="mt-1.5 text-sm font-semibold leading-relaxed text-fs-text/70">{body}</p>
          </BoCard>
        ))}
      </div>

      <BoCard className="mt-6 bg-zb-yellow p-5">
        <p className="text-sm font-bold">
          ⚠ Client Isolation: sebagian router/hotspot memblokir antar-perangkat. Jika TV tidak bisa membuka
          alamat laptop: (1) matikan AP/client isolation di pengaturan router, (2) atau pakai hotspot dari HP
          laptop, (3) tes konektivitas lewat tombol diagnosa di Admin → Local Network — sistem menampilkan hasil
          nyata, bukan asumsi.
        </p>
      </BoCard>

      <BoCardLg className="mt-4 bg-fs-panel p-5">
        <p className="font-display text-sm font-black uppercase">Keamanan</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold text-fs-text/70">
          <li>Endpoint admin lokal dilindungi token — jangan bagikan token bridge ke penonton.</li>
          <li>Yang dibagikan ke penonton hanya alamat halaman live (HLS/WebRTC), bukan port admin/OBS.</li>
          <li>Jangan buka port 1935/8078 ke internet publik — port itu hanya untuk jaringan lokal.</li>
        </ul>
      </BoCardLg>

      <div className="mt-6 flex gap-3">
        <Link href="/admin/local-network" className="bo-btn bo-btn-primary">Buka Local Network Manager</Link>
        <Link href="/guide" className="bo-btn bo-btn-white">Kembali ke Panduan</Link>
      </div>
    </div>
  );
}
