"use client";
// /guide/hotspot — setup Wi-Fi/hotspot untuk streaming lokal
import Link from "next/link";
import { BoCard, BoCardLg } from "@/components/common/bo";

export default function HotspotGuidePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <span className="bo-kicker mb-2 inline-block bg-zb-purple">Panduan Broadcast</span>
      <h1 className="bo-title mb-4">Setup Wi-Fi / Hotspot Turnamen</h1>
      <p className="mb-6 text-sm font-semibold text-zb-black/60">
        Tujuan: laptop produksi, TV, dan perangkat penonton berada di SATU jaringan lokal yang sama —
        tanpa bergantung pada internet.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <BoCard className="bg-white p-5">
          <p className="font-display text-sm font-black uppercase">Opsi A — Router Wi-Fi</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm font-semibold text-zb-black/70">
            <li>Siapkan router; laptop &amp; TV connect ke SSID yang sama.</li>
            <li>Internet boleh ikut, tapi streaming LAN tidak membutuhkannya.</li>
            <li>Pastikan client isolation (AP isolation) NONAKTIF.</li>
            <li>Catat IP laptop dari Admin → Local Network.</li>
          </ol>
        </BoCard>
        <BoCard className="bg-white p-5">
          <p className="font-display text-sm font-black uppercase">Opsi B — Hotspot HP/Laptop</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm font-semibold text-zb-black/70">
            <li>Laptop menyalakan hotspot (Windows: Mobile hotspot) atau HP sebagai hotspot.</li>
            <li>TV &amp; perangkat tambahan connect ke hotspot tersebut.</li>
            <li>Batasi jumlah client (biasanya 5–10) agar bandwidth aman.</li>
            <li>Hotspot HP sering mengaktifkan client isolation — gunakan diagnosa.</li>
          </ol>
        </BoCard>
      </div>

      <BoCardLg className="mt-4 bg-white p-5">
        <p className="font-display text-sm font-black uppercase">Urutan penyalaan yang benar</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm font-semibold text-zb-black/70">
          <li>Nyalakan jaringan (router/hotspot) → laptop connect → jalankan MediaMTX + OBS.</li>
          <li>Buka Admin → Local Network → cek alamat + QR.</li>
          <li>TV connect → buka alamat / scan QR → gambar muncul.</li>
          <li>Jika gagal: jalankan diagnosa; pesan error yang tampil adalah hasil pengujian nyata.</li>
        </ol>
      </BoCardLg>

      <BoCard className="mt-4 bg-zb-yellow p-5">
        <p className="text-sm font-bold">
          Catatan: streaming lokal memakai jaringan internal. Bandwidth HLS = bitrate OBS × jumlah penonton.
          Untuk 5–10 penonton, gunakan bitrate OBS 2500–4000 kbps agar laptop dan Wi-Fi tidak kelebihan beban.
        </p>
      </BoCard>

      <div className="mt-6 flex gap-3">
        <Link href="/guide/local-network" className="bo-btn bo-btn-primary">Lanjut: Panduan LAN</Link>
        <Link href="/guide" className="bo-btn bo-btn-white">Kembali ke Panduan</Link>
      </div>
    </div>
  );
}
