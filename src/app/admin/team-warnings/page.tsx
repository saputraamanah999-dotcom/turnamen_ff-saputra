"use client";
// Admin → Team Warnings — penghitung peringatan per tim + eskalasi juknis.
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { BoButton, BoCard } from "@/components/common/bo";
import { Empty, Field, KindBadge, PageHead, Td, Th } from "@/components/disciplinary/ui";
import { useActiveTournament, useTeams } from "@/services/firestore/hooks";
import { usePenalties, useStaffActor } from "@/services/disciplinary/useDiscipline";
import { usePenaltyConfig } from "@/services/disciplinary/useDiscipline";
import { createPenalty } from "@/services/disciplinary/store";
import { formatDateTime } from "@/lib/constants";

export default function TeamWarningsPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const teamsQ = useTeams(tid, false);
  const penaltiesQ = usePenalties(tid);
  const cfgQ = usePenaltyConfig();
  const actor = useStaffActor();

  const [teamId, setTeamId] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const list = penaltiesQ.data ?? [];
  const teams = teamsQ.data ?? [];

  const counter = useMemo(() => {
    const map = new Map<string, { name: string; verbal: number; written: number; points: number; last: number }>();
    for (const p of list) {
      if (p.status !== "APPLIED") continue;
      if (p.kind !== "VERBAL" && p.kind !== "WARNING") continue;
      for (let i = 0; i < p.teamIds.length; i++) {
        const cur = map.get(p.teamIds[i]) ?? { name: p.teamNames[i] ?? "?", verbal: 0, written: 0, points: 0, last: 0 };
        if (p.kind === "VERBAL") cur.verbal += 1; else cur.written += 1;
        cur.points += p.points || 0;
        cur.last = Math.max(cur.last, new Date(p.createdAt as unknown as number).getTime() || 0);
        map.set(p.teamIds[i], cur);
      }
    }
    return [...map.entries()].sort((a, b) => (b[1].verbal + b[1].written) - (a[1].verbal + a[1].written));
  }, [list]);

  const levels = cfgQ.data?.disturbance?.levels ?? [0, 5, 10];

  function escalationText(count: number): string {
    // Juknis §G: Peringatan 1 lisan → ke-2: -5 → ke-3: -10 → lanjut: dikeluarkan dari match.
    const next = count + 1;
    if (next === 1) return "Peringatan 1 (lisan)";
    if (next === 2) return `Peringatan 2: −${levels[1] ?? 5} poin`;
    if (next === 3) return `Peringatan 3: −${levels[2] ?? 10} poin`;
    return "Pelanggaran berlanjut: dikeluarkan dari match";
  }

  async function giveWarning(kind: "VERBAL" | "WARNING") {
    const team = teams.find((t) => t.id === teamId);
    if (!team || !actor || !tid) return;
    const count = counter.find(([id]) => id === teamId)?.[1];
    const total = (count?.verbal ?? 0) + (count?.written ?? 0);
    const levelPoints = total === 1 ? (levels[1] ?? 5) : total >= 2 ? (levels[2] ?? 10) : (levels[0] ?? 0);
    setBusy(true);
    setMsg(null);
    try {
      const res = await createPenalty(tid, {
        violationId: null,
        kind,
        teamIds: [team.id],
        teamNames: [team.name],
        matchId: null,
        matchNumber: null,
        points: kind === "WARNING" ? levelPoints : 0,
        removeKills: false,
        reason: note || `Peringatan ke-${total + 1} (${kind === "VERBAL" ? "lisan" : "tertulis"}).`,
        ruleBase: "Juknis §G — Terlalu ribut / mengganggu ketertiban (peringatan bertingkat).",
        evidenceNote: "",
      }, actor);
      setMsg({ ok: true, text: res.status === "APPLIED" ? `Peringatan tercatat${levelPoints ? ` (−${levelPoints} poin, leaderboard diperbarui)` : ""}.` : "Peringatan diajukan (PROPOSED)." });
      setNote("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal." });
    }
    setBusy(false);
  }

  const history = list.filter((p) => p.kind === "VERBAL" || p.kind === "WARNING");

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHead
        kicker="Disiplin · Peringatan"
        title="Team Warnings"
        desc="Penghitung peringatan berdasarkan tim dan riwayat kejadian (juknis §G: lisan → −5 → −10 → keluar dari match). Peringatan tanpa potongan poin tetap tercatat di audit log."
      />

      {msg ? <p className={`text-xs font-bold ${msg.ok ? "text-fs-ok" : "text-fs-err"}`}>{msg.text}</p> : null}

      <BoCard className="fs-cut p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-base font-black uppercase text-fs-gold">
          <AlertTriangle className="h-4 w-4 text-fs-gold" /> Berikan Peringatan
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tim">
            <select className="bo-input w-full" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">— pilih tim —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Catatan kejadian">
            <input className="bo-input w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. bersorak berlebihan pada match 2" />
          </Field>
        </div>
        {teamId ? (
          <p className="mt-2 text-xs font-bold text-fs-cyan">
            Peringatan berikutnya untuk tim ini: {escalationText(counter.find(([id]) => id === teamId)?.[1] ? (counter.find(([id]) => id === teamId)![1].verbal + counter.find(([id]) => id === teamId)![1].written) : 0)}
          </p>
        ) : null}
        <div className="mt-3 flex gap-2">
          <BoButton variant="yellow" disabled={busy || !teamId || !actor} onClick={() => giveWarning("VERBAL")}>Peringatan Lisan</BoButton>
          <BoButton variant="fire" disabled={busy || !teamId || !actor} onClick={() => giveWarning("WARNING")}>Peringatan + Poin</BoButton>
        </div>
      </BoCard>

      <BoCard className="fs-cut p-5">
        <h2 className="mb-3 font-display text-base font-black uppercase text-fs-gold">Penghitung per Tim</h2>
        {counter.length === 0 ? (
          <Empty text="Belum ada tim dengan peringatan" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead><tr><Th>Tim</Th><Th>Lisan</Th><Th>Tertulis</Th><Th>Total Poin Potongan</Th><Th>Eskalasi Berikutnya</Th></tr></thead>
              <tbody>
                {counter.map(([id, c]) => (
                  <tr key={id}>
                    <Td>{c.name}</Td>
                    <Td>{c.verbal}</Td>
                    <Td>{c.written}</Td>
                    <Td className="text-fs-err">{c.points > 0 ? `−${c.points}` : "0"}</Td>
                    <Td>{escalationText(c.verbal + c.written)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BoCard>

      <BoCard className="fs-cut p-5">
        <h2 className="mb-3 font-display text-base font-black uppercase text-fs-gold">Riwayat Peringatan ({history.length})</h2>
        {history.length === 0 ? <Empty text="Kosong" /> : (
          <ul className="space-y-1.5">
            {history.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 border-b border-fs-edge/40 pb-1.5 text-[12.5px] font-semibold text-fs-text">
                <KindBadge kind={p.kind} />
                <span className="font-black">{p.teamNames.join(" & ")}</span>
                <span className="text-fs-muted">{p.reason}</span>
                <span className="ml-auto text-[11px] text-fs-muted">{formatDateTime(p.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </BoCard>
    </div>
  );
}
