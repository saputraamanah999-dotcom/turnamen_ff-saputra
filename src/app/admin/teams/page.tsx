"use client";
// /admin/teams — CRUD tim
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { BoButton, BoCard } from "@/components/common/bo";
import { DataStatusBanner, EmptyState } from "@/components/common/stat";
import { TeamInitials } from "@/components/leaderboard/leaderboard";
import { useActiveTournament, useTeams } from "@/services/firestore/hooks";
import { upsertTeam, deleteTeam } from "@/services/scoring/publish";
import { useAdminSession } from "@/services/auth/admin";
import { useToast } from "@/hooks/use-toast";
import type { Team } from "@/lib/types";

export default function AdminTeamsPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const teams = useTeams(tid, false);
  const session = useAdminSession();
  const { toast } = useToast();

  const [editing, setEditing] = useState<Partial<Team> | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!tid || !editing?.name) return;
    setBusy(true);
    try {
      await upsertTeam(
        tid,
        {
          ...editing,
          tournamentId: tid,
          number: Number(editing.number ?? 0),
        },
        { uid: session.user!.uid, email: session.user!.email ?? "" },
      );
      toast({ title: "Tim tersimpan", description: `${editing.name} berhasil disimpan.` });
      setEditing(null);
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: String((e as Error).message ?? e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(team: Team) {
    if (!tid) return;
    if (!confirm(`Hapus tim "${team.name}"? Riwayat hasil match tidak ikut terhapus.`)) return;
    await deleteTeam(tid, team.id, { uid: session.user!.uid, email: session.user!.email ?? "" });
    toast({ title: "Tim dihapus" });
  }

  if (!tid) {
    return <EmptyState title="Buat turnamen terlebih dahulu" description="Buka menu Tournaments untuk membuat turnamen." />;
  }

  return (
    <div>
      <DataStatusBanner status={teams.status} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black uppercase">Tim</h1>
          <p className="text-sm font-semibold text-fs-text/60">
            {teams.data?.length ?? 0} tim · kapasitas {tournament?.teamCapacity ?? 12}
          </p>
        </div>
        <BoButton
          variant="primary"
          onClick={() => setEditing({ name: "", tag: "", number: (teams.data?.length ?? 0) + 1, status: "active", description: "" })}
        >
          <Plus className="h-4 w-4" /> Tambah Tim
        </BoButton>
      </div>

      {/* Form edit */}
      {editing ? (
        <BoCard className="mt-4 bg-fs-panel p-5">
          <h2 className="font-display text-lg font-black uppercase">{editing.id ? "Edit Tim" : "Tim Baru"}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Nama Tim">
              <input className="bo-input" value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Team Alpha" />
            </Field>
            <Field label="Tag (maks 5)">
              <input className="bo-input uppercase" maxLength={5} value={editing.tag ?? ""} onChange={(e) => setEditing({ ...editing, tag: e.target.value.toUpperCase() })} placeholder="ALP" />
            </Field>
            <Field label="Nomor Tim">
              <input className="bo-input" type="number" min={1} value={editing.number ?? 1} onChange={(e) => setEditing({ ...editing, number: Number(e.target.value) })} />
            </Field>
            <Field label="Status">
              <select className="bo-input" value={editing.status ?? "active"} onChange={(e) => setEditing({ ...editing, status: e.target.value as Team["status"] })}>
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
                <option value="banned">Diblokir</option>
              </select>
            </Field>
            <Field label="Deskripsi (opsional)" className="sm:col-span-2 lg:col-span-4">
              <textarea className="bo-input h-20 py-2" value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <Field label="Roster — pisahkan dengan koma (opsional)" className="sm:col-span-2 lg:col-span-4">
              <input
                className="bo-input"
                value={(editing.roster ?? []).map((r) => r.nickname).join(", ")}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    roster: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).map((nickname) => ({ nickname })),
                  })
                }
                placeholder="Player1, Player2, Player3, Player4"
              />
            </Field>
          </div>
          <div className="mt-4 flex gap-3">
            <BoButton variant="primary" onClick={save} disabled={busy || !editing.name}>
              {busy ? "Menyimpan…" : "Simpan"}
            </BoButton>
            <BoButton variant="white" onClick={() => setEditing(null)}>Batal</BoButton>
          </div>
        </BoCard>
      ) : null}

      {/* Daftar tim */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(teams.data ?? []).map((team) => (
          <BoCard key={team.id} className="flex items-center gap-3 bg-fs-panel p-4">
            <TeamInitials name={team.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-black uppercase">{team.name}</p>
              <p className="text-[11px] font-bold uppercase text-fs-text/50">
                #{team.number} · [{team.tag || "—"}] · {team.status}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button className="bo-btn bo-btn-white !px-2.5 !py-1.5" onClick={() => setEditing(team)} aria-label={`Edit ${team.name}`}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button className="bo-btn !border-[#e5484d] !bg-[#e5484d] !px-2.5 !py-1.5 text-white" onClick={() => remove(team)} aria-label={`Hapus ${team.name}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </BoCard>
        ))}
      </div>
      {teams.data?.length === 0 ? (
        <EmptyState className="mt-6" title="Belum ada tim" description="Tambahkan tim peserta dengan tombol di atas." />
      ) : null}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-black uppercase tracking-wider text-fs-text/70">{label}</label>
      {children}
    </div>
  );
}
