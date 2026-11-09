"use client";
// /admin/ai-results — alur validasi hasil AI (§26 & §29 master prompt).
// Membaca event NYATA dari service observer-ai lokal (port 8077).
// Service offline → tampil jujur "belum terhubung". Hasil RESMI tetap
// dimasukkan lewat Match → Entri Hasil — AI tidak pernah menerbitkan final.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ListChecks, RefreshCcw, ShieldQuestion, X } from "lucide-react";
import { BoBadge, BoButton, BoCard, BoCardLg } from "@/components/common/bo";
import {
  checkObserverStatus, fetchObserverEvents, getObserverUrl, postObserverAction,
  type ObserverStatus,
} from "@/services/observer/client";
import type { ObserverEvent } from "@/lib/types";

const STEPS = [
  "Deteksi scoreboard akhir pada frame",
  "Screenshot bukti disimpan service AI",
  "OCR teks (nama tim, placement, kill)",
  "Normalisasi nama tim + cocokkan roster",
  "Hitung poin sesuai aturan resmi BOF",
  "Bandingkan dengan event sementara",
  "Kirim CANDIDATE ke panel ini",
  "Admin validasi → approve / reject",
  "Hasil resmi dimasukkan lewat Entri Hasil",
] as const;

export default function AdminAiResultsPage() {
  const [status, setStatus] = useState<ObserverStatus | null>(null);
  const [events, setEvents] = useState<ObserverEvent[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const s = await checkObserverStatus();
    setStatus(s);
    if (s.online) setEvents(await fetchObserverEvents());
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [refresh]);

  async function mark(eventId: string, action: "confirm" | "false-positive") {
    setBusy(true);
    await postObserverAction(`/events/${eventId}/${action}`);
    await refresh();
    setBusy(false);
  }

  // Event yang relevan untuk validasi hasil: eliminasi/kematian/map.
  const candidates = events.filter((e) =>
    ["ELIMINATION_DETECTED", "MULTIPLE_ELIMINATIONS", "MAP_DETECTED", "KILL_FEED_CHANGE"].includes(e.type),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-black uppercase">AI Results Analyzer</h1>
        <p className="mt-1 text-sm font-semibold text-zb-black/60">
          Membaca scoreboard akhir via OCR di laptop produksi. AI <strong>tidak pernah</strong> menerbitkan
          hasil final — semua candidate diperiksa admin di sini, lalu hasil resmi dimasukkan lewat Entri Hasil.
        </p>
      </div>

      {/* Status service — jujur */}
      <BoCard className={`flex flex-wrap items-center gap-3 p-4 ${status?.online ? "bg-emerald-50" : "bg-zb-yellow"}`}>
        {status?.online ? (
          <>
            <BoBadge className="bg-emerald-300">SERVICE ONLINE</BoBadge>
            <span className="text-sm font-bold">
              OCR {status.ocrAvailable ? "tersedia" : "belum siap"} · {status.fps ?? 0} FPS · CPU {status.cpu ?? 0}% · RAM {status.memory ?? 0}% · latensi {status.latencyMs ?? 0}ms
            </span>
          </>
        ) : (
          <>
            <BoBadge className="bg-zb-black text-white">SERVICE BELUM TERHUBUNG</BoBadge>
            <span className="text-sm font-semibold text-zb-black/60">
              Jalankan <code>observer-ai/</code> di laptop produksi (<code>python run.py</code>, port 8077)
              lalu cek ulang. URL: <code>{getObserverUrl()}</code>. Panduan: <Link className="underline" href="/guide/ai-observer">/guide/ai-observer</Link>.
            </span>
          </>
        )}
        <BoButton variant="white" className="ml-auto" onClick={() => void refresh()}>
          <RefreshCcw className="h-4 w-4" /> Cek Ulang
        </BoButton>
      </BoCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Alur 9 langkah */}
        <BoCardLg className="bg-white p-5">
          <p className="flex items-center gap-2 font-display text-sm font-black uppercase">
            <ListChecks className="h-4 w-4 text-zb-blue" /> Alur Validasi Hasil AI
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm font-semibold text-zb-black/70">
            {STEPS.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <p className="mt-3 text-xs font-semibold text-zb-black/50">
            Akurasi OCR tidak pernah dijanjikan 100%: nama tim yang tidak terbaca disimpan UNKNOWN,
            placement tidak jelas ditandai UNKNOWN, dan kill yang tidak cocok dengan scoreboard memunculkan warning.
          </p>
        </BoCardLg>

        {/* Candidate queue */}
        <BoCardLg className="bg-white p-5">
          <p className="font-display text-sm font-black uppercase">Candidate Events (queue realtime)</p>
          {!status?.online ? (
            <p className="mt-3 text-sm font-semibold text-zb-black/50">
              Queue terisi otomatis saat service AI online dan match berjalan.
            </p>
          ) : candidates.length === 0 ? (
            <p className="mt-3 text-sm font-semibold text-zb-black/50">Belum ada candidate — menunggu aktivitas match.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {candidates.slice(0, 8).map((e) => (
                <li key={e.id} className="border-[3px] border-zb-black/15 bg-zb-off px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold">
                      {e.type.replaceAll("_", " ")}
                      {e.playerName ? ` · ${e.playerName}` : ""}
                    </p>
                    <BoBadge className={e.confidence >= 0.75 ? "bg-emerald-300" : e.confidence >= 0.5 ? "bg-zb-yellow" : "bg-zb-black/10"}>
                      conf {(e.confidence * 100).toFixed(0)}%
                    </BoBadge>
                  </div>
                  {e.reason ? <p className="mt-1 text-xs font-semibold text-zb-black/50">{e.reason}</p> : null}
                  <div className="mt-2 flex gap-2">
                    <button className="bo-btn bo-btn-primary !px-2 !py-1 !text-xs" disabled={busy} onClick={() => void mark(e.id, "confirm")}>
                      <Check className="h-3 w-3" /> Confirm
                    </button>
                    <button className="bo-btn bo-btn-white !px-2 !py-1 !text-xs !border-red-400" disabled={busy} onClick={() => void mark(e.id, "false-positive")}>
                      <X className="h-3 w-3" /> False Positive
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 flex items-start gap-1.5 text-xs font-semibold text-zb-black/50">
            <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            Confirm/False-positive dikirim ke service AI lokal (endpoint resmi /events/&#123;id&#125;/…). Klaim skor
            PROVISIONAL — tidak pernah mengubah klasemen resmi.
          </p>
        </BoCardLg>
      </div>

      <BoCard className="bg-zb-yellow p-4 text-sm font-bold">
        Hasil resmi tetap ditentukan manusia: setelah match selesai, buka{" "}
        <Link className="underline" href="/admin/matches">Match → Entri Hasil</Link> → isi placement &amp; kill
        → Publish. Audit log mencatat seluruh aksi validasi AI.
      </BoCard>
    </div>
  );
}
