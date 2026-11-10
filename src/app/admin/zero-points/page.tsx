"use client";
// Admin → Match Zero Points — "MARK AS NO RESULT SCREENSHOT" & keterlambatan.
// HANYA match yang bersangkutan yang menjadi 0 (engine terikat matchId).
import { useMemo, useState } from "react";
import { CameraOff, TimerOff } from "lucide-react";
import { BoButton, BoCard } from "@/components/common/bo";
import { Empty, Field, KindBadge, PageHead, Td, Th } from "@/components/disciplinary/ui";
import { useActiveTournament, useMatches, useTeams } from "@/services/firestore/hooks";
import { usePenalties, useStaffActor } from "@/services/disciplinary/useDiscipline";
import { markZeroMatch } from "@/services/disciplinary/store";
import { canApplyPenalty } from "@/lib/disciplinary";
import { formatDateTime, toDateTimeInputValue } from "@/lib/constants";

export default function ZeroPointsPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const teamsQ = useTeams(tid, false);
  const matchesQ = useMatches(tid, false);
  const penaltiesQ = usePenalties(tid);
  const actor = useStaffActor();

  const [matchId, setMatchId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [cause, setCause] = useState<"NO_SCREENSHOT" | "LATE">("NO_SCREENSHOT");
  const [arrival, setArrival] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const teams = teamsQ.data ?? [];
  const matches = matchesQ.data ?? [];
  const match = matches.find((m) => m.id === matchId) ?? null;
  const list = useMemo(() => (penaltiesQ.data ?? []).filter((p) => p.kind === "ZERO_MATCH"), [penaltiesQ.data]);

  // Match+tim yang sudah 0 — mencegah dobel.
  const zeroed = useMemo(() => new Set(list.filter((p) => p.status === "APPLIED").map((p) => `${p.matchId}|${p.teamIds[0]}`)), [list]);
  const already = matchId && teamId ? zeroed.has(`${matchId}|${teamId}`) : false;

  async function apply() {
    const team = teams.find((t) => t.id === teamId);
    if (!match || !team || !actor || !tid) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await markZeroMatch(tid, { id: match.id, matchNumber: match.matchNumber }, { id: team.id, name: team.name }, cause,
        { arrivalTime: arrival, scheduledAt: scheduled, description }, actor);
      setMsg({ ok: true, text: `${res.code}: poin ${team.name} pada Match ${match.matchNumber} = 0. Leaderboard dihitung ulang — hanya match ini yang berubah.` });
      setDescription(""); setArrival("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal." });
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHead
        kicker="Disiplin · Match 0 Poin"
        title="Match Zero Points"
        desc="Sanksi poin 0 untuk satu tim pada satu match: tidak mengirim screenshot hasil (juknis §E.6) atau terlambat lebih dari 10 menit (juknis §E.1). Engine mengikat sanksi ke matchId — match lain tidak terpengaruh."
      />
      {msg ? <p className={`text-xs font-bold ${msg.ok ? "text-fs-ok" : "text-fs-err"}`}>{msg.text}</p> : null}

      <BoCard className="fs-cut p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-base font-black uppercase text-fs-err">
          <CameraOff className="h-4 w-4" /> Mark As Zero Point
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Match">
            <select className="bo-input w-full" value={matchId} onChange={(e) => setMatchId(e.target.value)}>
              <option value="">— pilih match —</option>
              {matches.map((m) => <option key={m.id} value={m.id}>Match {m.matchNumber}{m.map ? ` · ${m.map}` : ""}{m.resultsPublished ? " · dipublish" : ""}</option>)}
            </select>
          </Field>
          <Field label="Tim">
            <select className="bo-input w-full" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">— pilih tim —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Penyebab">
            <select className="bo-input w-full" value={cause} onChange={(e) => setCause(e.target.value as "NO_SCREENSHOT" | "LATE")}>
              <option value="NO_SCREENSHOT">Tidak mengirim screenshot hasil match</option>
              <option value="LATE">Terlambat lebih dari 10 menit</option>
            </select>
          </Field>
          {cause === "LATE" ? (
            <>
              <Field label="Jadwal pertandingan">
                <input className="bo-input w-full" type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
              </Field>
              <Field label="Waktu kedatangan tim" hint="Alasan sanksi tercatat dari kedua waktu ini (juknis: hadir 15 menit sebelum, toleransi 10 menit).">
                <input className="bo-input w-full" type="datetime-local" value={arrival} onChange={(e) => setArrival(e.target.value)} />
              </Field>
            </>
          ) : null}
        </div>
        <div className="mt-3">
          <Field label="Catatan kejadian (masuk audit log)">
            <input className="bo-input w-full" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="mis. SS tidak diterima di grup sampai pemeriksaan poin" />
          </Field>
        </div>
        {already ? (
          <p className="mt-2 text-xs font-bold text-fs-gold">Tim ini sudah berstatus 0 poin pada match tersebut — tidak bisa dobel.</p>
        ) : null}
        <BoButton
          className="mt-3" variant="destructive" disabled={busy || !matchId || !teamId || already || !actor || !canApplyPenalty(actor.role)}
          onClick={apply}
          title={actor && !canApplyPenalty(actor.role) ? "Hanya Scoring Admin / Super Admin" : ""}
        >
          <TimerOff className="mr-1 inline h-4 w-4" /> MARK AS NO RESULT SCREENSHOT / TERLAMBAT
        </BoButton>
      </BoCard>

      <BoCard className="fs-cut p-5">
        <h2 className="mb-3 font-display text-base font-black uppercase text-fs-gold">Sanksi Match 0 ({list.length})</h2>
        {list.length === 0 ? <Empty text="Belum ada" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead><tr><Th>Kode</Th><Th>Tim</Th><Th>Match</Th><Th>Penyebab</Th><Th>Status</Th><Th>Waktu</Th></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <Td className="font-black">{p.code}</Td>
                    <Td>{p.teamNames.join(", ")}</Td>
                    <Td>{p.matchNumber ? `Match ${p.matchNumber}` : "—"}</Td>
                    <Td>{p.reason}</Td>
                    <Td>{p.status}</Td>
                    <Td>{formatDateTime(p.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.length ? null : null}
      </BoCard>
    </div>
  );
}
