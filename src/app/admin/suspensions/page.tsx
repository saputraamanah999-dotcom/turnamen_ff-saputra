"use client";
// Admin → Team Suspension — penangguhan sementara + aktif kembali (Super Admin).
import { useMemo, useState } from "react";
import { PauseCircle, PlayCircle } from "lucide-react";
import { BoButton, BoCard } from "@/components/common/bo";
import { DisciplineStatusBadge, Empty, Field, PageHead, Td, Th } from "@/components/disciplinary/ui";
import { useActiveTournament, useTeams } from "@/services/firestore/hooks";
import { usePenalties, useStaffActor, useTeamDisciplines } from "@/services/disciplinary/useDiscipline";
import { setTeamDisciplineStatus } from "@/services/disciplinary/store";
import { canDecideHeavy } from "@/lib/disciplinary";
import { formatDateTime } from "@/lib/constants";

export default function SuspensionsPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const teamsQ = useTeams(tid, false);
  const disciplinesQ = useTeamDisciplines();
  const penaltiesQ = usePenalties(tid);
  const actor = useStaffActor();

  const [teamId, setTeamId] = useState("");
  const [duration, setDuration] = useState("");
  const [reason, setReason] = useState("");
  const [ruleBase, setRuleBase] = useState("Juknis §G — keputusan panitia.");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const teams = teamsQ.data ?? [];
  const statuses = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of disciplinesQ.data ?? []) map.set(d.teamId, d.status);
    return map;
  }, [disciplinesQ.data]);

  const suspended = (disciplinesQ.data ?? []).filter((d) => d.status === "SUSPENDED");
  const relatedPenalty = (penaltiesQ.data ?? []).find((p) => p.kind === "SUSPENSION" && p.teamIds.includes(teamId) && p.status !== "CANCELLED");

  async function suspend() {
    const team = teams.find((t) => t.id === teamId);
    if (!team || !actor || !tid) return;
    setBusy(true);
    setMsg(null);
    try {
      await setTeamDisciplineStatus(
        { id: team.id, tournamentId: tid, name: team.name },
        "SUSPENDED",
        { reason: duration ? `${reason} (durasi: ${duration})` : reason, ruleBase, relatedPenaltyId: relatedPenalty?.id ?? null },
        actor,
      );
      setMsg({ ok: true, text: `Tim ${team.name} SUSPENDED. Keputusan tercatat di audit log.` });
      setReason("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal." });
    }
    setBusy(false);
  }

  async function reactivate(teamId2: string, name: string) {
    if (!actor || !tid) return;
    const reason = window.prompt(`Alasan mengaktifkan kembali ${name} (wajib):`);
    if (!reason?.trim()) return;
    setBusy(true);
    try {
      await setTeamDisciplineStatus({ id: teamId2, tournamentId: tid, name }, "ACTIVE", { reason: reason.trim(), ruleBase: "Keputusan panitia — pembatalan penangguhan.", relatedPenaltyId: null }, actor);
      setMsg({ ok: true, text: `${name} kembali ACTIVE.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal." });
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHead
        kicker="Disiplin · Penangguhan"
        title="Team Suspension"
        desc="Menangguhkan tim untuk periode tertentu (tidak otomatis menghapus poin — poin hanya berubah lewat sanksi poin atau diskualifikasi). Hanya Super Admin yang memutuskan."
      />
      {msg ? <p className={`text-xs font-bold ${msg.ok ? "text-fs-ok" : "text-fs-err"}`}>{msg.text}</p> : null}

      <BoCard className="fs-cut p-5">
        <h2 className="mb-3 font-display text-base font-black uppercase text-fs-gold">Formulir Penangguhan</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tim">
            <select className="bo-input w-full" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">— pilih tim —</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{statuses.get(t.id) ? ` · ${statuses.get(t.id)}` : ""}</option>
              ))}
            </select>
          </Field>
          <Field label="Durasi (mis. 1 match / sampai match 4)">
            <input className="bo-input w-full" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>
          <Field label="Alasan (wajib)">
            <textarea className="bo-input w-full" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="Dasar peraturan">
            <textarea className="bo-input w-full" rows={2} value={ruleBase} onChange={(e) => setRuleBase(e.target.value)} />
          </Field>
        </div>
        <BoButton
          className="mt-3" variant="yellow" disabled={busy || !teamId || !reason.trim() || !actor || !canDecideHeavy(actor.role)}
          onClick={suspend}
          title={actor && !canDecideHeavy(actor.role) ? "Hanya Super Admin" : ""}
        >
          <PauseCircle className="mr-1 inline h-4 w-4" /> Suspend Tim
        </BoButton>
      </BoCard>

      <BoCard className="fs-cut p-5">
        <h2 className="mb-3 font-display text-base font-black uppercase text-fs-gold">Tim Ditangguhkan ({suspended.length})</h2>
        {suspended.length === 0 ? <Empty text="Tidak ada tim ditangguhkan" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead><tr><Th>Tim</Th><Th>Sejak</Th><Th>Alasan</Th><Th>Dasar</Th><Th>Keputusan oleh</Th><Th>Aksi</Th></tr></thead>
              <tbody>
                {suspended.map((d) => (
                  <tr key={d.id}>
                    <Td><DisciplineStatusBadge status={d.status} /> <span className="ml-1">{d.teamName}</span></Td>
                    <Td>{formatDateTime(d.since)}</Td>
                    <Td>{d.reason}</Td>
                    <Td>{d.ruleBase}</Td>
                    <Td>{d.decidedBy}</Td>
                    <Td>
                      <BoButton className="!px-2 !py-1 !text-[11px]" variant="cyan" disabled={busy || !actor || !canDecideHeavy(actor.role)} onClick={() => reactivate(d.teamId, d.teamName)}>
                        <PlayCircle className="mr-1 inline h-3.5 w-3.5" /> Aktifkan Kembali
                      </BoButton>
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
