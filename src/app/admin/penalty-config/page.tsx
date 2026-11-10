"use client";
// Admin → Penalty Configuration — ubah konfigurasi sanksi (Super Admin, beralasan & berversi).
import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { BoButton, BoCard } from "@/components/common/bo";
import { Badge, Empty, Field, PageHead, Td, Th } from "@/components/disciplinary/ui";
import { useStaffActor } from "@/services/disciplinary/useDiscipline";
import { loadPenaltyConfig, savePenaltyConfig } from "@/services/disciplinary/store";
import { DEFAULT_PENALTY_CONFIG, type PenaltyConfig } from "@/lib/disciplinary";
import { canDecideHeavy } from "@/lib/disciplinary";
import { formatDateTime } from "@/lib/constants";

export default function PenaltyConfigPage() {
  const actor = useStaffActor();
  const [cfg, setCfg] = useState<PenaltyConfig | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadPenaltyConfig().then(setCfg).catch(() => setCfg(DEFAULT_PENALTY_CONFIG));
  }, []);

  if (!cfg) return <div className="mx-auto max-w-5xl p-8 text-center text-sm font-bold text-fs-muted">Memuat konfigurasi…</div>;

  const num = (v: number) => Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
  const set = (patch: Partial<PenaltyConfig>) => setCfg({ ...cfg, ...patch });

  async function save() {
    if (!actor || !cfg) return;
    setBusy(true);
    setMsg(null);
    try {
      await savePenaltyConfig(cfg, actor, reason);
      setMsg({ ok: true, text: "Konfigurasi tersimpan dengan versi & riwayat baru. Hasil pertandingan lama tidak berubah otomatis — gunakan Hitung Ulang bila memang diputuskan." });
      setReason("");
      loadPenaltyConfig().then(setCfg);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal." });
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHead
        kicker="Disiplin · Konfigurasi"
        title="Penalty Configuration"
        desc={`Nilai default mengikuti juknis §G. Versi aktif: ${cfg.version} (${cfg.isOfficial ? "OFFICIAL JUKNIS" : "KESIMPANAN PANITIA"}). Perubahan wajib beralasan, tercatat identitas & waktunya, dan berversi — tidak mengubah hasil lama secara diam-diam.`}
      />
      {msg ? <p className={`text-xs font-bold ${msg.ok ? "text-fs-ok" : "text-fs-err"}`}>{msg.text}</p> : null}

      <BoCard className="fs-cut p-5">
        <h2 className="mb-3 flex items-center gap-2 font-display text-base font-black uppercase text-fs-gold"><Settings2 className="h-4 w-4" /> Nilai Sanksi</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Teaming — potongan pertama / match"><input className="bo-input w-full" type="number" min={0} value={cfg.teaming.firstPerMatch} onChange={(e) => set({ teaming: { ...cfg.teaming, firstPerMatch: num(Number(e.target.value)) } })} /></Field>
          <Field label="Teaming — pelanggaran ulang / match"><input className="bo-input w-full" type="number" min={0} value={cfg.teaming.repeatPerMatch} onChange={(e) => set({ teaming: { ...cfg.teaming, repeatPerMatch: num(Number(e.target.value)) } })} /></Field>
          <Field label="Teaming — kill ikut dihapus">
            <select className="bo-input w-full" value={cfg.teaming.killRemoval ? "1" : "0"} onChange={(e) => set({ teaming: { ...cfg.teaming, killRemoval: e.target.value === "1" } })}>
              <option value="1">Ya (default juknis)</option><option value="0">Tidak</option>
            </select>
          </Field>
          <Field label="Mengintip/pihak luar — per kejadian"><input className="bo-input w-full" type="number" min={0} value={cfg.outsideHelp.perIncident} onChange={(e) => set({ outsideHelp: { perIncident: num(Number(e.target.value)) } })} /></Field>
          <Field label="Bagi-bagi room — potongan"><input className="bo-input w-full" type="number" min={0} value={cfg.roomShare.first} onChange={(e) => set({ roomShare: { ...cfg.roomShare, first: num(Number(e.target.value)) } })} /></Field>
          <Field label="Ribut — level 1 (lisan)"><input className="bo-input w-full" type="number" min={0} value={cfg.disturbance.levels[0]} onChange={(e) => { const lv = [...cfg.disturbance.levels]; lv[0] = num(Number(e.target.value)); set({ disturbance: { ...cfg.disturbance, levels: lv } }); }} /></Field>
          <Field label="Ribut — level 2 (-poin)"><input className="bo-input w-full" type="number" min={0} value={cfg.disturbance.levels[1]} onChange={(e) => { const lv = [...cfg.disturbance.levels]; lv[1] = num(Number(e.target.value)); set({ disturbance: { ...cfg.disturbance, levels: lv } }); }} /></Field>
          <Field label="Ribut — level 3 (-poin)"><input className="bo-input w-full" type="number" min={0} value={cfg.disturbance.levels[2]} onChange={(e) => { const lv = [...cfg.disturbance.levels]; lv[2] = num(Number(e.target.value)); set({ disturbance: { ...cfg.disturbance, levels: lv } }); }} /></Field>
          <Field label="Kasar — pelanggaran ke-2 (-poin)"><input className="bo-input w-full" type="number" min={0} value={cfg.verbalAbuse.second} onChange={(e) => set({ verbalAbuse: { ...cfg.verbalAbuse, second: num(Number(e.target.value)) } })} /></Field>
          <Field label="Kasar — berulang (-poin)"><input className="bo-input w-full" type="number" min={0} value={cfg.verbalAbuse.repeat} onChange={(e) => set({ verbalAbuse: { ...cfg.verbalAbuse, repeat: num(Number(e.target.value)) } })} /></Field>
          <Field label="Wajib hadir (menit sebelum)"><input className="bo-input w-full" type="number" min={0} value={cfg.late.arriveBeforeMinutes} onChange={(e) => set({ late: { ...cfg.late, arriveBeforeMinutes: num(Number(e.target.value)) } })} /></Field>
          <Field label="Toleransi keterlambatan (menit)"><input className="bo-input w-full" type="number" min={0} value={cfg.late.toleranceMinutes} onChange={(e) => set({ late: { ...cfg.late, toleranceMinutes: num(Number(e.target.value)) } })} /></Field>
        </div>

        <div className="mt-4">
          <Field label="Alasan perubahan (wajib — masuk riwayat versi)">
            <textarea className="bo-input w-full" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. Keputusan rapat panitia 10 Nov: toleransi keterlambatan 15 menit karena jadwal HUT" />
          </Field>
        </div>
        <BoButton className="mt-3" variant="fire" disabled={busy || !actor || !canDecideHeavy(actor.role) || !reason.trim()} onClick={save} title={actor && !canDecideHeavy(actor.role) ? "Hanya Super Admin" : ""}>
          Simpan Konfigurasi Baru
        </BoButton>
        <p className="mt-2 text-[11px] font-semibold text-fs-muted">
          Untuk turnamen yang sedang berjalan, perubahan hanya berlaku setelah keputusan resmi panitia dan diinformasikan kepada peserta (halaman /rules &amp; pengumuman).
        </p>
      </BoCard>

      <BoCard className="fs-cut p-5">
        <h2 className="mb-3 font-display text-base font-black uppercase text-fs-gold">Riwayat Versi ({cfg.history?.length ?? 0})</h2>
        {!cfg.history?.length ? <Empty text="Belum ada perubahan — konfigurasi masih default juknis" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse">
              <thead><tr><Th>Versi</Th><Th>Waktu</Th><Th>Oleh</Th><Th>Alasan</Th></tr></thead>
              <tbody>
                {[...cfg.history].reverse().map((h, i) => (
                  <tr key={i}>
                    <Td><Badge tone="cyan">{h.version}</Badge></Td>
                    <Td>{formatDateTime(h.at)}</Td>
                    <Td>{h.by}</Td>
                    <Td>{h.reason}</Td>
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
