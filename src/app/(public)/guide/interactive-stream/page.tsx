"use client";
// /guide/interactive-stream — Panduan lengkap INTERACTIVE GAME STREAM (Phase 3)
import Link from "next/link";
import {
  CheckCircle2, ChevronDown, MonitorSmartphone, ShieldAlert, Smartphone, Tv, Wifi,
} from "lucide-react";
import { BoCard, BoCardLg } from "@/components/common/bo";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function InteractiveStreamGuidePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <span className="bo-kicker mb-2 inline-block">Panduan Broadcast — Phase 3</span>
      <h1 className="bo-title mb-4">Interactive Game Stream</h1>
      <p className="mb-6 text-sm font-semibold text-fs-text/60">
        Siarkan gameplay <strong>Free Fire di komputer</strong> (via Google Play Games on PC) ke HP &amp; TV di
        venue <strong>tanpa internet</strong>, dan biarkan operator/pemirsa terpilih mengendalikan game langsung
        dari layar sentuh HP — joystick virtual + tombol aksi.
      </p>

      {/* 1 · APA INI */}
      <BoCardLg className="bg-fs-panel p-5">
        <p className="font-display text-sm font-black uppercase text-fs-gold">1 · Apa ini?</p>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-fs-text/80">
          <strong>STIKAR Broadcast Agent</strong> adalah aplikasi kecil di komputer produksi yang: (a) menangkap
          window Free Fire dengan ffmpeg, (b) memasukkannya ke MediaMTX sehingga bisa ditonton lewat WebRTC/HLS,
          dan (c) menerima input dari website (joystick/tombol/sentuh) lalu mengeksekusinya ke jendela game
          memakai SendInput OS. Video dan input <strong>langsung lewat LAN</strong> — tidak pernah lewat Firestore
          atau internet publik. Firestore hanya menyimpan metadata (URL agent, daftar perangkat).
        </p>
      </BoCardLg>

      {/* 2 · DIAGRAM ALUR */}
      <BoCard className="bg-fs-panel mt-4 p-5">
        <p className="font-display text-sm font-black uppercase text-fs-gold">2 · Diagram Alur</p>
        <div className="mt-3 overflow-x-auto">
          <svg viewBox="0 0 920 330" className="min-w-[720px]" role="img" aria-label="Diagram alur interactive stream">
            <defs>
              <marker id="arrFire" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#FF5A1F" />
              </marker>
              <marker id="arrCyan" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 Z" fill="#35D6FF" />
              </marker>
            </defs>

            {/* Video path */}
            <text x="20" y="30" fill="#35D6FF" fontSize="12" fontWeight="800" letterSpacing="3">VIDEO PATH (LAN)</text>
            <rect x="20" y="44" width="180" height="70" fill="#18212C" stroke="#26303C" />
            <text x="110" y="72" textAnchor="middle" fill="#F7F9FC" fontSize="12" fontWeight="800">FREE FIRE</text>
            <text x="110" y="90" textAnchor="middle" fill="#98A2B3" fontSize="10">Google Play Games on PC</text>
            <rect x="255" y="44" width="180" height="70" fill="#18212C" stroke="#26303C" />
            <text x="345" y="66" textAnchor="middle" fill="#FF5A1F" fontSize="12" fontWeight="800">AGENT</text>
            <text x="345" y="84" textAnchor="middle" fill="#98A2B3" fontSize="10">ffmpeg window capture</text>
            <text x="345" y="100" textAnchor="middle" fill="#98A2B3" fontSize="10">HTTP :8082 / WS</text>
            <rect x="490" y="44" width="180" height="70" fill="#18212C" stroke="#26303C" />
            <text x="580" y="66" textAnchor="middle" fill="#FFC247" fontSize="12" fontWeight="800">MEDIAMTX</text>
            <text x="580" y="84" textAnchor="middle" fill="#98A2B3" fontSize="10">RTSP → WHEP / HLS</text>
            <text x="580" y="100" textAnchor="middle" fill="#98A2B3" fontSize="10">port 8889</text>
            <rect x="725" y="44" width="175" height="70" fill="#18212C" stroke="#26303C" />
            <text x="812" y="66" textAnchor="middle" fill="#22C55E" fontSize="12" fontWeight="800">PENONTON</text>
            <text x="812" y="84" textAnchor="middle" fill="#98A2B3" fontSize="10">HP · TV · Website</text>
            <text x="812" y="100" textAnchor="middle" fill="#98A2B3" fontSize="10">/live/interactive</text>
            <line x1="200" y1="79" x2="253" y2="79" stroke="#FF5A1F" strokeWidth="2" markerEnd="url(#arrFire)" />
            <line x1="435" y1="79" x2="488" y2="79" stroke="#FF5A1F" strokeWidth="2" markerEnd="url(#arrFire)" />
            <line x1="670" y1="79" x2="723" y2="79" stroke="#FF5A1F" strokeWidth="2" markerEnd="url(#arrFire)" />

            {/* Input path */}
            <text x="20" y="180" fill="#FFC247" fontSize="12" fontWeight="800" letterSpacing="3">INPUT PATH (WebSocket, token)</text>
            <rect x="255" y="200" width="180" height="70" fill="#18212C" stroke="#26303C" />
            <text x="345" y="222" textAnchor="middle" fill="#35D6FF" fontSize="12" fontWeight="800">HP OPERATOR/PENONTON</text>
            <text x="345" y="240" textAnchor="middle" fill="#98A2B3" fontSize="10">joystick + tombol + sentuh</text>
            <text x="345" y="256" textAnchor="middle" fill="#98A2B3" fontSize="10">/live/interactive</text>
            <rect x="20" y="200" width="180" height="70" fill="#18212C" stroke="#26303C" />
            <text x="110" y="222" textAnchor="middle" fill="#F7F9FC" fontSize="12" fontWeight="800">AGENT SendInput</text>
            <text x="110" y="240" textAnchor="middle" fill="#98A2B3" fontSize="10">key/mouse → jendela game</text>
            <text x="110" y="256" textAnchor="middle" fill="#98A2B3" fontSize="10">hanya jika jadi controller</text>
            <line x1="435" y1="235" x2="202" y2="235" stroke="#35D6FF" strokeWidth="2" markerEnd="url(#arrCyan)" />
            <line x1="110" y1="200" x2="110" y2="118" stroke="#35D6FF" strokeWidth="2" markerEnd="url(#arrCyan)" />

            <text x="20" y="310" fill="#98A2B3" fontSize="10">
              Video &amp; input tidak pernah melewati internet publik — semua di jaringan lokal venue.
            </text>
          </svg>
        </div>
      </BoCard>

      {/* 3 · PERSIAPAN KOMPUTER */}
      <BoCard className="bg-fs-panel mt-4 p-5">
        <p className="font-display text-sm font-black uppercase text-fs-gold">3 · Persiapan Komputer</p>
        <ul className="mt-2 space-y-1.5 text-sm font-semibold text-fs-text/80">
          <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-fs-ok" /> Windows 10/11 64-bit, virtualisasi aktif (untuk Google Play Games — lihat panduan terpisah).</li>
          <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-fs-ok" /> Node.js <strong>20+</strong> terpasang (<code>node -v</code> — agent butuh minimal v20).</li>
          <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-fs-ok" /> Free Fire bisa dibuka dan window-nya tampil (jangan minimize ke tray).</li>
          <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-fs-ok" /> Port 8082 (Agent) dan 8889 (MediaMTX) tidak dipakai aplikasi lain.</li>
          <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-fs-ok" /> Wi-Fi/hotspot venue aktif — HP dan TV bisa mencapai IP komputer ini.</li>
        </ul>
      </BoCard>

      {/* 4 · INSTALASI AGENT */}
      <BoCard className="bg-fs-panel mt-4 p-5">
        <p className="font-display text-sm font-black uppercase text-fs-gold">4 · Instalasi Agent (step-by-step)</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm font-semibold text-fs-text/80">
          <li>Unduh <strong>MediaMTX</strong> (mediamtx.exe) dan letakkan di folder <code>agent/</code>.</li>
          <li>Pastikan <code>ffmpeg.exe</code> tersedia (Agent menggunakan gdigrab untuk capture window).</li>
          <li>Di folder agent jalankan <code>npm install</code> — memasang dependensi (<code>ws</code>, plus <code>koffi</code> opsional untuk SendInput).</li>
          <li>Salin <code>config.example.json</code> → <code>config.json</code>; isi <strong>viewerToken</strong> &amp; <strong>adminToken</strong> (dipakai website).</li>
          <li>Jalankan <code>start.bat</code> — Agent HTTP hidup di <code>:8082</code>, MediaMTX di <code>:8889</code>.</li>
          <li>Cek console Agent: muncul IP LAN dan token. URL Agent = <code>IP:8082</code> (contoh <code>192.168.1.10:8082</code>).</li>
        </ol>
      </BoCard>

      {/* 5 · HUBUNGKAN WEBSITE */}
      <BoCard className="bg-fs-panel mt-4 p-5">
        <p className="font-display text-sm font-black uppercase text-fs-gold">5 · Hubungkan Website</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm font-semibold text-fs-text/80">
          <li>Buka <strong>Admin → Interactive Stream</strong> → isi URL Agent + admin token → <em>Connect</em>.</li>
          <li>Section 3: pilih sumber (Free Fire window) → <em>Mulai Capture</em> → tunggu status CAPTURE READY.</li>
          <li>Viewer buka <code>/live/interactive?agent=IP:8082</code> atau scan QR section 6, isi token viewer.</li>
          <li>Tombol <em>Siapkan Broadcast</em> (pre-flight) wajib hijau semua sebelum match dimulai.</li>
        </ol>
      </BoCard>

      {/* 6 · MODE JARINGAN */}
      <BoCard className="bg-fs-panel mt-4 p-5">
        <p className="font-display text-sm font-black uppercase text-fs-gold">6 · Mode Jaringan</p>
        <div className="mt-2 space-y-2 text-sm font-semibold text-fs-text/80">
          <p className="flex gap-2"><Wifi className="mt-0.5 h-4 w-4 shrink-0 text-fs-cyan" /> <span><strong>Hotspot laptop</strong> (paling mudah): komputer agent jadi hotspot, HP/TV bergabung. Cek IP di console Agent (biasanya 192.168.137.x).</span></p>
          <p className="flex gap-2"><Wifi className="mt-0.5 h-4 w-4 shrink-0 text-fs-cyan" /> <span><strong>Router venue</strong>: semua perangkat satu LAN. Cari IP komputer dengan <code>ipconfig</code> (IPv4 Address). Pastikan AP isolation/router tidak memblokir antar-perangkat.</span></p>
          <p className="flex gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-fs-gold" /> <span>Port yang harus bisa diakses: <strong>8082</strong> (Agent HTTP + WebSocket) dan <strong>8889</strong> (MediaMTX WHEP/HLS). Firewall Windows: izinkan Node.js &amp; mediamtx pada jaringan privat.</span></p>
        </div>
      </BoCard>

      {/* 7 · PAIRING HP & TV */}
      <BoCard className="bg-fs-panel mt-4 p-5">
        <p className="font-display text-sm font-black uppercase text-fs-gold">7 · Pairing HP &amp; TV</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="border border-fs-edge p-3">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-fs-text"><Smartphone className="h-4 w-4 text-fs-cyan" /> HP</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[13px] font-semibold text-fs-muted">
              <li>Scan QR dari Admin → Interactive Stream (section 6).</li>
              <li>Halaman <code>/live/interactive</code> terbuka — isi token viewer bila diminta.</li>
              <li>Tekan <strong>AMBIL KONTROL</strong> bila operator mengizinkan input.</li>
            </ol>
          </div>
          <div className="border border-fs-edge p-3">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-fs-text"><Tv className="h-4 w-4 text-fs-cyan" /> TV</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[13px] font-semibold text-fs-muted">
              <li>Sambungkan TV ke Wi-Fi yang sama.</li>
              <li>Buka browser TV → link yang sama dengan HP (atau <code>/live/connect</code> untuk pairing kode).</li>
              <li>Gunakan tombol FULL di header untuk layar penuh.</li>
            </ol>
          </div>
        </div>
        <p className="mt-2 flex gap-2 text-[12px] font-semibold text-fs-muted">
          <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0 text-fs-gold" />
          Catatan jujur: dari halaman HTTPS publik, browser bisa membatasi video HTTP LAN. Selama venue, gunakan
          jaringan lokal yang sama agar WebRTC berjalan.
        </p>
      </BoCard>

      {/* 8 · IZIN KONTROL */}
      <BoCard className="bg-fs-panel mt-4 p-5">
        <p className="font-display text-sm font-black uppercase text-fs-gold">8 · Izin Kontrol</p>
        <ul className="mt-2 space-y-1.5 text-sm font-semibold text-fs-text/80">
          <li><strong>Viewer</strong> hanya menonton. <strong>Controller</strong> satu-satunya yang bisa mengirim input.</li>
          <li>Pemirsa menekan <em>AMBIL KONTROL</em> — keputusan ada di Agent (izin + controller lock). Jika ditolak, alasannya tampil jujur di halaman.</li>
          <li><strong>Controller lock</strong> di panel admin: hanya operator yang boleh memindahkan controller.</li>
          <li><strong>E-STOP</strong> melepas semua input seketika (tombol merah di panel admin &amp; viewer admin).</li>
        </ul>
      </BoCard>

      {/* 9 · TOUCH CONTROL SETUP */}
      <BoCard className="bg-fs-panel mt-4 p-5">
        <p className="font-display text-sm font-black uppercase text-fs-gold">9 · Setup Kontrol Sentuh</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm font-semibold text-fs-text/80">
          <li>Di viewer, buka ikon <strong>Sliders (editor layout)</strong> di kiri atas.</li>
          <li>Pilih preset <em>FF Default</em> atau <em>Minimal</em>, lalu geser joystick/tombol pada preview 16:9.</li>
          <li>Ketuk sebuah tombol untuk mengubah label, key mapping (mis. MouseLeft untuk FIRE), ukuran, opasitas, dan tampil/sembunyi.</li>
          <li><strong>Simpan Layout</strong> — tersimpan di perangkat ini (localStorage), tidak terkirim ke server.</li>
        </ol>
      </BoCard>

      {/* 10 · KETERBATASAN JUJUR */}
      <BoCard className="mt-4 border-fs-gold/50 bg-zb-yellow p-5">
        <p className="font-display text-sm font-black uppercase">10 · Keterbatasan (jujur — baca sebelum match!)</p>
        <ul className="mt-2 space-y-1.5 text-sm font-bold text-fs-ink">
          <li>• Window game harus <strong>terlihat di layar</strong> (tidak diminimize); capture = tampilan yang benar-benar tampak.</li>
          <li>• Input hanya bekerja saat Free Fire jadi <strong>window foreground</strong> — jangan klik aplikasi lain di komputer agent.</li>
          <li>• <strong>Tanpa audio</strong> secara default (WebRTC MediaMTX audio opsional tergantung konfigurasi agent).</li>
          <li>• Tidak ada macro/bot/anti-cheat bypass — Agent hanya meneruskan input manusia; kejujuran pertandingan tetap tanggung jawab panitia.</li>
          <li>• Latensi WebRTC LAN tipikal 100–300 ms; untuk FPS kompetitif ini cukup, tapi bukan 0 ms.</li>
        </ul>
      </BoCard>

      {/* 11 · TROUBLESHOOTING */}
      <section id="troubleshooting" className="mt-8 scroll-mt-20">
        <h2 className="bo-title mb-4">Troubleshooting</h2>
        <BoCard className="bg-fs-panel p-5">
          <Accordion
            items={[
              { q: "GAME NOT FOUND", a: "Free Fire belum jalan atau window-nya tidak terdeteksi. Buka Free Fire dari Google Play Games on PC, biarkan window tampil (jangan minimize). Cek status di Admin → Interactive Stream section 2." },
              { q: "Layar viewer hitam / SIGNAL LOST", a: "Capture belum aktif atau MediaMTX mati. Mulai capture di section 3, pastikan MEDIAMTX = RUNNING dan WHEP URL terisi. Di HP, pastikan satu jaringan dan port 8889 tidak diblokir." },
              { q: "Agent tidak terjangkau", a: "URL/IP salah atau firewall memblokir. Cek ipconfig, ping IP dari HP, izinkan Node.js di Windows Firewall (jaringan privat). Hotspot laptop: cek AP isolation." },
              { q: "Input tidak merespons", a: "Periksa: (1) status INPUT = ENABLED, (2) kamu benar-benar CONTROLLER (badge hijau), (3) E-STOP = CLEAR, (4) Free Fire foreground. Bila controller lock aktif, hanya operator yang bisa ambil kontrol." },
              { q: "Permintaan kontrol ditolak", a: "Alasan tampil di banner kuning: input dimatikan operator, controller lock aktif, atau perangkat lain sedang mengendalikan. Minta operator melepas controller (RELEASE) atau matikan lock." },
              { q: "Latency tinggi (>500ms)", a: "Turunkan kualitas ke LOW di panel admin, gunakan 5 GHz Wi-Fi atau kabel, dekatkan HP ke hotspot. WebRTC lebih cepat dari HLS — pastikan WHEP dipakai, bukan fallback HLS." },
              { q: "Video patah-patah / drop frame tinggi", a: "Kualitas terlalu tinggi untuk Wi-Fi: turunkan ke Medium/Low, tutup aplikasi berat di komputer agent, pastikan resolusi window stabil." },
              { q: "TV gagal memutar video", a: "Browser TV lama mungkin tak mendukung WebRTC → halaman otomatis fallback HLS (latensi lebih tinggi, ini normal). Bila tetap gagal, gunakan TV dengan Chrome terbaru." },
              { q: "Token ditolak (401/403)", a: "Token viewer/admin salah atau berubah di config.json agent. Ambil token terbaru dari console Agent, simpan ulang di halaman setup / panel admin." },
              { q: "Joystick/tombol tidak presisi", a: "Buka editor layout, geser posisi sesuai genggamanmu, kecilkan opasitas bila mengganggu, lalu Simpan Layout. Layout per perangkat tersimpan lokal." },
              { q: "Frame berhenti saat minimize", a: "Memang begitu (keterbatasan gdigrab) — biarkan window Free Fire terlihat. Gunakan monitor kedua bila operator perlu bekerja sambil siaran." },
              { q: "Semua client terputus mendadak", a: "Agent restart/crash atau ganti IP. Buka ulang dengan QR terbaru dari panel admin; cek console agent untuk log error." },
            ]}
          />
        </BoCard>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/admin/interactive-stream" className="bo-btn bo-btn-primary">Buka Panel Operator</Link>
        <Link href="/live/interactive" className="bo-btn bo-btn-cyan">Buka Viewer Interaktif</Link>
        <Link href="/guide/google-play-games" className="bo-btn bo-btn-white">Panduan Google Play Games</Link>
        <Link href="/guide" className="bo-btn bo-btn-white">Kembali ke Panduan</Link>
      </div>
    </div>
  );
}

function Accordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div key={it.q} className="border border-fs-edge">
          <button
            onClick={() => setOpen((o) => (o === it.q ? null : it.q))}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-black uppercase tracking-[0.12em] text-fs-text hover:bg-white/[0.04]"
            aria-expanded={open === it.q}
          >
            {it.q}
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open === it.q && "rotate-180")} />
          </button>
          {open === it.q ? (
            <p className="border-t border-fs-edge/60 px-3 py-2 text-[13px] font-semibold leading-relaxed text-fs-muted">{it.a}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
