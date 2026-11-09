"use client";
// ============================================================
// /admin/observer — AI OBSERVER ASSISTANT
// Terhubung ke service lokal Python (127.0.0.1:8077).
// Semua event hanya indikasi — operator konfirmasi manual.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { Cpu, Check, X, Eye, Gauge } from "lucide-react";
import { BoBadge, BoButton, BoCard } from "@/components/common/bo";
import {
  checkObserverStatus, fetchObserverEvents, getObserverUrl, postObserverAction,
  setObserverUrl, type ObserverStatus,
} from "@/services/observer/client";
import type { ObserverEvent } from "@/lib/types";
import { formatTime } from "@/lib/constants";

export default function AdminObserverPage() {
  const [status, setStatus] = useState<ObserverStatus | null>(null);
  const [events, setEvents] = useState<ObserverEvent[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const s = await checkObserverStatus();
    setStatus(s);
    if (s.online) setEvents(await fetchObserverEvents());
  }, []);

  useEffect(() => {
    const init = setTimeout(() => setUrl(getObserverUrl()), 0);
    const first = setTimeout(() => void refresh(), 0);
    const t = setInterval(() => void refresh(), 8000);
    return () => {
      clearTimeout(init);
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);

  return (
    <div>
      <h1 className="font-display text-2xl font-black uppercase">AI Observer Assistant</h1>
      <p className="mt-1 text-sm font-semibold text-zb-black/60">
        Asisten observasi lokal — hanya menganalisis frame yang terlihat. Event AI adalah
        indikasi berbobot confidence dan TIDAK pernah mengubah skor resmi.
      </p>

      {/* Status */}
      <BoCard className="mt-4 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Cpu className="h-6 w-6 text-zb-purple" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-black uppercase">
              Service Lokal (127.0.0.1:8077 default)
            </p>
            <p className="text-xs font-bold text-zb-black/50">
              Jalankan di laptop produksi: <code>observer-ai/</code> → venv → <code>python run.py</code>
            </p>
          </div>
          <BoBadge className={status?.online ? "bg-emerald-300" : "bg-zb-yellow"}>
            {status?.online ? "ONLINE" : "OFFLINE"}
          </BoBadge>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <Metric label="OCR" value={status?.ocrAvailable ? "Tersedia" : status?.online ? "Tidak tersedia" : "—"} />
          <Metric label="Sampling" value={status?.fps ? `${status.fps} FPS` : "—"} />
          <Metric label="CPU" value={status?.cpu != null ? `${status.cpu.toFixed(0)}%` : "—"} />
          <Metric label="Latensi" value={status?.latencyMs != null ? `${status.latencyMs} ms` : "—"} />
        </div>

        <div className="mt-3 flex gap-2">
          <input className="bo-input flex-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:8077" />
          <BoButton variant="black" className="!px-4" onClick={() => { setObserverUrl(url); void refresh(); }}>
            <Gauge className="h-4 w-4" /> Simpan &amp; Cek
          </BoButton>
          <BoButton variant="white" onClick={() => void refresh()} disabled={busy}>
            Refresh
          </BoButton>
        </div>
        {status?.message ? (
          <p className="mt-2 text-xs font-bold text-amber-700">{status.message}</p>
        ) : null}
      </BoCard>

      {/* Rekomendasi + Timeline */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <BoCard className="bg-white p-5">
          <h2 className="font-display text-base font-black uppercase">Event Timeline</h2>
          {!status?.online ? (
            <p className="mt-3 text-sm font-semibold text-zb-black/50">
              Service offline — turnamen tetap berjalan normal tanpa AI. Entri hasil manual tetap tersedia.
            </p>
          ) : events.length === 0 ? (
            <p className="mt-3 text-sm font-semibold text-zb-black/50">Belum ada event terdeteksi.</p>
          ) : (
            <ul className="thin-scroll mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
              {events.slice().reverse().map((ev) => (
                <li key={ev.id} className="bo-card-flat flex flex-wrap items-center gap-2 bg-zb-off px-3 py-2 text-xs">
                  <span className="font-mono font-bold text-zb-black/50">{formatTime(ev.timestamp)}</span>
                  <BoBadge className={confidenceColor(ev.confidence)}>{(ev.confidence * 100).toFixed(0)}%</BoBadge>
                  <span className="font-black">{ev.type}</span>
                  {ev.playerName ? <span className="text-zb-black/60">{ev.playerName}</span> : null}
                  <span className="ml-auto text-zb-black/40">{ev.reason?.slice(0, 60) ?? ""}</span>
                  <span className="flex gap-1.5">
                    <button
                      className="bo-btn bo-btn-cyan !px-2 !py-1 !text-[10px]"
                      title="Konfirmasi event"
                      onClick={async () => { await postObserverAction(`/events/${ev.id}/confirm`); void refresh(); }}
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      className="bo-btn !px-2 !py-1 !text-[10px] !bg-white"
                      title="Tandai false positive"
                      onClick={async () => { await postObserverAction(`/events/${ev.id}/false-positive`); void refresh(); }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </BoCard>

        <BoCard className="bg-white p-5">
          <h2 className="font-display text-base font-black uppercase">Rekomendasi Target Observasi</h2>
          {!status?.online ? (
            <p className="mt-3 text-sm font-semibold text-zb-black/50">Menunggu service lokal online.</p>
          ) : (
            <p className="mt-3 text-sm font-semibold text-zb-black/50">
              Rekomendasi dihitung dari event HIGH/MEDIUM/LOW (aktivitas kill feed, indikasi
              elimination, genggaman spectator). Operator tetap yang memindahkan kamera spectator
              di dalam game — AI tidak mengendalikan input game.
            </p>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-zb-black/40">
            <Eye className="h-3.5 w-3.5" /> PRIVASI: frame dianalisis lokal; tidak diunggah ke internet.
          </p>
        </BoCard>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bo-card-flat bg-zb-off px-3 py-2 text-center">
      <p className="text-[10px] font-black uppercase tracking-widest text-zb-black/50">{label}</p>
      <p className="font-display text-sm font-black">{value}</p>
    </div>
  );
}

function confidenceColor(c: number) {
  if (c >= 0.7) return "bg-emerald-300";
  if (c >= 0.4) return "bg-zb-yellow";
  return "bg-zb-off";
}
