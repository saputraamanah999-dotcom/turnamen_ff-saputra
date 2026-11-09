"use client";
// /admin/matches — CRUD match + set current
import { useState } from "react";
import Link from "next/link";
import { ClipboardList, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { BoBadge, BoButton, BoCard } from "@/components/common/bo";
import { DataStatusBanner, EmptyState } from "@/components/common/stat";
import { MatchStatusBadge } from "@/components/tournament/match";
import { useActiveTournament, useMatches, useTeams } from "@/services/firestore/hooks";
import { upsertMatch, setCurrentMatch, deleteMatch } from "@/services/scoring/publish";
import { useAdminSession } from "@/services/auth/admin";
import { useToast } from "@/hooks/use-toast";
import { MAP_CATALOG, MATCH_FORMATS, formatDateTime } from "@/lib/constants";
import type { Match } from "@/lib/types";

export default function AdminMatchesPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const matches = useMatches(tid, false);
  const teams = useTeams(tid, false);
  const session = useAdminSession();
  const { toast } = useToast();

  const [editing, setEditing] = useState<Partial<Match> | null>(null);
  const [busy, setBusy] = useState(false);

  const nextNumber = (matches.data?.reduce((max, m) => Math.max(max, m.matchNumber), 0) ?? 0) + 1;
  const expectedTeams = (tournament?.teamCapacity ?? 12) / 2; // rekomendasi kehadiran

  async function save() {
    if (!tid || !editing) return;
    setBusy(true);
    try {
      await upsertMatch(
        tid,
        { ...editing, matchNumber: Number(editing.matchNumber ?? nextNumber) },
        { uid: session.user!.uid, email: session.user!.email ?? "" },
      );
      toast({ title: "Match tersimpan" });
      setEditing(null);
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: String((e as Error).message ?? e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function makeCurrent(m: Match) {
    if (!tid) return;
    await setCurrentMatch(tid, m.id, { uid: session.user!.uid, email: session.user!.email ?? "" });
    toast({ title: `Match ${m.matchNumber} dijadikan match berjalan` });
  }

  return (
    <div>
      <DataStatusBanner status={matches.status} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black uppercase">Match</h1>
          <p className="text-sm font-semibold text-zb-black/60">
            {matches.data?.length ?? 0} match · format {tournament?.format ?? "-"}
          </p>
        </div>
        <BoButton
          variant="primary"
          onClick={() =>
            setEditing({
              matchNumber: nextNumber,
              map: MAP_CATALOG[0] as string,
              format: tournament?.format ?? "BO7",
              status: "scheduled",
              isCurrent: false,
              resultsPublished: false,
            })
          }
        >
          <Plus className="h-4 w-4" /> Buat Match
        </BoButton>
      </div>

      {editing ? (
        <BoCard className="mt-4 bg-white p-5">
          <h2 className="font-display text-lg font-black uppercase">{editing.id ? "Edit Match" : "Match Baru"}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Nomor Match">
              <input className="bo-input" type="number" min={1} value={editing.matchNumber ?? 1} onChange={(e) => setEditing({ ...editing, matchNumber: Number(e.target.value) })} />
            </Field>
            <Field label="Map">
              <select className="bo-input" value={editing.map ?? ""} onChange={(e) => setEditing({ ...editing, map: e.target.value })}>
                {MAP_CATALOG.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Format">
              <select className="bo-input" value={editing.format ?? "BO7"} onChange={(e) => setEditing({ ...editing, format: e.target.value as Match["format"] })}>
                {MATCH_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </Field>
            <Field label="Jadwal">
              <input
                className="bo-input"
                type="datetime-local"
                value={editing.scheduledAt ? new Date(editing.scheduledAt).toISOString().slice(0, 16) : ""}
                onChange={(e) => setEditing({ ...editing, scheduledAt: e.target.value ? new Date(e.target.value).getTime() : null })}
              />
            </Field>
            <Field label="Status">
              <select className="bo-input" value={editing.status ?? "scheduled"} onChange={(e) => setEditing({ ...editing, status: e.target.value as Match["status"] })}>
                <option value="scheduled">Terjadwal</option>
                <option value="live">Sedang berjalan</option>
                <option value="completed">Selesai</option>
                <option value="cancelled">Dibatalkan</option>
              </select>
            </Field>
          </div>
          <div className="mt-4 flex gap-3">
            <BoButton variant="primary" onClick={save} disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</BoButton>
            <BoButton variant="white" onClick={() => setEditing(null)}>Batal</BoButton>
          </div>
          <p className="mt-3 text-xs font-semibold text-zb-black/50">
            Rekomendasi: setiap match diikuti {expectedTeams} tim (setengah kapasitas) — panitia bebas menyesuaikan.
          </p>
        </BoCard>
      ) : null}

      <div className="mt-6 space-y-3">
        {[...(matches.data ?? [])].sort((a, b) => a.matchNumber - b.matchNumber).map((m) => (
          <BoCard key={m.id} className={`flex flex-wrap items-center gap-3 bg-white p-4 ${m.isCurrent ? "!border-zb-purple" : ""}`}>
            <span className="flex h-12 w-12 items-center justify-center border-[3px] border-zb-black bg-zb-purple font-display text-lg font-black text-white bo-shadow-sm tabular-nums">
              {m.matchNumber}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-black uppercase">{m.map} · {m.format}</p>
              <p className="text-[11px] font-bold uppercase text-zb-black/50">
                {formatDateTime(m.scheduledAt ?? undefined)}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <MatchStatusBadge status={m.status} />
                {m.isCurrent ? <BoBadge className="bg-zb-yellow"><Star className="h-3 w-3" /> Match Berjalan</BoBadge> : null}
                {m.resultsPublished ? <BoBadge className="bg-zb-cyan">Hasil Resmi</BoBadge> : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/admin/matches/${m.id}?tid=${tid ?? ""}`}>
                <BoButton variant="cyan" className="!px-3 !py-2 !text-xs"><ClipboardList className="h-3.5 w-3.5" /> Entri Hasil</BoButton>
              </Link>
              <BoButton variant="white" className="!px-3 !py-2 !text-xs" onClick={() => makeCurrent(m)} disabled={m.status === "completed"}>
                <Star className="h-3.5 w-3.5" /> Jadikan Current
              </BoButton>
              <BoButton variant="white" className="!px-3 !py-2 !text-xs" onClick={() => setEditing(m)}>
                <Pencil className="h-3.5 w-3.5" />
              </BoButton>
              <BoButton
                variant="white"
                className="!px-3 !py-2 !text-xs !text-[#e5484d]"
                onClick={async () => {
                  if (!tid) return;
                  if (!confirm(`Hapus match ${m.matchNumber}?`)) return;
                  await deleteMatch(tid, m.id, { uid: session.user!.uid, email: session.user!.email ?? "" });
                  toast({ title: "Match dihapus" });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </BoButton>
            </div>
          </BoCard>
        ))}
        {matches.data?.length === 0 ? (
          <EmptyState title="Belum ada match" description="Buat match pertama dengan tombol Buat Match." />
        ) : null}
      </div>
      <p className="mt-4 text-xs font-semibold text-zb-black/50">
        Terdaftar {teams.data?.length ?? 0} tim pada turnamen ini. Entri hasil wajib memakai
        placement unik — sistem menolak duplikat otomatis.
      </p>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-black uppercase tracking-wider text-zb-black/70">{label}</label>
      {children}
    </div>
  );
}
