"use client";
// /guide/streaming — panduan streaming publik & LAN
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BoCard } from "@/components/common/bo";

export default function GuideStreamingPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/guide" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-zb-blue hover:underline">
        <ArrowLeft className="h-4 w-4" /> Semua Panduan
      </Link>
      <span className="bo-kicker mb-2 inline-block bg-zb-purple">Streaming</span>
      <h1 className="bo-title mb-6">Streaming Publik &amp; Lokal Sekolah</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <BoCard className="bg-white p-6 text-sm leading-relaxed">
          <h2 className="font-display text-lg font-black uppercase">Mode A — YouTube Live</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 font-semibold">
            <li>Aktifkan fitur live di akun YouTube (verifikasi bisa memakan waktu hingga 24 jam).</li>
            <li>Buat kunci streaming di YouTube Studio — <strong>JANGAN bagikan kunci ini ke siapa pun</strong>.</li>
            <li>Masukkan kunci di OBS → Settings → Stream.</li>
            <li>OBS mengirim video final ke YouTube; YouTube yang mendistribusikan.</li>
            <li>Salin ID video live ke <strong>Admin → Broadcast Control</strong> agar website menampilkan pemutar.</li>
          </ol>
          <p className="mt-3 font-semibold text-zb-black/60">
            Kunci streaming tidak pernah tampil di kode publik website.
          </p>
        </BoCard>

        <BoCard className="bg-white p-6 text-sm leading-relaxed">
          <h2 className="font-display text-lg font-black uppercase">Mode B — MediaMTX (LAN)</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 font-semibold">
            <li>Install MediaMTX di laptop produksi (gratis, open source).</li>
            <li>OBS publish RTSP ke <code>rtsp://IP-LAPTOP:8554/stream</code>.</li>
            <li>Perangkat di jaringan sekolah menonton via <code>http://IP-LAPTOP:8888/stream</code> (browser/VLC).</li>
            <li>Isi URL HLS di <strong>Admin → Broadcast Control</strong> (mode MediaMTX).</li>
          </ol>
          <p className="mt-3 font-semibold text-zb-black/60">
            Streaming lokal hanya dapat diakses dari jaringan sekolah — bukan dari internet.
            Jangan buka port tanpa izin admin jaringan.
          </p>
        </BoCard>
      </div>

      <BoCard className="mt-4 bg-zb-yellow p-5 text-sm leading-relaxed">
        <p className="font-bold">
          Prinsip gratis-first: tidak ada Cloudflare Stream atau layanan streaming berbayar pada
          arsitektur ini. Panduan lengkap: <code>documentation/LOCAL_STREAMING.md</code> dan{" "}
          <code>documentation/YOUTUBE_SETUP.md</code>.
        </p>
      </BoCard>
    </div>
  );
}
