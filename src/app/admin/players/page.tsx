"use client";
// /admin/players — manajemen roster pemain per tim (§7 master prompt).
// Menyimpan roster sebagai RosterMember[] di dokumen tim — tidak pernah
// menyentuh hasil skor. Setiap perubahan tercatat di audit log.
import { useEffect, useState } from "react";
import { Plus, Trash2, UserRound } from "lucide-react";
import { BoBadge, BoButton, BoCard, BoCardLg } from "@/components/common/bo";
import { DataStatusBanner, EmptyState } from "@/components/common/stat";
import { useAdminSession } from "@/services/auth/admin";
import { useActiveTournament, useTeams } from "@/services/firestore/hooks";
import { upsertRoster } from "@/services/scoring/publish";
import type { RosterMember } from "@/lib/types";

export default function AdminPlayersPage() {
  const session = useAdminSession();
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const teams = useTeams(tid);

  const [teamId, setTeamId] = useState<string>("");
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const team = teams.data?.find((t) => t.id === teamId) ?? null;

  useEffect(() => {
    setRoster(team?.roster ?? []);
    setMsg(null);
  }, [teamId, team?.roster]);

  async function save() {
    if (!tid || !teamId) return;
    setSaving(true);
    setMsg(null);
    try {
      await upsertRoster(tid, teamId, roster, {
        uid: session.user?.uid ?? "",
        email: session.user?.email ?? "",
      });
      setMsg("✅ Roster tersimpan & tercatat di audit log.");
    } catch (e) {
      setMsg("❌ " + (e instanceof Error ? e.message : "Gagal menyimpan roster."));
    } finally {
      setSaving(false);
    }
  }

  if (!tid) {
    return (
      <div>
        <h1 className="font-display text-2xl font-black uppercase">Pemain</h1>
        <DataStatusBanner status={teams.status} />
        <EmptyState title="Belum ada turnamen aktif" description="Buat turnamen terlebih dahulu di menu Tournaments." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-black uppercase">Pemain &amp; Roster</h1>
        <p className="mt-1 text-sm font-semibold text-zb-black/60">
          Roster dipakai untuk identifikasi pemain pada pertandingan dan pencocokan AI Observer
          (nickname yang tidak dikenal selalu ditandai UNKNOWN — tidak pernah ditebak).
        </p>
      </div>

      <BoCard className="bg-white p-4">
        <label className="text-xs font-black uppercase tracking-widest text-zb-black/60">Pilih Tim</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {(teams.data ?? []).map((t) => (
            <button
              key={t.id}
              onClick={() => setTeamId(t.id)}
              className={`bo-badge ${teamId === t.id ? "bg-zb-black text-white" : "bg-white"}`}
            >
              [{t.tag}] {t.name}
            </button>
          ))}
          {(teams.data ?? []).length === 0 ? (
            <p className="text-sm font-semibold text-zb-black/50">Belum ada tim — tambahkan dulu di menu Tim.</p>
          ) : null}
        </div>
      </BoCard>

      {team ? (
        <BoCardLg className="bg-white p-5">
          <p className="flex items-center gap-2 font-display text-base font-black uppercase">
            <UserRound className="h-4 w-4 text-zb-blue" /> Roster {team.name} <BoBadge className="bg-zb-cyan">[{team.tag}]</BoBadge>
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <input
              className="bo-input w-56"
              placeholder="Nickname pemain"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
            <input
              className="bo-input w-44"
              placeholder="Peran (opsional: Kapten/Member)"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
            <BoButton
              variant="primary"
              onClick={() => {
                const nick = nickname.trim();
                if (!nick) return;
                if (roster.some((r) => r.nickname.toLowerCase() === nick.toLowerCase())) {
                  setMsg("⚠ Nickname sudah ada di roster.");
                  return;
                }
                setRoster([...roster, { nickname: nick, role: role.trim() || undefined }]);
                setNickname(""); setRole(""); setMsg(null);
              }}
            >
              <Plus className="h-4 w-4" /> Tambah
            </BoButton>
          </div>

          <ul className="mt-4 space-y-2">
            {roster.map((r, i) => (
              <li key={`${r.nickname}-${i}`} className="flex items-center justify-between gap-2 border-[3px] border-zb-black/15 bg-zb-off px-3 py-2">
                <span className="text-sm font-bold">
                  {r.nickname}
                  {r.role ? <BoBadge className="ml-2 bg-zb-purple text-white">{r.role}</BoBadge> : null}
                </span>
                <button
                  className="bo-btn bo-btn-white !border-red-500 !px-2 !py-1 !text-xs"
                  onClick={() => setRoster(roster.filter((_, j) => j !== i))}
                  aria-label={`Hapus ${r.nickname}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {roster.length === 0 ? (
              <li className="text-sm font-semibold text-zb-black/50">Roster kosong — tambahkan pemain di atas.</li>
            ) : null}
          </ul>

          <div className="mt-4 flex items-center gap-3">
            <BoButton variant="yellow" onClick={() => void save()} disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan Roster"}
            </BoButton>
            {msg ? <p className="text-sm font-bold">{msg}</p> : null}
          </div>
        </BoCardLg>
      ) : (
        <EmptyState title="Pilih tim" description="Klik salah satu tim di atas untuk mengelola roster." />
      )}
    </div>
  );
}
