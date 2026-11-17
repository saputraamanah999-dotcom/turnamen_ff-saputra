"use client";
// ============================================================
// STIKAR ESPORTS — KARTU PAIRING BOF CASTER (TV & /live)
// Tampil di area video ketika mode "caster" aktif tetapi panitia
// belum membagikan layar — persis pengalaman hi.casts.app:
//   1. Buka halaman /caster di laptop/HP
//   2. Masukkan kode 6 digit (atau scan QR)
//   3. Pilih layar → langsung tampil real-time di sini
// ============================================================

import { useEffect, useState } from "react";
import { MonitorUp, ScanLine, Smartphone, Cast } from "lucide-react";
import { useQr } from "@/services/broadcast/heartbeat";
import { casterUrl } from "@/services/broadcast/caster";

/** Kelompokkan kode 6 digit: "528346" → "528 346" agar mudah dibaca dari jauh. */
export function formatPairCode(code: string): string {
  const d = (code ?? "").replace(/\D/g, "").slice(0, 6);
  return d.length <= 3 ? d : `${d.slice(0, 3)} ${d.slice(3)}`;
}

export function CasterPairingCard({
  code,
  label,
  expiresAtMs,
}: {
  code: string;
  label?: string;
  expiresAtMs?: number | null;
}) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const qr = useQr(code ? casterUrl(code, origin) : null);
  const sisaJam =
    expiresAtMs && expiresAtMs > Date.now()
      ? Math.max(1, Math.round((expiresAtMs - Date.now()) / 3600000))
      : null;

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-y-auto bg-black/80 px-5 py-6 text-center backdrop-blur-[2px]">
      <p className="bo-kicker flex items-center gap-2">
        <Cast className="h-4 w-4 text-fs-cyan" /> BOF Caster — Bagikan Layar
      </p>
      {label ? (
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.3em] text-fs-cyan/80">{label}</p>
      ) : null}

      {/* Kode besar — gaya "Device ID: 528346" pada smartboard */}
      <div className="mt-5 flex flex-col items-center">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/50">Kode Pairing</p>
        <p className="font-stat mt-2 select-none text-6xl font-black tracking-[0.18em] text-white tabular-nums drop-shadow-[0_0_28px_rgba(53,214,255,.35)] sm:text-7xl">
          {formatPairCode(code) || "······"}
        </p>
      </div>

      {/* QR + langkah */}
      <div className="mt-6 flex flex-col items-center gap-5 sm:flex-row sm:items-stretch sm:gap-7">
        <div className="flex flex-col items-center">
          <div className="border border-fs-edge bg-white p-2">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR buka halaman caster" className="h-32 w-32 sm:h-36 sm:w-36" />
            ) : (
              <div className="flex h-32 w-32 items-center justify-center sm:h-36 sm:w-36">
                <ScanLine className="h-8 w-8 animate-pulse text-black/30" />
              </div>
            )}
          </div>
          <p className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-white/45">Scan QR</p>
        </div>

        <ol className="flex max-w-xs flex-col gap-2.5 text-left">
          <li className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center bg-fs-cyan font-stat text-xs font-black text-black">1</span>
            <p className="text-xs font-semibold leading-snug text-white/85">
              Buka <span className="font-mono text-fs-cyan">{origin ? origin.replace(/^https?:\/\//, "") : "website"}/caster</span> di laptop / HP <b>panitia</b>
            </p>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center bg-fs-cyan font-stat text-xs font-black text-black">2</span>
            <p className="text-xs font-semibold leading-snug text-white/85">
              Masukkan kode <span className="font-stat font-black tracking-wider">{formatPairCode(code)}</span> (atau scan QR)
            </p>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center bg-fs-cyan font-stat text-xs font-black text-black">3</span>
            <p className="text-xs font-semibold leading-snug text-white/85">
              Ketuk <b>Bagikan Layar</b> → tampil di sini <b>real-time</b>, berdampingan leaderboard
            </p>
          </li>
        </ol>
      </div>

      <div className="mt-6 flex items-center gap-2 border border-fs-edge bg-black/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/55">
        <MonitorUp className="h-3.5 w-3.5 text-fs-cyan" /> Menunggu panitia membagikan layar
        <Smartphone className="h-3.5 w-3.5 text-fs-cyan/60" />
        {sisaJam ? <span className="text-white/35">· sesi {sisaJam} jam</span> : null}
      </div>
    </div>
  );
}
