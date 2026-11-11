"use client";
// ============================================================
// STIKAR ESPORTS — Status bridge LOKAL untuk admin dari perangkat MANA PUN
//
// Sumber status:
//  1. bridgeHeartbeats/{tid} (Firestore) — dikirim bridge di laptop produksi
//     tiap 30 detik (Auth anonymous). Bisa dibaca dari HP/tablet admin.
//  2. Probe langsung http://127.0.0.1:8080/api/status — HANYA berhasil bila
//     halaman dibuka di laptop yang menjalankan bridge (localhost dikecualikan
//     dari mixed-content). Dari HP: browser memblokir probe http LAN —
//     jadi hasil negatif dari HP TIDAK berarti bridge mati.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/services/firebase/client";

export interface BridgeHeartbeat {
  tournamentId: string;
  lanIp: string | null;
  gatewayPort: number | null;
  gatewayUp: boolean;
  mediamtxUp: boolean;
  obsConnected: boolean;
  streaming: boolean;
  viewers: number;
  /** epoch ms terakhir bridge melapor */
  updatedAt: number | null;
}

export interface HeartbeatState {
  data: BridgeHeartbeat | null;
  /** detik sejak laporan terakhir; null bila tidak ada data */
  ageSec: number | null;
  /** heartbeat dianggap hidup bila umur < 90 detik */
  fresh: boolean;
}

const FRESH_MS = 90_000;

/** Dengarkan heartbeat bridge secara realtime (onSnapshot) + hitung umur. */
export function useBridgeHeartbeat(tid: string | null): HeartbeatState {
  const [data, setData] = useState<BridgeHeartbeat | null>(null);
  const [tick, setTick] = useState(0); // paksa re-render tiap 5 detik agar umur akurat

  useEffect(() => {
    if (!tid || !db) return;
    const unsub = onSnapshot(
      doc(db, "bridgeHeartbeats", tid),
      (snap) => {
        if (!snap.exists()) {
          setData(null);
          return;
        }
        const d = snap.data() as Partial<BridgeHeartbeat>;
        setData({
          tournamentId: (d.tournamentId as string) ?? tid,
          lanIp: (d.lanIp as string | null) ?? null,
          gatewayPort: (d.gatewayPort as number | null) ?? null,
          gatewayUp: Boolean(d.gatewayUp),
          mediamtxUp: Boolean(d.mediamtxUp),
          obsConnected: Boolean(d.obsConnected),
          streaming: Boolean(d.streaming),
          viewers: Number(d.viewers ?? 0),
          updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : null,
        });
      },
      () => setData(null),
    );
    const iv = setInterval(() => setTick((t) => t + 1), 5000);
    return () => {
      unsub();
      clearInterval(iv);
    };
  }, [tid]);

  const ageSec = useMemo(() => {
    void tick;
    if (!data?.updatedAt) return null;
    return Math.max(0, Math.round((Date.now() - data.updatedAt) / 1000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, tick]);

  const fresh = ageSec != null && ageSec * 1000 < FRESH_MS;
  return { data, ageSec, fresh };
}

export interface GatewayProbe {
  /** true = gateway TERJANGKAU dari device ini */
  ok: boolean;
  /** milidetik respons; ada bila ok */
  ms?: number;
  /** alasan gagal (mis. fetch diblokir mixed-content / gateway mati) */
  reason?: string;
  data?: {
    lanIp?: string | null;
    mediamtx?: boolean;
    viewers?: number;
    gatewayPort?: number;
  };
}

/** Probe SATU KALI gateway lokal. Loopback (127.0.0.1/localhost) — dari laptop bridge saja. */
export async function probeGatewayStatus(port = 8080): Promise<GatewayProbe> {
  const t0 = Date.now();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const data = (await res.json()) as GatewayProbe["data"];
    return { ok: true, ms: Date.now() - t0, data };
  } catch (e) {
    return { ok: false, reason: (e as Error).name === "TimeoutError" ? "timeout" : "tidak terjangkau" };
  }
}

/** Probe berkala gateway lokal (dipakai admin di laptop bridge). */
export function useGatewayProbe(port = 8080, intervalMs = 6000) {
  const [probe, setProbe] = useState<GatewayProbe | null>(null);
  useEffect(() => {
    let alive = true;
    async function run() {
      const r = await probeGatewayStatus(port);
      if (alive) setProbe(r);
    }
    void run();
    const iv = setInterval(() => void run(), intervalMs);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [port, intervalMs]);
  return probe;
}

/** QR code sebagai data URL (client-side, tanpa internet). */
export async function makeQr(text: string): Promise<string | null> {
  try {
    const QRCode = (await import("qrcode")).default;
    return await QRCode.toDataURL(text, { width: 220, margin: 1, color: { dark: "#0B0E14", light: "#FFFFFF" } });
  } catch {
    return null;
  }
}

/** Hook QR: teks berubah → data URL diperbarui. */
export function useQr(text: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!text) {
      setUrl(null);
      return;
    }
    let alive = true;
    void makeQr(text).then((d) => {
      if (alive) setUrl(d);
    });
    return () => {
      alive = false;
    };
  }, [text]);
  return url;
}
