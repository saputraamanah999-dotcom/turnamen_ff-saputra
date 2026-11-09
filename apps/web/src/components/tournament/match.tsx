"use client";
// ============================================================
// ZEROID ESPORTS — Kartu info match & daftar match
// ============================================================

import { CalendarClock, Gamepad2, MapPin, Trophy } from "lucide-react";
import Link from "next/link";
import { BoBadge, BoCard } from "@/components/common/bo";
import { cn } from "@/lib/utils";
import type { Match, Tournament } from "@/lib/types";
import { formatDateTime } from "@/lib/constants";

const STATUS_STYLE: Record<Match["status"], { label: string; cls: string }> = {
  scheduled: { label: "Terjadwal", cls: "bg-white text-zb-black" },
  live: { label: "Sedang Berjalan", cls: "bg-[#e5484d] text-white" },
  completed: { label: "Selesai", cls: "bg-zb-cyan text-zb-black" },
  cancelled: { label: "Dibatalkan", cls: "bg-zb-black/60 text-white" },
};

export function MatchStatusBadge({ status }: { status: Match["status"] }) {
  const s = STATUS_STYLE[status];
  return <BoBadge className={s.cls}>{s.label}</BoBadge>;
}

export function MatchInfoCard({
  tournament,
  match,
  className,
}: {
  tournament: Tournament | null;
  match: Match | null;
  className?: string;
}) {
  return (
    <BoCard className={cn("bg-white p-5", className)} aria-label="Informasi pertandingan">
      <div className="flex flex-wrap items-center gap-2">
        <span className="bo-kicker bg-zb-blue">
          {match ? `MATCH ${match.matchNumber}` : "Menunggu Match"}
        </span>
        {match ? <MatchStatusBadge status={match.status} /> : null}
        <span className="ml-auto text-[11px] font-bold uppercase tracking-wider text-zb-black/40">
          Format {tournament?.format ?? "-"} · {tournament?.teamCapacity ?? 12} tim
        </span>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCell icon={<Trophy className="h-4 w-4" />} label="Turnamen" value={tournament?.name ?? "-"} />
        <InfoCell icon={<MapPin className="h-4 w-4" />} label="Map" value={match?.map ?? "-"} />
        <InfoCell icon={<Gamepad2 className="h-4 w-4" />} label="Format" value={match?.format ?? "-"} />
        <InfoCell
          icon={<CalendarClock className="h-4 w-4" />}
          label="Jadwal"
          value={match?.scheduledAt ? formatDateTime(match.scheduledAt) : "Belum ditentukan"}
        />
      </div>
    </BoCard>
  );
}

function InfoCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bo-card-flat bg-zb-off px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zb-black/50">
        {icon} {label}
      </p>
      <p className="mt-1 truncate font-display text-sm font-black uppercase">{value}</p>
    </div>
  );
}

export function MatchCard({ match, href }: { match: Match; href?: string }) {
  const inner = (
    <div className="flex items-center gap-3">
      <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center border-[3px] border-zb-black bg-zb-purple text-white bo-shadow-sm">
        <span className="text-[9px] font-bold uppercase tracking-widest">Match</span>
        <span className="font-display text-xl font-black leading-none tabular-nums">{match.matchNumber}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-black uppercase">{match.map}</p>
        <p className="text-xs font-semibold text-zb-black/60">
          {match.format} · {match.scheduledAt ? formatDateTime(match.scheduledAt) : "Jadwal menyusul"}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <MatchStatusBadge status={match.status} />
          {match.resultsPublished ? (
            <BoBadge className="bg-zb-yellow">Hasil Resmi</BoBadge>
          ) : null}
        </div>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block bo-card bo-press bg-white p-4" aria-label={`Detail match ${match.matchNumber}`}>
      {inner}
    </Link>
  ) : (
    <BoCard className="bg-white p-4">{inner}</BoCard>
  );
}
