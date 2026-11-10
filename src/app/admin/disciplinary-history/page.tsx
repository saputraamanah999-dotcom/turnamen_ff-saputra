"use client";
// Admin → Disciplinary History — audit log disiplin (create-only, ada filter).
import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { BoCard } from "@/components/common/bo";
import { Empty, Field, PageHead, Td, Th } from "@/components/disciplinary/ui";
import { useDisciplinaryLogs } from "@/services/disciplinary/useDiscipline";
import { formatDateTime } from "@/lib/constants";

export default function DisciplinaryHistoryPage() {
  const logsQ = useDisciplinaryLogs();
  const logs = logsQ.data ?? [];

  const [fTeam, setFTeam] = useState("");
  const [fMatch, setFMatch] = useState("");
  const [fAction, setFAction] = useState("");
  const [fPenalty, setFPenalty] = useState("");
  const [fAdmin, setFAdmin] = useState("");
  const [fDate, setFDate] = useState("");

  const admins = useMemo(() => [...new Set(logs.map((l) => l.actorEmail))], [logs]);
  const actions = useMemo(() => [...new Set(logs.map((l) => l.action))].sort(), [logs]);
  const teams = useMemo(() => [...new Set(logs.map((l) => l.teamName).filter(Boolean))], [logs]);

  const filtered = useMemo(() => logs.filter((l) => {
    if (fTeam && l.teamName !== fTeam) return false;
    if (fMatch && String(l.matchNumber ?? "") !== fMatch) return false;
    if (fAction && l.action !== fAction) return false;
    if (fPenalty && !(l.penaltyId ?? "").includes(fPenalty) && !(l.violationId ?? "").includes(fPenalty)) return false;
    if (fAdmin && l.actorEmail !== fAdmin) return false;
    if (fDate) {
      const d = l.createdAt ? formatDateTime(l.createdAt) : "";
      if (!d.includes(fDate)) return false;
    }
    return true;
  }), [logs, fTeam, fMatch, fAction, fPenalty, fAdmin, fDate]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHead
        kicker="Disiplin · Audit"
        title="Disciplinary History"
        desc="Setiap tindakan admin tercatat: siapa, kapan, data sebelum/sesudah, alasan, ID pelanggaran/sanksi, perubahan poin, dan status keputusan. Log tidak dapat diedit/dihapus oleh admin biasa (rules create-only)."
      />

      <BoCard className="fs-cut p-4">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Tim">
            <select className="bo-input w-full" value={fTeam} onChange={(e) => setFTeam(e.target.value)}>
              <option value="">Semua</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Match">
            <input className="bo-input w-full" value={fMatch} onChange={(e) => setFMatch(e.target.value)} placeholder="mis. 2" />
          </Field>
          <Field label="Jenis tindakan">
            <select className="bo-input w-full" value={fAction} onChange={(e) => setFAction(e.target.value)}>
              <option value="">Semua</option>
              {actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="ID pelanggaran/sanksi">
            <input className="bo-input w-full" value={fPenalty} onChange={(e) => setFPenalty(e.target.value)} placeholder="SANKSI-…" />
          </Field>
          <Field label="Admin">
            <select className="bo-input w-full" value={fAdmin} onChange={(e) => setFAdmin(e.target.value)}>
              <option value="">Semua</option>
              {admins.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Tanggal (mis. 10 Nov)">
            <input className="bo-input w-full" value={fDate} onChange={(e) => setFDate(e.target.value)} />
          </Field>
        </div>
      </BoCard>

      <BoCard className="fs-cut p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-base font-black uppercase text-fs-gold">
          <History className="h-4 w-4" /> {filtered.length} catatan
        </h2>
        {filtered.length === 0 ? <Empty text="Tidak ada catatan sesuai filter" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr><Th>Waktu</Th><Th>Admin</Th><Th>Tindakan</Th><Th>Tim</Th><Th>Rujukan</Th><Th>Δ Poin</Th><Th>Sebelum → Sesudah</Th><Th>Alasan / Keputusan</Th></tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} className="align-top">
                    <Td className="whitespace-nowrap">{formatDateTime(l.createdAt)}</Td>
                    <Td>{l.actorEmail}<p className="text-[11px] text-fs-muted">{l.actorRole}</p></Td>
                    <Td className="font-black">{l.action}</Td>
                    <Td>{l.teamName || "—"}</Td>
                    <Td>
                      {l.violationId ? <p className="text-[11px]">pelanggaran {l.violationId.slice(0, 8)}</p> : null}
                      {l.penaltyId ? <p className="text-[11px]">sanksi {l.penaltyId.slice(0, 8)}</p> : null}
                      {l.matchNumber ? <p className="text-[11px]">match {l.matchNumber}</p> : null}
                    </Td>
                    <Td className={l.pointsDelta ? "font-black text-fs-err" : ""}>{l.pointsDelta ? (l.pointsDelta > 0 ? `+${l.pointsDelta}` : l.pointsDelta) : "0"}</Td>
                    <Td className="max-w-52 break-all text-[11px]">{l.before} → {l.after}</Td>
                    <Td className="max-w-64 text-[11px]">{l.reason}<p className="text-fs-cyan">{l.decision}</p></Td>
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
