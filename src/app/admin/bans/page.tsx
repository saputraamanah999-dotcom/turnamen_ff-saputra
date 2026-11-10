"use client";
// Admin → Team Ban & Disqualification — pusat status tim (spec §F).
// Satu laporan TIDAK otomatis ban; DQ harus lewat keputusan Super Admin tercatat.
import { useMemo, useState } from "react";
import { Gavel, ShieldBan } from "lucide-react";
import { BoButton, BoCard } from "@/components/common/bo";
import { DisciplineStatusBadge, Empty, Field, PageHead, Td, Th } from "@/components/disciplinary/ui";
import { useActiveTournament, useTeams } from "@/services/firestore/hooks";
import { usePenalties, useStaffActor, useTeamDisciplines } from "@/services/disciplinary/useDiscipline";
import { setTeamDisciplineStatus } from "@/services/disciplinary/store";
import { canDecideHeavy, type DisciplineStatus, type TeamDiscipline } from "@/lib/disciplinary";
import { formatDateTime } from "@/lib/constants";

const STATUSES: DisciplineStatus[] = ["REGISTERED", "VERIFIED", "ACTIVE", "WARNING", "SUSPENDED", "BANNED", "DISQUALIFIED", "WITHDRAWN"];

export default function BansPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const teamsQ = useTeams(tid, false);
  const disciplinesQ = useTeamDisciplines();
  const penaltiesQ = usePenalties(tid);
  const actor = useStaffActor();

  const [teamId, setTeamId] = useState("");
  const [status, setStatus] = useState<DisciplineStatus>("DISQUALIFIED");
  const [reason, setReason] = useState("");
  const [ruleBase, setRuleBase] = useState("Juknis §G — Cheat, hack, bug, atau joki: diskualifikasi dan poin dihapus.");
  const [evidence, setEvidence] = useState("");
  const [matchScope, setMatchScope] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const teams = teamsQ.data ?? [];
  const discMap = useMemo(() => {
    const m = new Map<string, TeamDiscipline>();
    for (const d of disciplinesQ.data ?? []) m.set(d.teamId, d);
    return m;
  }, [disciplinesQ.data]);
  const penaltiesFor = (teamId2: string) => (penaltiesQ.data ?? []).filter((p) => p.teamIds.includes(teamId2) && p.status !== "CANCELLED");

  async function decide() {
    const team = teams.find((t) => t.id === teamId);
    if (!team || !actor || !tid) return;
    setBusy(true);
    setMsg(null);
    try {
      await setTeamDisciplineStatus(
        { id: team.id, tournamentId: tid, name: team.name },
        status,
        {
          reason: [reason, evidence ? `Bukti: ${evidence}` : "", matchScope ? `Match terkait: ${matchScope}` : "", note ? `Catatan panitia: ${note}` : ""].filter(Boolean).join(" · "),
          ruleBase,
          relatedPenaltyId: penaltiesFor(team.id)[0]?.id ?? null,
        },
        actor,
      );
      setMsg({ ok: true, text: `${team.name} → ${status}. ${status === "DISQUALIFIED" || status === "BANNED" ? "Seluruh poin tim dihapus (juknis §G) dan leaderboard dihitung ulang." : "Keputusan tercatat."}` });
      setReason(""); setEvidence(""); setNote("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal." });
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHead
        kicker="Disiplin · Status Tim"
        title="Team Ban & Disqualification"
        desc="Kelola status seluruh tim: peringatan, penangguhan, larangan match, dikeluarkan, didiskualifikasi, mundur, atau diaktifkan kembali. Diskualifikasi menghapus seluruh poin tim sesuai juknis dan WAJIB lewat keputusan Super Admin yang tercatat."
      />
      {msg ? <p className={`text-xs font-bold ${msg.ok ? "text-fs-ok" : "text-fs-err"}`}>{msg.text}</p> : null}

      <BoCard className="fs-cut p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-base font-black uppercase text-fs-err">
          <Gavel className="h-4 w-4" /> Formulir Keputusan
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tim yang dikenai sanksi">
            <select className="bo-input w-full" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">— pilih tim —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{discMap.get(t.id) ? ` · ${discMap.get(t.id)!.status}` : ""}</option>)}
            </select>
          </Field>
          <Field label="Jenis keputusan">
            <select className="bo-input w-full" value={status} onChange={(e) => setStatus(e.target.value as DisciplineStatus)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Alasan (wajib — tidak ada sanksi tanpa alasan)">
            <textarea className="bo-input w-full" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="Dasar peraturan">
            <textarea className="bo-input w-full" rows={2} value={ruleBase} onChange={(e) => setRuleBase(e.target.value)} />
          </Field>
          <Field label="Bukti (rujukan ID bukti / laporan)">
            <input className="bo-input w-full" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="mis. bukti SANKSI-7K2X / screenshot grup" />
          </Field>
          <Field label="Match terkait">
            <input className="bo-input w-full" value={matchScope} onChange={(e) => setMatchScope(e.target.value)} placeholder="mis. Match 3 (kosong = seluruh turnamen)" />
          </Field>
          <Field label="Durasi (bila suspend/ban)">
            <input className="bo-input w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. sampai akhir turnamen" />
          </Field>
          <Field label="Disetujui oleh">
            <input className="bo-input w-full" value={actor?.email ?? ""} disabled />
          </Field>
        </div>
        <BoButton
          className="mt-3" variant="destructive" disabled={busy || !teamId || !reason.trim() || !actor || !canDecideHeavy(actor.role)}
          onClick={decide}
          title={actor && !canDecideHeavy(actor.role) ? "Hanya Super Admin yang berwenang memutuskan ban/DQ" : ""}
        >
          <ShieldBan className="mr-1 inline h-4 w-4" /> Simpan Keputusan
        </BoButton>
        {status === "DISQUALIFIED" ? (
          <p className="mt-2 text-[11px] font-bold text-fs-err">
            Catatan: satu laporan belum cukup — pastikan verifikasi bukti selesai. Poin akan dihapus otomatis oleh engine (bukan edit manual), dan keputusan tersimpan di riwayat tim.
          </p>
        ) : null}
      </BoCard>

      <BoCard className="fs-cut p-5">
        <h2 className="mb-3 font-display text-base font-black uppercase text-fs-gold">Status Seluruh Tim ({teams.length})</h2>
        {teams.length === 0 ? <Empty text="Belum ada tim" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead><tr><Th>Tim</Th><Th>Status Disiplin</Th><Th>Alasan Terakhir</Th><Th>Sanksi Aktif</Th><Th>Riwayat</Th></tr></thead>
              <tbody>
                {teams.map((t) => {
                  const d = discMap.get(t.id);
                  const pen = penaltiesFor(t.id);
                  return (
                    <tr key={t.id}>
                      <Td className="font-black">{t.name}</Td>
                      <Td><DisciplineStatusBadge status={(d?.status ?? "REGISTERED") as DisciplineStatus} /></Td>
                      <Td>{d?.reason ?? "—"}</Td>
                      <Td>{pen.length ? `${pen.length} sanksi` : "—"}</Td>
                      <Td>
                        {d?.history?.length
                          ? d.history.slice(-3).reverse().map((h, i) => (
                            <p key={i} className="text-[11px] text-fs-muted">
                              {formatDateTime(h.at)}: {h.from} → {h.to} ({h.by})
                            </p>
                          ))
                          : "—"}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </BoCard>
    </div>
  );
}
