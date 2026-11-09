"use client";
// /admin — dashboard
import { useEffect, useState } from "react";
import { Activity, CheckCircle2, Database, Radio, Trophy, Users } from "lucide-react";
import { BoCard } from "@/components/common/bo";
import { useActiveTournament, useMatches, useStandings, useTeams } from "@/services/firestore/hooks";
import { formatDateTime } from "@/lib/constants";

export default function AdminDashboard() {
  const { tournament, status } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const teams = useTeams(tid);
  const matches = useMatches(tid);
  const standings = useStandings(tid);
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const first = setTimeout(() => setNow(formatDateTime(Date.now())), 0);
    const t = setInterval(() => setNow(formatDateTime(Date.now())), 30000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  const currentMatch = matches.data?.find((m) => m.isCurrent) ?? null;

  return (
    <div>
      <h1 className="font-display text-2xl font-black uppercase">Dashboard Admin</h1>
      <p className="mt-1 text-sm font-semibold text-zb-black/60">
        Pembaruan terakhir diperiksa: {now}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStat icon={<Trophy className="h-5 w-5" />} label="Turnamen Aktif" value={tournament?.name ?? "-"} bg="bg-zb-yellow" sub={status === "online" ? "Database online" : "Mode demo"} />
        <AdminStat icon={<Users className="h-5 w-5" />} label="Total Tim" value={String(teams.data?.length ?? 0)} bg="bg-zb-cyan" sub={`Kapasitas ${tournament?.teamCapacity ?? 12}`} />
        <AdminStat icon={<Activity className="h-5 w-5" />} label="Match Berjalan" value={currentMatch ? `Match ${currentMatch.matchNumber}` : "-"} bg="bg-zb-purple text-white" sub={currentMatch?.map ?? "Tidak ada match current"} />
        <AdminStat icon={<CheckCircle2 className="h-5 w-5" />} label="Match Dipublikasikan" value={String(standings.data?.publishedMatchCount ?? 0)} bg="bg-white" sub={`Total kill ${standings.data?.totalKills ?? 0}`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <BoCard className="bg-white p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-black uppercase">
            <Database className="h-4 w-4" /> Status Sistem
          </h2>
          <ul className="mt-3 space-y-2 text-sm font-bold">
            <StatusRow label="Database realtime" ok={status === "online"} note={status === "online" ? "Firestore listener aktif" : "Tidak terjangkau — mode demo"} />
            <StatusRow label="Leaderboard publik" ok={Boolean(standings.data)} note={standings.data ? `${standings.data.standings.length} tim terklasemen` : "Belum ada publikasi"} />
            <StatusRow label="Broadcast" ok={Boolean(tid)} note="Atur di Broadcast Control (OBS/YouTube/MediaMTX)" />
            <StatusRow label="AI Observer" ok={false} note="Service lokal (opsional) — hubungkan dari menu AI Observer" />
          </ul>
        </BoCard>

        <BoCard className="bg-white p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-black uppercase">
            <Radio className="h-4 w-4" /> Publikasi Terakhir
          </h2>
          {standings.data?.updatedAt ? (
            <p className="mt-3 text-sm font-bold">
              {formatDateTime(standings.data.updatedAt)} · {standings.data.publishedMatchCount} match
              dengan versi aturan {standings.data.scoringVersion}
            </p>
          ) : (
            <p className="mt-3 text-sm font-semibold text-zb-black/50">
              Belum ada publikasi hasil.
            </p>
          )}
          <p className="mt-3 text-xs font-semibold text-zb-black/50">
            Semua perubahan admin tercatat di Audit Logs. Klasemen publik diperbarui otomatis
            pada semua perangkat yang terhubung (realtime listener).
          </p>
        </BoCard>
      </div>
    </div>
  );
}

function AdminStat({
  icon, label, value, bg, sub,
}: { icon: React.ReactNode; label: string; value: string; bg: string; sub?: string }) {
  return (
    <div className={`bo-card px-4 py-3 ${bg}`}>
      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-zb-black/60">
        {icon} {label}
      </p>
      <p className="mt-1 truncate font-display text-xl font-black uppercase">{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] font-bold text-zb-black/50">{sub}</p> : null}
    </div>
  );
}

function StatusRow({ label, ok, note }: { label: string; ok: boolean; note: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className={`mt-0.5 inline-block h-3 w-3 shrink-0 border-2 border-zb-black ${ok ? "bg-emerald-400" : "bg-zb-black/20"}`} aria-hidden />
      <span>
        {label} <span className="ml-1 text-xs font-semibold text-zb-black/50">— {note}</span>
      </span>
    </li>
  );
}
