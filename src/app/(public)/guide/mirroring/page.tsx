"use client";
// /guide/mirroring — panduan scrcpy
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BoCard } from "@/components/common/bo";

export default function GuideMirroringPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/guide" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-zb-blue hover:underline">
        <ArrowLeft className="h-4 w-4" /> Semua Panduan
      </Link>
      <span className="bo-kicker mb-2 inline-block bg-zb-purple">Mirroring</span>
      <h1 className="bo-title mb-6">Hubungkan HP ke Laptop (scrcpy)</h1>

      <BoCard className="bg-fs-panel p-6 text-sm leading-relaxed">
        <p className="font-semibold">
          Free Fire berjalan di Android, layarnya dipantulkan ke laptop produksi via{" "}
          <strong>scrcpy</strong> (gratis, open source). Laptop yang menangkap layar inilah yang
          dipakai OBS. Website tidak melakukan mirroring langsung — jalur capture harus
          didokumentasikan seperti di bawah.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 font-semibold">
          <li>Sambungkan Android ke laptop dengan kabel USB.</li>
          <li>Aktifkan <strong>Opsi Pengembang → USB Debugging</strong> di Android (izinkan dari pemilik perangkat).</li>
          <li>Jalankan <code>scrcpy</code> dari laptop produksi (mode USB). Mode nirkabel: <code>adb tcpip 5555</code> lalu <code>scrcpy --tcpip=IP_HP</code>.</li>
          <li>Pastikan Free Fire tampil di jendela scrcpy di laptop.</li>
          <li>Buka OBS Studio.</li>
          <li>Tambahkan sumber <strong>Window Capture</strong> (jendela scrcpy) atau <strong>Display Capture</strong> bila diperlukan.</li>
          <li>Sesuaikan ukuran/posisi video.</li>
          <li>Verifikasi audio (scrcpy 2.0+ mendukung audio forwarding bila didukung perangkat).</li>
          <li>Lanjut ke konfigurasi broadcast — lihat <Link href="/guide/obs" className="text-zb-blue underline">Panduan OBS</Link>.</li>
        </ol>
        <p className="mt-4 font-semibold text-fs-text/70">
          Catatan: latency turun dengan kabel USB + <code>scrcpy --max-fps=60 --video-bit-rate=8M</code>.
          Diagram lengkap tersedia di <code>documentation/MIRRORING_SETUP.md</code>.
        </p>
      </BoCard>
    </div>
  );
}
