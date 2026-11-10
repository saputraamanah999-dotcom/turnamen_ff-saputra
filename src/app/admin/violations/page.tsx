"use client";
// Admin → Violation Management — pencatatan & alur verifikasi pelanggaran.
import { useMemo, useState } from "react";
import { FileWarning, Gavel } from "lucide-react";
import { BoButton, BoCard } from "@/components/common/bo";
import { Empty, PageHead, Td, Th, ViolationStatusBadge } from "@/components/disciplinary/ui";
import { PenaltyForm, ViolationForm } from "@/components/disciplinary/forms";
import { useActiveTournament, useMatches, useTeams } from "@/services/firestore/hooks";
import { useStaffActor, useViolations } from "@/services/disciplinary/useDiscipline";
import { setViolationStatus } from "@/services/disciplinary/store";
import { VIOLATION_CATEGORY_LABEL, type Violation } from "@/lib/disciplinary";
import { formatDateTime } from "@/lib/constants";

export default function ViolationsPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const teamsQ = useTeams(tid, false);
  const matchesQ = useMatches(tid, false);
  const violationsQ = useViolations(tid);
  const actor = useStaffActor();

  const [formOpen, setFormOpen] = useState(true);
  const [penaltyFor, setPenaltyFor] = useState<Violation | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);

  const teams = useMemo(() => (teamsQ.data ?? []).map((t) => ({ id: t.id, name: t.name, tag: t.tag })), [teamsQ.data]);
  const matches = useMemo(() => (matchesQ.data ?? []).map((m) => ({ id: m.id, matchNumber: m.matchNumber, map: m.map })), [matchesQ.data]);
  const list = useMemo(
    () => (violationsQ.data ?? []).filter((v) => filter === "ALL" || v.status === filter),
    [violationsQ.data, filter],
  );

  async function move(v: Violation, status: Parameters<typeof setViolationStatus>[1]) {
    setBusyId(v.id);
    try {
      await setViolationStatus(v, status, actor!, status ? "" : "");
    } catch { /* ditampilkan oleh status berikutnya */ }
    setBusyId(null);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHead
        kicker="Disiplin · Pelanggaran"
        title="Violation Management"
        desc="Catat setiap dugaan pelanggaran lengkap dengan tim, match, pemain, bukti, saksi, dan tingkatannya. Laporan baru berstatus PENDING dan tidak otomatis mengubah leaderboard sampai diverifikasi dan disanksikan."
      >
        <BoButton variant={formOpen ? "black" : "fire"} onClick={() => setFormOpen(!formOpen)}>
          <FileWarning className="h-4 w-4" /> {formOpen ? "Tutup Formulir" : "Laporkan Pelanggaran"}
        </BoButton>
      </PageHead>

      {formOpen ? (
        <BoCard className="fs-cut p-5">
          <h2 className="mb-3 font-display text-base font-black uppercase text-fs-gold">Laporan Pelanggaran Baru</h2>
          <ViolationForm
            tournamentId={tournament?.id ?? ""}
            teams={teams}
            matches={matches}
            actor={actor}
          />
        </BoCard>
      ) : null}

      <BoCard className="fs-cut p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-black uppercase text-fs-gold">Daftar Laporan ({list.length})</h2>
          <select className="bo-input max-w-56" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="ALL">Semua status</option>
            {["PENDING", "UNDER_REVIEW", "VERIFIED", "REJECTED", "SANCTIONED", "APPEALED", "CLOSED"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {list.length === 0 ? (
          <Empty text="Belum ada laporan pelanggaran" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr>
                  <Th>Laporan</Th><Th>Tim</Th><Th>Kategori</Th><Th>Match</Th><Th>Status</Th><Th>Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((v) => (
                  <tr key={v.id} className="align-top">
                    <Td>
                      <p className="font-display text-[12px] font-black">{v.id.slice(0, 8)}</p>
                      <p className="text-[11px] font-semibold text-fs-muted">{formatDateTime(v.createdAt)}</p>
                      <p className="max-w-72 whitespace-pre-wrap text-[12px] text-fs-text/90">{v.description}</p>
                      {v.playerNames ? <p className="text-[11px] text-fs-muted">Pemain: {v.playerNames}</p> : null}
                      {v.witness ? <p className="text-[11px] text-fs-muted">Saksi: {v.witness}</p> : null}
                      <p className="text-[11px] text-fs-muted">Pencatat: {v.reportedBy} · Tingkat: {v.severity}</p>
                      {v.decisionNote ? <p className="text-[11px] text-fs-cyan">Catatan: {v.decisionNote}</p> : null}
                    </Td>
                    <Td>{v.teamNames.join(" & ")}</Td>
                    <Td>{VIOLATION_CATEGORY_LABEL[v.category] ?? v.category}</Td>
                    <Td>{v.matchNumber ? `Match ${v.matchNumber}` : "—"}</Td>
                    <Td>
                      <ViolationStatusBadge status={v.status} />
                      <p className="mt-1 text-[11px] text-fs-muted">Bukti: {v.evidenceCount ?? 0}</p>
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-1">
                        {v.status === "PENDING" ? (
                          <>
                            <BoButton className="!px-2 !py-1 !text-[11px]" variant="cyan" disabled={busyId === v.id} onClick={() => move(v, "UNDER_REVIEW")}>Tinjau</BoButton>
                            <BoButton className="!px-2 !py-1 !text-[11px]" variant="black" disabled={busyId === v.id} onClick={() => move(v, "REJECTED")}>Tolak</BoButton>
                          </>
                        ) : null}
                        {v.status === "UNDER_REVIEW" ? (
                          <>
                            <BoButton className="!px-2 !py-1 !text-[11px]" variant="yellow" disabled={busyId === v.id} onClick={() => move(v, "VERIFIED")}>Verifikasi</BoButton>
                            <BoButton className="!px-2 !py-1 !text-[11px]" variant="black" disabled={busyId === v.id} onClick={() => move(v, "REJECTED")}>Tolak</BoButton>
                          </>
                        ) : null}
                        {v.status === "VERIFIED" ? (
                          <BoButton className="!px-2 !py-1 !text-[11px]" variant="destructive" onClick={() => setPenaltyFor(penaltyFor?.id === v.id ? null : v)}>
                            <Gavel className="mr-1 inline h-3.5 w-3.5" /> Buat Sanksi
                          </BoButton>
                        ) : null}
                        {v.status === "SANCTIONED" ? (
                          <BoButton className="!px-2 !py-1 !text-[11px]" variant="white" disabled={busyId === v.id} onClick={() => move(v, "CLOSED")}>Tutup Kasus</BoButton>
                        ) : null}
                        <a className="bo-btn bo-btn-black !px-2 !py-1 !text-[11px]" href={`/admin/evidence?v=${v.id}`}>Bukti ({v.evidenceCount ?? 0})</a>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BoCard>

      {penaltyFor ? (
        <BoCard className="fs-cut border-fs-err/40 p-5">
          <h2 className="mb-1 font-display text-base font-black uppercase text-fs-err">
            Sanksi untuk laporan {penaltyFor.id.slice(0, 8)} — {penaltyFor.teamNames.join(" & ")}
          </h2>
          <p className="mb-3 text-xs font-semibold text-fs-muted">
            Sanksi yang diterapkan otomatis menghitung ulang leaderboard; yang diusulkan menunggu Scoring Admin.
          </p>
          <PenaltyForm
            tournamentId={tournament?.id ?? ""}
            teams={teams}
            matches={matches}
            actor={actor}
            defaults={{
              teamIds: penaltyFor.teamIds,
              matchId: penaltyFor.matchId ?? "",
              violationId: penaltyFor.id,
              kind: penaltyFor.category === "TEAMING" ? "KILL_REMOVAL" : penaltyFor.category === "NO_SCREENSHOT" || penaltyFor.category === "LATE" ? "ZERO_MATCH" : "POINT",
              points: penaltyFor.category === "OUTSIDE_HELP" || penaltyFor.category === "ROOM_SHARE" ? 10 : 20,
            }}
            onCreated={() => setPenaltyFor(null)}
          />
        </BoCard>
      ) : null}
    </div>
  );
}
