"use client";
// /admin/documentation — indeks dokumentasi repositori
import { BoCard } from "@/components/common/bo";

const DOCS = [
  { file: "README.md", desc: "Ringkasan proyek, arsitektur, quick start" },
  { file: "FIREBASE_SETUP.md", desc: "Setup Firebase Spark, Auth, Firestore, rules, seeding, hosting" },
  { file: "OBS_SETUP.md", desc: "9 scene, browser source overlay, obs-websocket" },
  { file: "MIRRORING_SETUP.md", desc: "USB debugging, scrcpy USB & TCP/IP, capture ke OBS" },
  { file: "LOCAL_STREAMING.md", desc: "MediaMTX untuk streaming LAN sekolah" },
  { file: "YOUTUBE_SETUP.md", desc: "YouTube Live, stream key, embed" },
  { file: "AI_OBSERVER_SETUP.md", desc: "Service Python lokal, kalibrasi, privasi" },
  { file: "TROUBLESHOOTING.md", desc: "Masalah umum & solusi" },
];

const GUIDES = [
  "Membuat turnamen", "Menambahkan peserta & tim", "Sistem poin BOF", "Memasukkan hasil",
  "Mengedit leaderboard", "Menghubungkan HP ke laptop", "Memakai scrcpy", "Gameplay ke OBS",
  "Overlay di OBS", "Streaming publik", "Streaming lokal sekolah", "Menjalankan AI Observer",
  "Membaca hasil AI", "Ganti scene OBS", "Menonton via HP", "Masalah video & leaderboard",
  "AI gagal baca HUD",
];

export default function AdminDocumentationPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-black uppercase">Dokumentasi</h1>
      <p className="mt-1 text-sm font-semibold text-zb-black/60">
        Seluruh dokumen tersedia di folder <code>documentation/</code> repositori proyek dan di situs publik <a href="/guide" className="text-zb-blue underline">/guide</a>.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {DOCS.map((d) => (
          <BoCard key={d.file} className="bg-white p-4">
            <p className="font-mono text-sm font-black">{d.file}</p>
            <p className="mt-1 text-xs font-semibold text-zb-black/60">{d.desc}</p>
          </BoCard>
        ))}
      </div>

      <BoCard className="mt-4 bg-zb-cyan p-4">
        <p className="text-xs font-black uppercase tracking-wider">17 Guide Operator</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {GUIDES.map((g, i) => (
            <span key={g} className="bo-badge bg-white">#{i + 1} {g}</span>
          ))}
        </div>
      </BoCard>
    </div>
  );
}
