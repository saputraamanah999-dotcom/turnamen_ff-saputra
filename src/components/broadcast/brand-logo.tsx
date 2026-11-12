"use client";
// ============================================================
// STIKAR ESPORTS — LOGO RESMI TURNAMEN
// Logo SMK TI Bali Global Karangasem (aset resmi panitia):
//   public/logos/smk-ti-bali-global.png        — latar transparan
//   public/logos/smk-ti-bali-global-kartu.jpg  — latar putih (kartu/sertifikat)
// Komponen:
//   SmkLogoBadge — logo dalam medali lingkaran putih + cincin emas,
//                  menggantikan kotak "Z" merah di header siaran TV.
//   BrandLockup  — logo + teks STIKAR ESPORTS / nama turnamen.
// Dipakai di: tv-display.tsx (TV), live-viewer.tsx (/live),
// leaderboard (sertifikat via canvas memakai PNG transparan).
// ============================================================

import { cn } from "@/lib/utils";

export const SMK_LOGO_SRC = "/logos/smk-ti-bali-global.png";
export const SMK_LOGO_CARD_SRC = "/logos/smk-ti-bali-global-kartu.jpg";

export function SmkLogoBadge({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F5F7FA] ring-2 ring-fs-gold/70",
        className,
      )}
      style={{
        width: size,
        height: size,
        boxShadow: "0 0 14px rgba(255,194,71,.35), inset 0 0 8px rgba(11,15,22,.08)",
      }}
      aria-label="Logo SMK TI Bali Global Karangasem"
      role="img"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SMK_LOGO_SRC}
        alt="SMK TI Bali Global Karangasem"
        className="h-full w-full object-contain p-[9%]"
        draggable={false}
      />
    </span>
  );
}

/** Logo + identitas siaran — dipakai header TV & /live. */
export function BrandLockup({
  subtitle,
  size = 44,
  className,
}: {
  subtitle?: string;
  size?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <SmkLogoBadge size={size} />
      <div className="min-w-0">
        <p className="font-display text-lg font-black uppercase leading-none tracking-[0.12em] sm:text-xl">
          STIKAR <span className="text-fs-fire">ESPORTS</span>
        </p>
        {subtitle ? (
          <p className="truncate text-[9.5px] font-bold uppercase tracking-[0.26em] text-fs-muted">
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
