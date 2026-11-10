// ============================================================
// STIKAR ESPORTS — Formulir bersama modul disiplin.
// ViolationForm (spec §C), PenaltyForm (§D/E), dipakai lintas halaman.
// ============================================================
"use client";

import { useMemo, useState } from "react";
import { BoButton } from "@/components/common/bo";
import { Badge, Field } from "./ui";
import {
  SANCTION_MATRIX,
  VIOLATION_CATEGORY_LABEL,
  type MatchLike,
  type PenaltyKind,
  type TeamLike,
  type ViolationCategory,
  type ViolationSeverity,
} from "@/lib/disciplinary";
import { createPenalty, createViolation, type Actor } from "@/services/disciplinary/store";

const inputCls = "bo-input w-full";

// ============================================================
// VIOLATION FORM
// ============================================================
export function ViolationForm({
  tournamentId, teams, matches, actor, onCreated,
}: {
  tournamentId: string;
  teams: TeamLike[];
  matches: MatchLike[];
  actor: Actor | null;
  onCreated?: (id: string) => void;
}) {
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [matchId, setMatchId] = useState<string>("");
  const [playerNames, setPlayerNames] = useState("");
  const [category, setCategory] = useState<ViolationCategory>("TEAMING");
  const [severity, setSeverity] = useState<ViolationSeverity>("SEDANG");
  const [occurredAt, setOccurredAt] = useState("");
  const [description, setDescription] = useState("");
  const [witness, setWitness] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const match = matches.find((m) => m.id === matchId) ?? null;
  const suggestions = SANCTION_MATRIX[category];

  function toggleTeam(id: string) {
    setTeamIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function submit() {
    if (!actor) { setMsg({ ok: false, text: "Sesi admin tidak ditemukan." }); return; }
    if (!teamIds.length) { setMsg({ ok: false, text: "Pilih minimal satu tim." }); return; }
    if (!description.trim()) { setMsg({ ok: false, text: "Deskripsi kejadian wajib diisi (tidak ada laporan tanpa catatan)." }); return; }
    setBusy(true);
    setMsg(null);
    try {
      const id = await createViolation(tournamentId, {
        teamIds,
        teamNames: teams.filter((t) => teamIds.includes(t.id)).map((t) => t.name),
        matchId: matchId || null,
        matchNumber: match?.matchNumber ?? null,
        playerNames,
        category,
        severity,
        occurredAt,
        description,
        witness,
      }, actor);
      setMsg({ ok: true, text: `Laporan tersimpan (${id.slice(0, 6)}…) — status PENDING. Belum memengaruhi leaderboard.` });
      setTeamIds([]); setPlayerNames(""); setDescription(""); setWitness(""); setOccurredAt("");
      onCreated?.(id);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal menyimpan." });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <Field label="Tim terlibat (bisa lebih dari satu — teaming menghukum semua tim terbukti)">
        <div className="flex flex-wrap gap-1.5">
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTeam(t.id)}
              className={`border px-2 py-1 text-[11px] font-bold transition ${teamIds.includes(t.id) ? "border-fs-fire bg-fs-fire/20 text-fs-text" : "border-fs-edge text-fs-muted hover:text-fs-text"}`}
            >
              {t.name}
            </button>
          ))}
          {teams.length === 0 ? <span className="text-xs text-fs-muted">Belum ada tim.</span> : null}
        </div>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Match keberapa">
          <select className={inputCls} value={matchId} onChange={(e) => setMatchId(e.target.value)}>
            <option value="">— (di luar match tertentu) —</option>
            {matches.map((m) => <option key={m.id} value={m.id}>Match {m.matchNumber}{m.map ? ` · ${m.map}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Kategori pelanggaran">
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as ViolationCategory)}>
            {(Object.keys(VIOLATION_CATEGORY_LABEL) as ViolationCategory[]).map((c) => (
              <option key={c} value={c}>{VIOLATION_CATEGORY_LABEL[c]}</option>
            ))}
          </select>
        </Field>
        <Field label="Pemain yang terlibat">
          <input className={inputCls} value={playerNames} onChange={(e) => setPlayerNames(e.target.value)} placeholder="Nickname pemain, pisahkan koma" />
        </Field>
        <Field label="Waktu kejadian">
          <input className={inputCls} value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} placeholder="mis. 14:20, pertengahan match 2" />
        </Field>
        <Field label="Tingkat pelanggaran">
          <select className={inputCls} value={severity} onChange={(e) => setSeverity(e.target.value as ViolationSeverity)}>
            <option value="RINGAN">RINGAN</option>
            <option value="SEDANG">SEDANG</option>
            <option value="BERAT">BERAT</option>
          </select>
        </Field>
        <Field label="Saksi (jika ada)">
          <input className={inputCls} value={witness} onChange={(e) => setWitness(e.target.value)} placeholder="Nama saksi / panitia pendamping" />
        </Field>
      </div>
      <Field label="Deskripsi kejadian (wajib)">
        <textarea className={inputCls} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Jelaskan kronologi apa adanya — laporan PENDING tidak mengubah poin." />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        {suggestions.map((s, i) => (
          <Badge key={i} tone="cyan">{s.note}</Badge>
        ))}
      </div>
      {msg ? <p className={`text-xs font-bold ${msg.ok ? "text-fs-ok" : "text-fs-err"}`}>{msg.text}</p> : null}
      <BoButton onClick={submit} disabled={busy || !actor} variant="fire">
        {busy ? "Menyimpan…" : "Catat Pelanggaran"}
      </BoButton>
    </div>
  );
}

// ============================================================
// PENALTY FORM
// ============================================================
export function PenaltyForm({
  tournamentId, teams, matches, actor, defaults, onCreated,
}: {
  tournamentId: string;
  teams: TeamLike[];
  matches: MatchLike[];
  actor: Actor | null;
  defaults?: Partial<{ teamIds: string[]; matchId: string; kind: PenaltyKind; points: number; violationId: string | null }>;
  onCreated?: (res: { id: string; status: string }) => void;
}) {
  const [teamIds, setTeamIds] = useState<string[]>(defaults?.teamIds ?? []);
  const [matchId, setMatchId] = useState(defaults?.matchId ?? "");
  const [kind, setKind] = useState<PenaltyKind>(defaults?.kind ?? "POINT");
  const [points, setPoints] = useState(defaults?.points ?? 10);
  const [removeKills, setRemoveKills] = useState(false);
  const [reason, setReason] = useState("");
  const [ruleBase, setRuleBase] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const match = matches.find((m) => m.id === matchId) ?? null;
  const scoped = useMemo(() => kind === "ZERO_MATCH" || kind === "MATCH_EJECTION" || kind === "KILL_REMOVAL" || kind === "SUSPENSION" || kind === "BAN", [kind]);
  const needsMatch = kind === "ZERO_MATCH" || kind === "MATCH_EJECTION" || kind === "KILL_REMOVAL";

  function toggleTeam(id: string) {
    setTeamIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function submit() {
    if (!actor) { setMsg({ ok: false, text: "Sesi admin tidak ditemukan." }); return; }
    if (!teamIds.length) { setMsg({ ok: false, text: "Pilih tim yang dikenai sanksi." }); return; }
    if (needsMatch && !matchId) { setMsg({ ok: false, text: "Sanksi ini wajib terikat pada satu match." }); return; }
    if (!reason.trim()) { setMsg({ ok: false, text: "Tidak ada sanksi tanpa alasan (prinsip §N)." }); return; }
    setBusy(true);
    setMsg(null);
    try {
      const res = await createPenalty(tournamentId, {
        violationId: defaults?.violationId ?? null,
        kind,
        teamIds,
        teamNames: teams.filter((t) => teamIds.includes(t.id)).map((t) => t.name),
        matchId: needsMatch || (scoped && matchId) ? matchId : null,
        matchNumber: match?.matchNumber ?? null,
        points,
        removeKills: kind === "KILL_REMOVAL" ? true : removeKills,
        reason,
        ruleBase,
        evidenceNote,
      }, actor);
      setMsg({
        ok: true,
        text: res.status === "APPLIED"
          ? `Sanksi ${res.id.slice(0, 6)}… DITERAPKAN — leaderboard sudah dihitung ulang otomatis.`
          : `Sanksi ${res.id.slice(0, 6)}… PROPOSED — menunggu Scoring Admin/Super Admin menerapkan.`,
      });
      setReason(""); setRuleBase(""); setEvidenceNote("");
      onCreated?.(res);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal menyimpan sanksi." });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <Field label="Jenis sanksi">
        <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as PenaltyKind)}>
          <option value="POINT">Pengurangan poin</option>
          <option value="KILL_REMOVAL">Kill dihapus + pengurangan poin (teaming)</option>
          <option value="ZERO_MATCH">Poin match = 0</option>
          <option value="MATCH_EJECTION">Dikeluarkan dari match</option>
          <option value="VERBAL">Peringatan lisan</option>
          <option value="WARNING">Peringatan tertulis</option>
          <option value="SUSPENSION">Penangguhan (suspend)</option>
          <option value="BAN">Larangan mengikuti match tertentu</option>
          <option value="DISQUALIFICATION">Diskualifikasi (poin dihapus)</option>
          <option value="EXCLUSION">Dikeluarkan dari lomba</option>
        </select>
      </Field>
      <Field label={kind === "DISQUALIFICATION" ? "Tim (bisa lebih dari satu — semua tim terbukti)" : "Tim dikenai sanksi"}>
        <div className="flex flex-wrap gap-1.5">
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTeam(t.id)}
              className={`border px-2 py-1 text-[11px] font-bold transition ${teamIds.includes(t.id) ? "border-fs-err bg-fs-err/20 text-fs-text" : "border-fs-edge text-fs-muted hover:text-fs-text"}`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={needsMatch ? "Match terkait (wajib)" : "Match terkait (kosong = total turnamen)"}>
          <select className={inputCls} value={matchId} onChange={(e) => setMatchId(e.target.value)}>
            <option value="">— total turnamen —</option>
            {matches.map((m) => <option key={m.id} value={m.id}>Match {m.matchNumber}{m.map ? ` · ${m.map}` : ""}</option>)}
          </select>
        </Field>
        {kind === "POINT" || kind === "KILL_REMOVAL" ? (
          <Field label="Besar pengurangan (poin)">
            <input className={inputCls} type="number" min={0} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
          </Field>
        ) : (
          <Field label="Info tambahan">
            <input className={inputCls} value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)} placeholder="mis. durasi suspend / match yang dilarang" />
          </Field>
        )}
      </div>
      {kind === "POINT" || kind === "KILL_REMOVAL" ? (
        <Field label="Catatan bukti/tambahan">
          <input className={inputCls} value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)} placeholder="rujukan bukti, ID bukti, dsb." />
        </Field>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Alasan (wajib)">
          <textarea className={inputCls} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Kronologi singkat + rujukan laporan pelanggaran" />
        </Field>
        <Field label="Dasar peraturan">
          <textarea className={inputCls} rows={2} value={ruleBase} onChange={(e) => setRuleBase(e.target.value)} placeholder="mis. Juknis §G — Teaming: -20 poin per match" />
        </Field>
      </div>
      {msg ? <p className={`text-xs font-bold ${msg.ok ? "text-fs-ok" : "text-fs-err"}`}>{msg.text}</p> : null}
      <BoButton onClick={submit} disabled={busy || !actor} variant="destructive">
        {busy ? "Menyimpan…" : "Buat Sanksi"}
      </BoButton>
      <p className="text-[11px] font-semibold text-fs-muted">
        {actor && (actor.role === "superadmin" || actor.role === "scoring")
          ? "Peran Anda menerapkan sanksi langsung: leaderboard dihitung ulang otomatis (anti dobel-potong)."
          : "Peran Anda hanya MENGAJUKAN (PROPOSED) — Scoring Admin/Super Admin yang menerapkan."}
      </p>
    </div>
  );
}
