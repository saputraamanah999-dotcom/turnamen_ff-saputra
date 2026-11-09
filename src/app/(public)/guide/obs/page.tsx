"use client";
// /guide/obs — panduan OBS Studio & overlay
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BoCard } from "@/components/common/bo";
import { SCENE_LIST } from "@/lib/constants";

export default function GuideObsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/guide" className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-zb-blue hover:underline">
        <ArrowLeft className="h-4 w-4" /> Semua Panduan
      </Link>
      <span className="bo-kicker mb-2 inline-block bg-zb-purple">Broadcast</span>
      <h1 className="bo-title mb-6">Panduan OBS Studio &amp; Overlay</h1>

      <BoCard className="bg-fs-panel p-6 text-sm leading-relaxed">
        <h2 className="font-display text-lg font-black uppercase">1. 9 Scene Produksi</h2>
        <p className="mt-2 font-semibold">Buat 9 scene berikut di OBS Studio (Scene list):</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 font-semibold">
          {SCENE_LIST.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>

        <h2 className="mt-6 font-display text-lg font-black uppercase">2. Memasukkan Gameplay</h2>
        <p className="mt-2 font-semibold">
          Jalankan scrcpy untuk memantulkan layar Android (lihat{" "}
          <Link href="/guide/mirroring" className="text-zb-blue underline">Panduan Mirroring</Link>),
          lalu di OBS tambahkan sumber <strong>Window Capture</strong> (jendela scrcpy) atau
          <strong> Display Capture</strong>. Sesuaikan ukuran, cek audio, lalu masuk scene
          Main Gameplay.
        </p>

        <h2 className="mt-6 font-display text-lg font-black uppercase">3. Memasang Overlay STIKAR</h2>
        <p className="mt-2 font-semibold">
          Tambahkan sumber <strong>Browser</strong>, masukkan URL overlay (ganti
          <code> :tournamentId </code> dengan ID turnamen, mis. <code>bof-main</code>):
        </p>
        <ul className="mt-2 space-y-1 font-mono text-xs font-bold">
          <li>/overlay/:tournamentId/full — 1920×1080</li>
          <li>/overlay/:tournamentId/compact — 1600×900</li>
          <li>/overlay/:tournamentId/top3 — 1280×720</li>
          <li>/overlay/:tournamentId/match-info — 1280×720</li>
          <li>/overlay/:tournamentId/lower-third — 1920×1080</li>
        </ul>
        <p className="mt-2 font-semibold">
          Centang <strong>Shutdown source when not visible</strong>, lebar/tinggi sesuai dimensi
          di atas. Overlay otomatis transparan dan menerima data realtime (tanpa refresh halaman).
          URL bisa juga dibuat dari <strong>Admin → Overlay Manager</strong>.
        </p>

        <h2 className="mt-6 font-display text-lg font-black uppercase">4. OBS WebSocket (opsional)</h2>
        <p className="mt-2 font-semibold">
          Aktifkan Tools → WebSocket Server Settings (port 4455, password kuat). Jalankan{" "}
          <code>broadcast-bridge/</code> di laptop yang sama, lalu atur token bridge di{" "}
          <strong>Admin → Broadcast Control</strong> untuk pengalihan scene dari dashboard.
          Jangan pernah mengekspos OBS WebSocket ke internet.
        </p>
      </BoCard>
    </div>
  );
}
