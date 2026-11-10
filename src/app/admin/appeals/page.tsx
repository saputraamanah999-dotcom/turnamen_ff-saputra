"use client";
// Admin → Appeals & Objections — keberatan ketua tim (juknis §E.8).
import { useMemo, useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import { BoButton, BoCard } from "@/components/common/bo";
import { AppealStatusBadge, Empty, Field, PageHead, Td, Th } from "@/components/disciplinary/ui";
import { useActiveTournament, useMatches, useTeams } from "@/services/firestore/hooks";
import { useAppeals, usePenalties, useStaffActor } from "@/services/disciplinary/useDiscipline";
import { createAppeal, reviewAppeal } from "@/services/disciplinary/store";
import { canDecideHeavy } from "@/lib/disciplinary";
import { penaltySummary } from "@/services/disciplinary/engine";
import { formatDateTime } from "@/lib/constants";

export default function AppealsPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const teamsQ = useTeams(tid, false);
  const matchesQ = useMatches(tid, false);
  const penaltiesQ = usePenalties(tid);
  const appealsQ = useAppeals(tid);
  const actor = useStaffActor();

  const [teamId, setTeamId] = useState("");
  const [captain, setCaptain] = useState("");
  const [matchNumber, setMatchNumber] = useState("");
  const [penaltyId, setPenaltyId] = useState("");
  const [reason, setReason] = useState("");
  const [extra, setExtra] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});

  const teams = teamsQ.data ?? [];
  const matches = matchesQ.data ?? [];
  const applied = (penaltiesQ.data ?? []).filter((p) => p.status !== "CANCELLED");
  const list = appealsQ.data ?? [];
  const openCount = list.filter((a) => a.status === "SUBMITTED" || a.status === "UNDER_REVIEW").length;

  const selectedPenalty = useMemo(() => applied.find((p) => p.id === penaltyId) ?? null, [applied, penaltyId]);

  async function submit() {
    if (!actor || !tid) return;
    const team = teams.find((t) => t.id === teamId);
    if (!team) { setMsg({ ok: false, text: "Pilih tim." }); return; }
    setBusy(true);
    setMsg(null);
    try {
      await createAppeal(tid, {
        teamId: team.id,
        teamName: team.name,
        captainName: captain,
        matchNumber: matchNumber ? Number(matchNumber) : (selectedPenalty?.matchNumber ?? null),
        penaltyId: penaltyId || null,
        penaltySummary: selectedPenalty ? penaltySummary(selectedPenalty) : "Keputusan panitia",
        reason,
        extraEvidenceNote: extra,
      }, actor);
      setMsg({ ok: true, text: "Keberatan tercatat (SUBMITTED) — diperiksa panitia." });
      setReason(""); setExtra(""); setPenaltyId("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal." });
    }
    setBusy(false);
  }

  async function review(id: string, action: "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "CLOSED") {
    const appeal = list.find((a) => a.id === id);
    if (!appeal || !actor) return;
    if (action === "ACCEPTED") {
      const ok = window.confirm("Terima keberatan? Sanksi terkait akan DIBATALKAN, poin dihitung ulang, riwayat tetap tersimpan.");
      if (!ok) return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await reviewAppeal(appeal, action, reviewNote[id] ?? "", actor);
      setMsg({ ok: true, text: `Keberatan ${id.slice(0, 6)} → ${action}${action === "ACCEPTED" ? " — sanksi dibatalkan & leaderboard dihitung ulang." : "."}` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal." });
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHead
        kicker="Disiplin · Keberatan"
        title="Appeals & Objections"
        desc={`Sesuai juknis §E.8: keberatan disampaikan ketua tim kepada panitia secara sopan setelah match selesai. ${openCount} keberatan menunggu tindak lanjut. Keberatan diterima = sanksi dibatalkan + poin dihitung ulang + alasan tersimpan; riwayat sanksi lama tidak dihapus.`}
      />
      {msg ? <p className={`text-xs font-bold ${msg.ok ? "text-fs-ok" : "text-fs-err"}`}>{msg.text}</p> : null}

      <BoCard className="fs-cut p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-base font-black uppercase text-fs-gold">
          <MessageSquareWarning className="h-4 w-4" /> Catat Keberatan
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tim (oleh ketua tim)">
            <select className="bo-input w-full" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">— pilih tim —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Nama ketua tim (pengaju)">
            <input className="bo-input w-full" value={captain} onChange={(e) => setCaptain(e.target.value)} />
          </Field>
          <Field label="Sanksi yang dipermasalahkan">
            <select className="bo-input w-full" value={penaltyId} onChange={(e) => setPenaltyId(e.target.value)}>
              <option value="">— (umum / belum spesifik) —</option>
              {applied.map((p) => (
                <option key={p.id} value={p.id}>{p.code} · {p.teamNames.join(" & ")} · Match {p.matchNumber ?? "all"}</option>
              ))}
            </select>
          </Field>
          <Field label="Match (opsional, override)">
            <select className="bo-input w-full" value={matchNumber} onChange={(e) => setMatchNumber(e.target.value)}>
              <option value="">— ikut sanksi —</option>
              {matches.map((m) => <option key={m.id} value={m.matchNumber}>Match {m.matchNumber}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Alasan keberatan (wajib)">
            <textarea className="bo-input w-full" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="Bukti tambahan">
            <textarea className="bo-input w-full" rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="ID bukti, tautan, saksi…" />
          </Field>
        </div>
        <BoButton className="mt-3" variant="fire" disabled={busy || !teamId || !captain.trim() || !reason.trim() || !actor} onClick={submit}>
          Simpan Keberatan
        </BoButton>
      </BoCard>

      <BoCard className="fs-cut p-5">
        <h2 className="mb-3 font-display text-base font-black uppercase text-fs-gold">Daftar Keberatan ({list.length})</h2>
        {list.length === 0 ? <Empty text="Belum ada keberatan" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead><tr><Th>Keberatan</Th><Th>Tim</Th><Th>Sanksi</Th><Th>Alasan</Th><Th>Status</Th><Th>Tindak Lanjut</Th></tr></thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id} className="align-top">
                    <Td>
                      <p className="font-display text-[12px] font-black">{a.id.slice(0, 8)}</p>
                      <p className="text-[11px] text-fs-muted">{formatDateTime(a.createdAt)}</p>
                      <p className="text-[11px] text-fs-muted">Ketua: {a.captainName}</p>
                      {a.matchNumber ? <p className="text-[11px] text-fs-muted">Match {a.matchNumber}</p> : null}
                    </Td>
                    <Td>{a.teamName}</Td>
                    <Td>{a.penaltySummary}{a.extraEvidenceNote ? <p className="text-[11px] text-fs-cyan">Bukti tambahan: {a.extraEvidenceNote}</p> : null}</Td>
                    <Td><p className="max-w-64 whitespace-pre-wrap text-[12px]">{a.reason}</p></Td>
                    <Td>
                      <AppealStatusBadge status={a.status} />
                      {a.reviewNote ? <p className="mt-1 text-[11px] text-fs-muted">{a.reviewNote}</p> : null}
                      {a.reviewedBy ? <p className="text-[11px] text-fs-muted">oleh {a.reviewedBy}</p> : null}
                    </Td>
                    <Td>
                      <div className="flex w-56 flex-col gap-1">
                        <input
                          className="bo-input !py-1 !text-[11px]" placeholder="Catatan peninjauan"
                          value={reviewNote[a.id] ?? ""}
                          onChange={(e) => setReviewNote({ ...reviewNote, [a.id]: e.target.value })}
                        />
                        <div className="flex flex-wrap gap-1">
                          {a.status === "SUBMITTED" ? (
                            <BoButton className="!px-2 !py-1 !text-[10px]" variant="cyan" disabled={busy} onClick={() => review(a.id, "UNDER_REVIEW")}>Tinjau</BoButton>
                          ) : null}
                          {a.status !== "ACCEPTED" && a.status !== "CLOSED" ? (
                            <>
                              <BoButton className="!px-2 !py-1 !text-[10px]" variant="yellow" disabled={busy || !actor || !canDecideHeavy(actor.role)} onClick={() => review(a.id, "ACCEPTED")} title="Terima = batalkan sanksi + hitung ulang (Super Admin)">Terima</BoButton>
                              <BoButton className="!px-2 !py-1 !text-[10px]" variant="black" disabled={busy} onClick={() => review(a.id, "REJECTED")}>Tolak</BoButton>
                              <BoButton className="!px-2 !py-1 !text-[10px]" variant="white" disabled={busy} onClick={() => review(a.id, "CLOSED")}>Tutup</BoButton>
                            </>
                          ) : null}
                        </div>
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
