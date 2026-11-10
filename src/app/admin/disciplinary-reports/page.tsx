"use client";
// Admin → Disciplinary Reports — ringkasan otomatis + export CSV & cetak PDF.
import { useMemo, useRef } from "react";
import { FileDown, Printer } from "lucide-react";
import { BoButton, BoCard } from "@/components/common/bo";
import { Empty, Kpi, PageHead, Td, Th } from "@/components/disciplinary/ui";
import { useActiveTournament } from "@/services/firestore/hooks";
import { useAppeals, useDisciplinaryLogs, usePenalties, useViolations } from "@/services/disciplinary/useDiscipline";
import { VIOLATION_CATEGORY_LABEL, type ViolationCategory } from "@/lib/disciplinary";
import { formatDateTime } from "@/lib/constants";

export default function DisciplinaryReportsPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const violationsQ = useViolations(tid);
  const penaltiesQ = usePenalties(tid);
  const appealsQ = useAppeals(tid);
  const logsQ = useDisciplinaryLogs();
  const printRef = useRef<HTMLDivElement>(null);

  const violations = violationsQ.data ?? [];
  const penalties = penaltiesQ.data ?? [];
  const appeals = appealsQ.data ?? [];
  const logs = (logsQ.data ?? []).filter((l) => !tid || !l.teamId || true); // log global

  const stats = useMemo(() => {
    const applied = penalties.filter((p) => p.status === "APPLIED");
    const byCategory = new Map<string, number>();
    for (const v of violations) byCategory.set(v.category, (byCategory.get(v.category) ?? 0) + 1);
    const teamsViolated = new Set<string>();
    for (const v of violations) v.teamIds.forEach((t) => teamsViolated.add(t));
    const teamsPenalized = new Set<string>();
    for (const p of applied) p.teamIds.forEach((t) => teamsPenalized.add(t));
    return {
      totalViolations: violations.length,
      pending: violations.filter((v) => v.status === "PENDING" || v.status === "UNDER_REVIEW").length,
      sanctioned: violations.filter((v) => v.status === "SANCTIONED").length,
      totalDeducted: applied.reduce((a, p) => a + (p.points || 0), 0),
      zeroMatches: applied.filter((p) => p.kind === "ZERO_MATCH").length,
      warnings: applied.filter((p) => p.kind === "VERBAL" || p.kind === "WARNING").length,
      suspensions: applied.filter((p) => p.kind === "SUSPENSION").length,
      dqs: applied.filter((p) => p.kind === "DISQUALIFICATION" || p.kind === "EXCLUSION").length,
      topCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0] ?? null,
      teamsViolated: teamsViolated.size,
      teamsPenalized: teamsPenalized.size,
      appealsOpen: appeals.filter((a) => a.status === "SUBMITTED" || a.status === "UNDER_REVIEW").length,
      appealsAccepted: appeals.filter((a) => a.status === "ACCEPTED").length,
      appealsRejected: appeals.filter((a) => a.status === "REJECTED").length,
    };
  }, [violations, penalties, appeals]);

  function exportCsv() {
    const rows: string[][] = [
      ["LAPORAN DISIPLIN — BATTLE OFF FRIENDS"],
      ["Turnamen", tid ?? "-"],
      ["Dibuat", formatDateTime(Date.now())],
      [],
      ["Ringkasan"],
      ["Total pelanggaran", String(stats.totalViolations)],
      ["Menunggu proses (PENDING/REVIEW)", String(stats.pending)],
      ["Ter-sanksikan", String(stats.sanctioned)],
      ["Tim dengan pelanggaran", String(stats.teamsViolated)],
      ["Tim dengan sanksi aktif", String(stats.teamsPenalized)],
      ["Kategori terbanyak", stats.topCategory ? `${VIOLATION_CATEGORY_LABEL[stats.topCategory[0] as ViolationCategory]} (${stats.topCategory[1]})` : "-"],
      ["Total poin dikurangi", String(stats.totalDeducted)],
      ["Sanksi match 0", String(stats.zeroMatches)],
      ["Peringatan", String(stats.warnings)],
      ["Suspend", String(stats.suspensions)],
      ["Diskualifikasi/keluar", String(stats.dqs)],
      ["Keberatan terbuka/diterima/ditolak", `${stats.appealsOpen}/${stats.appealsAccepted}/${stats.appealsRejected}`],
      [],
      ["DAFTAR SANKSI"],
      ["Kode", "Tim", "Jenis", "Match", "Poin", "Status", "Alasan", "Dasar aturan", "Diajukan", "Disetujui", "Waktu"],
      ...penalties.map((p) => [p.code, p.teamNames.join(" & "), p.kind, p.matchNumber ? String(p.matchNumber) : "TOTAL", String(p.points), p.status, p.reason, p.ruleBase, p.proposedBy, p.approvedBy || "-", formatDateTime(p.createdAt)]),
      [],
      ["DAFTAR PELANGGARAN"],
      ["ID", "Tim", "Kategori", "Match", "Status", "Pencatat", "Deskripsi"],
      ...violations.map((v) => [v.id.slice(0, 8), v.teamNames.join(" & "), v.category, v.matchNumber ? String(v.matchNumber) : "-", v.status, v.reportedBy, v.description.replace(/\n/g, " ")]),
      [],
      ["RIWAYAT KEPUTUSAN (AUDIT)"],
      ["Waktu", "Admin", "Tindakan", "Tim", "Sanksi", "ΔPoin", "Alasan"],
      ...logs.slice(0, 300).map((l) => [formatDateTime(l.createdAt), l.actorEmail, l.action, l.teamName || "-", l.penaltyId?.slice(0, 8) ?? "-", String(l.pointsDelta), l.reason]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `laporan-disiplin-bof-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function printPdf() {
    printRef.current?.focus();
    window.print();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="no-print">
        <PageHead
          kicker="Disiplin · Laporan"
          title="Disciplinary Reports"
          desc="Ringkasan otomatis dari data nyata (pelanggaran, sanksi, keberatan, audit). Export CSV untuk arsip panitia; cetak/simpan PDF untuk dokumen resmi."
        >
          <BoButton variant="cyan" onClick={exportCsv}><FileDown className="h-4 w-4" /> Export CSV</BoButton>
          <BoButton variant="white" onClick={printPdf}><Printer className="h-4 w-4" /> Cetak / PDF</BoButton>
        </PageHead>
      </div>

      <div ref={printRef} tabIndex={-1} className="space-y-4 outline-none print:space-y-2">
        <BoCard className="fs-cut p-5">
          <h2 className="mb-1 font-display text-xl font-black uppercase text-fs-gold">Laporan Disiplin — {tournament?.name ?? "BATTLE OFF FRIENDS"}</h2>
          <p className="text-[11px] font-bold uppercase tracking-wider text-fs-muted">Dibuat {formatDateTime(Date.now())} · Sumber: database nyata (bukan input manual)</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Total Pelanggaran" value={stats.totalViolations} tone="fire" />
            <Kpi label="Menunggu Proses" value={stats.pending} tone="gold" />
            <Kpi label="Ter-sanksikan" value={stats.sanctioned} tone="red" />
            <Kpi label="Poin Dikurangi" value={stats.totalDeducted} tone="red" />
            <Kpi label="Peringatan" value={stats.warnings} tone="gold" />
            <Kpi label="Sanksi Match 0" value={stats.zeroMatches} tone="red" />
            <Kpi label="Suspend" value={stats.suspensions} tone="gold" />
            <Kpi label="Diskualifikasi" value={stats.dqs} tone="red" />
          </div>
          <div className="mt-3 grid gap-2 text-[12.5px] font-semibold text-fs-text sm:grid-cols-2">
            <p>Tim dengan pelanggaran: <strong>{stats.teamsViolated}</strong> · dengan sanksi aktif: <strong>{stats.teamsPenalized}</strong></p>
            <p>Kategori terbanyak: <strong>{stats.topCategory ? `${VIOLATION_CATEGORY_LABEL[stats.topCategory[0] as ViolationCategory]} (${stats.topCategory[1]} laporan)` : "—"}</strong></p>
            <p>Keberatan: terbuka <strong>{stats.appealsOpen}</strong> · diterima <strong>{stats.appealsAccepted}</strong> · ditolak <strong>{stats.appealsRejected}</strong></p>
          </div>
        </BoCard>

        <BoCard className="fs-cut p-5">
          <h2 className="mb-3 font-display text-base font-black uppercase text-fs-gold">Riwayat Keputusan (audit terbaru)</h2>
          {logs.length === 0 ? <Empty text="Belum ada aktivitas disiplin" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead><tr><Th>Waktu</Th><Th>Admin</Th><Th>Tindakan</Th><Th>Tim</Th><Th>ΔPoin</Th><Th>Keputusan</Th></tr></thead>
                <tbody>
                  {logs.slice(0, 40).map((l) => (
                    <tr key={l.id}>
                      <Td className="whitespace-nowrap">{formatDateTime(l.createdAt)}</Td>
                      <Td>{l.actorEmail}</Td>
                      <Td className="font-black">{l.action}</Td>
                      <Td>{l.teamName || "—"}</Td>
                      <Td>{l.pointsDelta || "0"}</Td>
                      <Td>{l.decision || l.reason || "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </BoCard>
      </div>
    </div>
  );
}
