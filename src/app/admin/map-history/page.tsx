"use client";
// /admin/map-history — riwayat pengenalan map oleh AI (§27 master prompt).
// Sumber: event MAP_DETECTED dari service observer-ai (realtime polling).
// Status CONFIRMED / PROBABLE / UNKNOWN berdasar confidence nyata;
// admin dapat mengoreksi map pada dokumen match + audit log.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, RefreshCcw } from "lucide-react";
import { BoBadge, BoButton, BoCard, BoCardLg } from "@/components/common/bo";
import { DataStatusBanner, EmptyState } from "@/components/common/stat";
import { useAdminSession } from "@/services/auth/admin";
import { useActiveTournament, useMatches } from "@/services/firestore/hooks";
import { checkObserverStatus, fetchObserverEvents, type ObserverStatus } from "@/services/observer/client";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { writeAuditLog } from "@/services/scoring/publish";
import { MAP_CATALOG } from "@/lib/constants";
import type { ObserverEvent } from "@/lib/types";

function confidenceStatus(c: number): { label: string; cls: string } {
  if (c >= 0.8) return { label: "CONFIRMED", cls: "bg-emerald-300" };
  if (c >= 0.5) return { label: "PROBABLE", cls: "bg-zb-yellow" };
  return { label: "UNKNOWN", cls: "bg-fs-head/10" };
}

export default function AdminMapHistoryPage() {
  const session = useAdminSession();
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const matches = useMatches(tid);

  const [status, setStatus] = useState<ObserverStatus | null>(null);
  const [events, setEvents] = useState<ObserverEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const s = await checkObserverStatus();
    setStatus(s);
    if (s.online) setEvents(await fetchObserverEvents());
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 10000);
    return () => clearInterval(t);
  }, [refresh]);

  const mapEvents = events.filter((e) => e.type === "MAP_DETECTED");

  /** Koreksi map pada match resmi + audit log (§27: admin dapat mengoreksi). */
  async function correctMap(matchId: string, map: string) {
    if (!tid || !db) return;
    setBusy(true);
    setMsg(null);
    try {
      await updateDoc(doc(db, `tournaments/${tid}/matches/${matchId}`), {
        map,
        updatedAt: Date.now(),
      });
      await writeAuditLog({
        action: "CORRECT_MAP",
        actor: { uid: session.user?.uid ?? "", email: session.user?.email ?? "" },
        targetType: "match",
        targetId: matchId,
        details: { map },
      });
      setMsg(`✅ Map match ${matchId} dikoreksi ke ${map} (tercatat di audit log).`);
    } catch (e) {
      setMsg("❌ " + (e instanceof Error ? e.message : "Gagal mengoreksi map."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black uppercase">Map History</h1>
          <p className="mt-1 text-sm font-semibold text-fs-text/60">
            Pengenalan map oleh AI (label HUD + kalibrasi). Status CONFIRMED/PROBABLE/UNKNOWN
            dihitung dari confidence nyata — tidak pernah dikarang.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BoBadge className={status?.online ? "bg-emerald-300" : "bg-zb-yellow"}>
            {status?.online ? "AI SERVICE ONLINE" : "AI SERVICE OFFLINE"}
          </BoBadge>
          <BoButton variant="white" onClick={() => void refresh()}>
            <RefreshCcw className="h-4 w-4" /> Refresh
          </BoButton>
        </div>
      </div>

      <DataStatusBanner status={matches.status} />
      {msg ? <BoCard className="bg-zb-yellow p-3 text-sm font-bold">{msg}</BoCard> : null}

      {!status?.online ? (
        <EmptyState
          title="Menunggu AI service"
          description="Jalankan observer-ai di laptop produksi untuk mulai mendeteksi map. Riwayat muncul realtime dari endpoint /events."
        />
      ) : (
        <BoCardLg className="overflow-hidden bg-fs-panel">
          <div className="overflow-x-auto thin-scroll">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="bg-fs-head text-white">
                  {["Waktu", "Map Terdeteksi", "Confidence", "Status", "Match Terkait", "Koreksi"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-display text-xs font-black uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mapEvents.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center font-semibold text-fs-text/50">Belum ada event MAP_DETECTED.</td></tr>
                ) : null}
                {mapEvents.slice(0, 12).map((e) => {
                  const st = confidenceStatus(e.confidence);
                  const detected = e.playerName ?? e.reason ?? "UNKNOWN";
                  return (
                    <tr key={e.id} className="border-b-2 border-fs-edge/10">
                      <td className="px-3 py-2 font-bold tabular-nums">{new Date(e.timestamp).toLocaleTimeString("id-ID")}</td>
                      <td className="px-3 py-2 font-bold"><MapPin className="mr-1 inline h-3.5 w-3.5 text-zb-purple" />{detected}</td>
                      <td className="px-3 py-2 tabular-nums">{(e.confidence * 100).toFixed(0)}%</td>
                      <td className="px-3 py-2"><BoBadge className={st.cls}>{st.label}</BoBadge></td>
                      <td className="px-3 py-2 font-semibold text-fs-text/60">{e.matchId ?? "—"}</td>
                      <td className="px-3 py-2">
                        <select
                          className="bo-input !py-1 !text-xs"
                          value=""
                          disabled={busy}
                          onChange={(ev) => {
                            const map = ev.target.value;
                            const matchId = e.matchId || matches.data?.find((m) => m.status === "live")?.id || "";
                            if (map && matchId) void correctMap(matchId, map);
                          }}
                        >
                          <option value="">Koreksi map…</option>
                          {MAP_CATALOG.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </BoCardLg>
      )}

      <p className="text-xs font-semibold text-fs-text/50">
        Riwayat map terhubung ke jadwal match — koreksi admin langsung memperbarui halaman publik
        (realtime listener). Jadwal &amp; map resmi dikelola di <Link className="underline" href="/admin/matches">Match</Link>.
      </p>
    </div>
  );
}
