"use client";
// /admin/emergency — mode darurat broadcast (§21 master prompt).
// Menulis field `emergency` pada broadcastSettings — TIDAK pernah
// mengubah skor/hasil resmi. Overlay & display merespons realtime.
import { useEffect, useState } from "react";
import { AlertTriangle, PowerOff, Radio } from "lucide-react";
import { BoBadge, BoButton, BoCard, BoCardLg } from "@/components/common/bo";
import { DataStatusBanner, EmptyState } from "@/components/common/stat";
import { useAdminSession } from "@/services/auth/admin";
import { useActiveTournament, useBroadcast } from "@/services/firestore/hooks";
import { setEmergencyBroadcast } from "@/services/scoring/publish";
import type { BroadcastEmergency } from "@/lib/types";

const PRESETS = [
  { preset: "Technical Difficulties", message: "Kami sedang mengalami kendala teknis. Mohon menunggu sebentar." },
  { preset: "Signal Lost", message: "Sinyal dari lapangan terputus — tim teknis sedang memulihkan koneksi." },
  { preset: "Reconnecting", message: "Koneksi dipulihkan otomatis, tunggu beberapa detik." },
  { preset: "Source Offline", message: "Sumber gameplay sedang offline." },
  { preset: "Match Paused", message: "Match dijeda oleh panitia. Mohon menunggu pengumuman." },
  { preset: "Waiting for Official Results", message: "Menunggu hasil resmi dari panitia." },
  { preset: "Network Problem", message: "Gangguan jaringan pada venue — penayangan sempat terhenti." },
  { preset: "OBS Disconnected", message: "Koneksi OBS Studio terputus — operator sedang reconnect." },
];

export default function AdminEmergencyPage() {
  const session = useAdminSession();
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const broadcast = useBroadcast(tid);

  const [preset, setPreset] = useState(PRESETS[0].preset);
  const [message, setMessage] = useState(PRESETS[0].message);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const active = broadcast.data?.emergency ?? null;

  useEffect(() => {
    if (active) { setPreset(active.preset); setMessage(active.message); }
  }, [active]);

  async function apply(next: BroadcastEmergency | null) {
    if (!tid) return;
    setBusy(true);
    setMsg(null);
    try {
      await setEmergencyBroadcast(tid, next, {
        uid: session.user?.uid ?? "",
        email: session.user?.email ?? "",
      });
      setMsg(next?.active ? "🚨 Emergency AKTIF — overlay & display merespons realtime." : "✅ Emergency dimatikan.");
    } catch (e) {
      setMsg("❌ " + (e instanceof Error ? e.message : "Gagal menyimpan emergency."));
    } finally {
      setBusy(false);
    }
  }

  if (!tid) {
    return (
      <div>
        <h1 className="font-display text-2xl font-black uppercase">Emergency Broadcast</h1>
        <EmptyState title="Belum ada turnamen aktif" description="Emergency bekerja pada dokumen broadcastSettings turnamen." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-black uppercase">Emergency Broadcast Mode</h1>
        <p className="mt-1 text-sm font-semibold text-zb-black/60">
          Tampilkan layar darurat di seluruh penonton (overlay OBS + halaman /display + /live).
          Mode ini <strong>tidak pernah</strong> mengubah skor resmi atau hasil pertandingan.
        </p>
      </div>

      <DataStatusBanner status={broadcast.status} />

      {active?.active ? (
        <BoCard className="flex items-center gap-3 bg-red-100 p-4">
          <AlertTriangle className="h-6 w-6 shrink-0 text-red-600" />
          <div className="flex-1 text-sm font-bold text-red-800">
            EMERGENCY AKTIF: <strong>{active.preset}</strong> — {active.message}
          </div>
          <BoButton variant="black" onClick={() => void apply(null)} disabled={busy}>
            <PowerOff className="h-4 w-4" /> Matikan
          </BoButton>
        </BoCard>
      ) : null}

      <BoCardLg className="bg-white p-5">
        <p className="flex items-center gap-2 font-display text-sm font-black uppercase">
          <Radio className="h-4 w-4 text-zb-red text-red-600" /> Preset Darurat
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.preset}
              onClick={() => { setPreset(p.preset); setMessage(p.message); }}
              className={`bo-badge ${preset === p.preset ? "bg-zb-black text-white" : "bg-white"}`}
            >
              {p.preset}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-xs font-black uppercase tracking-widest text-zb-black/60">Pesan (diedit bila perlu)</label>
        <textarea
          className="bo-input mt-1 min-h-20"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <BoButton
            variant="destructive"
            onClick={() => void apply({ active: true, preset, message: message.trim(), updatedAt: Date.now() })}
            disabled={busy}
          >
            <AlertTriangle className="h-4 w-4" /> Tampilkan Emergency
          </BoButton>
          {msg ? <p className="text-sm font-bold">{msg}</p> : null}
        </div>
      </BoCardLg>

      {/* Preview */}
      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-widest text-zb-black/60">
          Pratinjau layar penonton (realtime — sama dengan yang terlihat penonton):
        </p>
        <div className="bo-grid-bg flex min-h-52 items-center justify-center rounded-sm bg-[#1a0000] p-6 text-center">
          <div>
            <p className="font-display text-4xl font-black uppercase text-red-300">{preset}</p>
            {message.trim() ? <p className="mt-3 text-sm font-semibold text-white/70">{message}</p> : null}
            <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">
              Skor resmi tidak terpengaruh
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs font-semibold text-zb-black/50">
          Overlay OBS: buka <code>/overlay/{tid}/emergency</code> sebagai Browser Source ·
          Display TV: <code>/display</code> otomatis menampilkan layar ini saat aktif.
        </p>
      </div>
    </div>
  );
}
