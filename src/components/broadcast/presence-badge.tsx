"use client";
// ============================================================
// STIKAR ESPORTS — BADGE PRESENCE PENONTON
// Indikator "berapa yang sedang menonton" + daftar siapa yang
// online. Dipakai di header /live, bar info player, dan panel
// admin. Data: useLivePresence (services/broadcast/presence.ts).
// ============================================================

import { Eye, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PresenceViewer } from "@/services/broadcast/presence";

export function PresenceBadge({
  count,
  viewers = [],
  variant = "chip",
  className,
}: {
  count: number;
  /** Daftar penonton online — ditampilkan sebagai daftar nama (maks 12 + sisa). */
  viewers?: PresenceViewer[];
  /** chip = kecil untuk bar player; panel = besar untuk header/admin. */
  variant?: "chip" | "panel";
  className?: string;
}) {
  const names = Array.from(new Set(viewers.map((v) => v.name)));
  const shown = names.slice(0, 12);
  const rest = names.length - shown.length;
  const title = names.length ? `Online: ${names.join(", ")}` : "Belum ada penonton online";

  if (variant === "chip") {
    return (
      <span
        title={title}
        className={cn(
          "inline-flex items-center gap-1.5 border border-fs-cyan/45 bg-black/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-fs-cyan",
          className,
        )}
      >
        <Eye className="h-3 w-3" />
        {count} menonton
      </span>
    );
  }

  return (
    <div
      className={cn(
        "border border-fs-cyan/40 bg-fs-cyan/10 px-4 py-3",
        className,
      )}
    >
      <p className="flex items-center gap-2 font-display text-lg font-black uppercase leading-none text-fs-cyan">
        <Users className="h-5 w-5" />
        {count} <span className="text-xs font-bold tracking-widest">online sekarang</span>
      </p>
      {names.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {shown.map((n) => (
            <span
              key={n}
              className="border border-fs-cyan/30 bg-black/30 px-1.5 py-0.5 text-[10px] font-bold text-white/80"
            >
              {n}
            </span>
          ))}
          {rest > 0 ? (
            <span className="px-1 py-0.5 text-[10px] font-black uppercase tracking-wider text-fs-cyan">
              +{rest} lainnya
            </span>
          ) : null}
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] font-semibold text-fs-muted">
          Belum ada penonton terdeteksi — buka halaman /live di HP/TV untuk ikut terhitung.
        </p>
      )}
    </div>
  );
}
