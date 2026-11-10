"use client";
// Admin → Point Penalties — seluruh sanksi poin: buat, terapkan, batalkan.
import { useMemo, useState } from "react";
import { Recycle } from "lucide-react";
import { BoButton, BoCard } from "@/components/common/bo";
import { Empty, KindBadge, PageHead, PenaltyStatusBadge, Td, Th } from "@/components/disciplinary/ui";
import { PenaltyForm } from "@/components/disciplinary/forms";
import { useActiveTournament, useMatches, useTeams } from "@/services/firestore/hooks";
import { useStaffActor, usePenalties } from "@/services/disciplinary/useDiscipline";
import { applyPenalty, cancelPenalty } from "@/services/disciplinary/store";
import { canApplyPenalty, canDecideHeavy } from "@/lib/disciplinary";
import { formatDateTime } from "@/lib/constants";
import { recomputeStandings } from "@/services/scoring/publish";

export default function PenaltiesPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const teamsQ = useTeams(tid, false);
  const matchesQ = useMatches(tid, false);
  const penaltiesQ = usePenalties(tid);
  const actor = useStaffActor();

  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(true);

  const teams = useMemo(() => (teamsQ.data ?? []).map((t) => ({ id: t.id, name: t.name, tag: t.tag })), [teamsQ.data]);
  const matches = useMemo(() => (matchesQ.data ?? []).map((m) => ({ id: m.id, matchNumber: m.matchNumber, map: m.map })), [matchesQ.data]);
  const list = penaltiesQ.data ?? [];
  const totalApplied = list.filter((p) => p.status === "APPLIED").reduce((a, p) => a + (p.points || 0), 0);

  async function doApply(id: string) {
    const p = list.find((x) => x.id === id);
    if (!p || !actor || !tid) return;
    setBusyId(id);
    setMsg(null);
    try {
      await applyPenalty(p, tid, actor);
      setMsg({ ok: true, text: `Sanksi ${p.code} diterapkan — leaderboard dihitung ulang.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal." });
    }
    setBusyId(null);
  }

  async function doCancel(id: string) {
    const p = list.find((x) => x.id === id);
    if (!p || !actor || !tid) return;
    const reason = window.prompt(`Alasan pembatalan sanksi ${p.code} (wajib, tercatat di audit log):`);
    if (!reason || !reason.trim()) return;
    setBusyId(id);
    setMsg(null);
    try {
      await cancelPenalty(p, tid, actor, reason.trim());
      setMsg({ ok: true, text: `Sanksi ${p.code} dibatalkan — poin dihitung ulang, riwayat tetap tersimpan.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal." });
    }
    setBusyId(null);
  }

  async function doRecompute() {
    if (!tid || !actor) return;
    setBusyId("__recompute");
    setMsg(null);
    try {
      await recomputeStandings(tid, { uid: actor.uid, email: actor.email });
      setMsg({ ok: true, text: "Leaderboard dihitung ulang dari hasil mentah + sanksi sah (idempoten, tidak dobel-potong)." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal." });
    }
    setBusyId(null);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHead
        kicker="Disiplin · Sanksi Poin"
        title="Point Penalties"
        desc={`Mesin penalti terintegrasi leaderboard. Sanksi berstatus APPLIED langsung mengurangi poin melalui perhitungan ulang dari data mentah — mustahil dobel. Total pengurangan aktif: ${totalApplied} poin.`}
      >
        <BoButton variant="cyan" onClick={doRecompute} disabled={busyId === "__recompute"}>
          <Recycle className="h-4 w-4" /> Hitung Ulang Leaderboard
        </BoButton>
        <BoButton variant={showForm ? "black" : "fire"} onClick={() => setShowForm(!showForm)}>Buat Sanksi</BoButton>
      </PageHead>

      {msg ? <p className={`text-xs font-bold ${msg.ok ? "text-fs-ok" : "text-fs-err"}`}>{msg.text}</p> : null}

      {showForm ? (
        <BoCard className="fs-cut p-5">
          <h2 className="mb-3 font-display text-base font-black uppercase text-fs-gold">Sanksi Baru</h2>
          <PenaltyForm tournamentId={tournament?.id ?? ""} teams={teams} matches={matches} actor={actor} />
        </BoCard>
      ) : null}

      <BoCard className="fs-cut p-5">
        <h2 className="mb-3 font-display text-base font-black uppercase text-fs-gold">Daftar Sanksi ({list.length})</h2>
        {list.length === 0 ? (
          <Empty text="Belum ada sanksi" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse">
              <thead>
                <tr><Th>Kode</Th><Th>Tim</Th><Th>Jenis</Th><Th>Cakupan</Th><Th>Alasan</Th><Th>Status</Th><Th>Aksi</Th></tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <Td>
                      <p className="font-display text-[12px] font-black">{p.code}</p>
                      <p className="text-[11px] text-fs-muted">{formatDateTime(p.createdAt)}</p>
                      <p className="text-[11px] text-fs-muted">Usul: {p.proposedBy}</p>
                      {p.approvedBy ? <p className="text-[11px] text-fs-muted">Setuju: {p.approvedBy}</p> : null}
                    </Td>
                    <Td>{p.teamNames.join(" & ")}</Td>
                    <Td>
                      <KindBadge kind={p.kind} />
                      {p.points > 0 ? <p className="mt-1 text-[12px] font-black text-fs-err">−{p.points} poin</p> : null}
                      {p.removeKills ? <p className="text-[11px] text-fs-fire">kill dihapus</p> : null}
                    </Td>
                    <Td>{p.matchNumber ? `Match ${p.matchNumber}` : "Total turnamen"}</Td>
                    <Td>
                      <p className="max-w-64 whitespace-pre-wrap text-[12px]">{p.reason}</p>
                      {p.ruleBase ? <p className="text-[11px] text-fs-cyan">{p.ruleBase}</p> : null}
                      {p.statusNote ? <p className="text-[11px] text-fs-gold">Catatan: {p.statusNote}</p> : null}
                    </Td>
                    <Td><PenaltyStatusBadge status={p.status} /></Td>
                    <Td>
                      <div className="flex flex-col gap-1">
                        {p.status === "PROPOSED" ? (
                          <BoButton
                            className="!px-2 !py-1 !text-[11px]" variant="destructive"
                            disabled={busyId === p.id || !actor || !canApplyPenalty(actor.role)}
                            onClick={() => doApply(p.id)}
                            title={actor && !canApplyPenalty(actor.role) ? "Hanya Scoring Admin / Super Admin" : ""}
                          >
                            Terapkan
                          </BoButton>
                        ) : null}
                        {p.status !== "CANCELLED" ? (
                          <BoButton
                            className="!px-2 !py-1 !text-[11px]" variant="black"
                            disabled={busyId === p.id || !actor || !canDecideHeavy(actor.role)}
                            onClick={() => doCancel(p.id)}
                            title={actor && !canDecideHeavy(actor.role) ? "Hanya Super Admin" : ""}
                          >
                            Batalkan
                          </BoButton>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BoCard>
    </div>
  );
}
