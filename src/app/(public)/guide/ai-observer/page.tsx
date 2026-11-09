"use client";
// /guide/ai-observer — panduan AI Observer (computer vision lokal)
import Link from "next/link";
import { BoCard, BoCardLg } from "@/components/common/bo";

export default function AiObserverGuidePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <span className="bo-kicker mb-2 inline-block bg-zb-purple">Panduan AI</span>
      <h1 className="bo-title mb-4">AI Observer — Computer Vision Lokal</h1>
      <p className="mb-6 text-sm font-semibold text-fs-text/60">
        AI Observer berjalan di <strong>laptop produksi</strong> (Python + OpenCV + OCR, port 127.0.0.1:8077).
        Ia hanya membaca frame yang benar-benar tampak di layar — tidak membaca memori game, tidak injection,
        tidak mengubah skor resmi.
      </p>

      <BoCardLg className="bg-fs-panel p-5">
        <p className="font-display text-sm font-black uppercase">Instalasi &amp; menjalankan</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm font-semibold text-fs-text/70">
          <li>Pastikan Python 3.10+ terpasang di laptop produksi.</li>
          <li>Buka folder <code>observer-ai/</code> pada repositori proyek.</li>
          <li><code>python -m venv venv</code> lalu aktifkan venv (Windows: <code>venv\Scripts\activate</code>).</li>
          <li><code>pip install -r requirements.example.txt</code> (OpenCV, OCR engine, FastAPI, uvicorn).</li>
          <li>Salin <code>calibration.example.json</code> → <code>calibration.json</code> dan kalibrasi region HUD (kill feed, map label) dari <strong>Admin → AI Observer</strong>.</li>
          <li>Jalankan <code>python run.py</code> — service hidup di <code>http://127.0.0.1:8077</code>.</li>
          <li>Dari <strong>Admin → AI Observer</strong> tekan <em>Simpan &amp; Cek</em> — status ONLINE + FPS/CPU nyata tampil bila service hidup.</li>
        </ol>
      </BoCardLg>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <BoCard className="bg-fs-panel p-5">
          <p className="font-display text-sm font-black uppercase">Kalibrasi OCR</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold text-fs-text/70">
            <li>Free Fire spectator mode aktif di laptop, tampilan jelas (bukan mini-map saja).</li>
            <li>Tandai region kill feed &amp; label map pada preview; simpan kalibrasi.</li>
            <li>Confidence rendah = event berstatus indikasi, bukan kepastian.</li>
          </ul>
        </BoCard>
        <BoCard className="bg-fs-panel p-5">
          <p className="font-display text-sm font-black uppercase">Membaca &amp; memvalidasi event</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold text-fs-text/70">
            <li>Setiap event punya confidence + reason — operator menekan <em>Confirm</em> / <em>False Positive</em>.</li>
            <li>Knock ≠ kill; event tidak jelas ditandai UNKNOWN, tidak pernah ditebak.</li>
            <li>Hasil resmi match TETAP dimasukkan lewat Match → Entri Hasil; AI hanya membantu.</li>
          </ul>
        </BoCard>
      </div>

      <BoCard className="mt-4 bg-zb-yellow p-5">
        <p className="text-sm font-bold">
          Jika AI berhenti: streaming dan leaderboard TETAP berjalan — AI Observer bersifat opsional dan
          terisolasi. Tidak ada bagian platform yang bergantung padanya untuk menghitung skor resmi.
        </p>
      </BoCard>

      <div className="mt-6 flex gap-3">
        <Link href="/admin/observer" className="bo-btn bo-btn-primary">Buka Panel AI Observer</Link>
        <Link href="/guide" className="bo-btn bo-btn-white">Kembali ke Panduan</Link>
      </div>
    </div>
  );
}
