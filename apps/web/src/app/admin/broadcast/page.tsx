"use client";
// ============================================================
// /admin/broadcast — Broadcast Control Center
// Hanya mengaktifkan kontrol yang benar-benar terhubung.
// ============================================================

import { useEffect, useState } from "react";
import {
  MonitorPlay, Plug, PlugZap, RefreshCw, Save, Settings2, Tv,
} from "lucide-react";
import { BoBadge, BoButton, BoCard } from "@/components/common/bo";
import { useActiveTournament, useBroadcast } from "@/services/firestore/hooks";
import {
  connectBridge, disconnectBridge, getBridgeToken, getBridgeUrl,
  sendBridgeCommand, setBridgeToken, setBridgeUrl, subscribeBridge, type BridgeState,
} from "@/services/broadcast/bridge";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { useAdminSession } from "@/services/auth/admin";
import { useToast } from "@/hooks/use-toast";
import type { BroadcastSettings, StreamMode } from "@/lib/types";

export default function AdminBroadcastPage() {
  const { tournament } = useActiveTournament();
  const tid = tournament?.id ?? null;
  const broadcast = useBroadcast(tid, false);
  const session = useAdminSession();
  const { toast } = useToast();

  const [bridge, setBridge] = useState<BridgeState>({ connected: false, obsConnected: false });
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [settings, setSettings] = useState<Partial<BroadcastSettings>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUrl(getBridgeUrl());
    setToken(getBridgeToken());
    return subscribeBridge((s) => setBridge(s));
  }, []);

  useEffect(() => {
    if (broadcast.data) setSettings(broadcast.data);
  }, [broadcast.data]);

  useEffect(() => {
    connectBridge();
    return () => disconnectBridge();
  }, []);

  async function saveSettings() {
    if (!tid || !db) return;
    setBusy(true);
    try {
      await setDoc(
        doc(db, `broadcastSettings/${tid}`),
        { ...settings, tournamentId: tid, updatedAt: serverTimestamp() },
        { merge: true },
      );
      toast({ title: "Pengaturan broadcast tersimpan" });
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: String((e as Error).message ?? e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-black uppercase">Broadcast Control</h1>
      <p className="mt-1 text-sm font-semibold text-zb-black/60">
        Pusat produksi siaran — OBS, overlay, dan streaming. Kontrol hanya aktif saat service
        benar-benar terhubung.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Status OBS via bridge */}
        <BoCard className="bg-white p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-black uppercase">
            <MonitorPlay className="h-4 w-4" /> OBS (via Broadcast Bridge)
          </h2>
          <ul className="mt-3 space-y-2 text-sm font-bold">
            <li className="flex items-center gap-2">
              Bridge:
              <BoBadge className={bridge.connected ? "bg-emerald-300" : "bg-zb-yellow"}>
                {bridge.connected ? "TERHUBUNG" : "TIDAK TERHUBUNG"}
              </BoBadge>
            </li>
            <li className="flex items-center gap-2">
              OBS Studio:
              <BoBadge className={bridge.obsConnected ? "bg-emerald-300" : "bg-white"}>
                {bridge.obsConnected ? `TERHUBUNG ${bridge.obsVersion ?? ""}` : "TIDAK TERHUBUNG"}
              </BoBadge>
            </li>
            <li>Scene aktif: <span className="text-zb-blue">{bridge.currentScene ?? "—"}</span></li>
            <li>Stream output: <BoBadge className={bridge.streaming ? "bg-[#e5484d] text-white" : "bg-white"}>{bridge.streaming ? "ON AIR" : "OFF"}</BoBadge></li>
          </ul>
          {bridge.message ? <p className="mt-2 text-xs font-bold text-amber-700">{bridge.message}</p> : null}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] font-black uppercase tracking-wider">
              URL Bridge
              <input className="bo-input mt-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="ws://127.0.0.1:8078" />
            </label>
            <label className="text-[11px] font-black uppercase tracking-wider">
              Token Bridge
              <input className="bo-input mt-1" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="token dari .env bridge" />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <BoButton variant="black" className="!px-3 !py-2 !text-xs" onClick={() => { setBridgeUrl(url); setBridgeToken(token); disconnectBridge(); connectBridge(); }}>
              <PlugZap className="h-3.5 w-3.5" /> Hubungkan Ulang
            </BoButton>
            <BoButton variant="white" className="!px-3 !py-2 !text-xs" disabled={!bridge.connected} onClick={() => sendBridgeCommand("getScenes")}>
              <RefreshCw className="h-3.5 w-3.5" /> Muat Scene
            </BoButton>
          </div>

          {bridge.connected && bridge.obsConnected && bridge.scenes?.length ? (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-black uppercase tracking-wider">Ganti Scene (whitelist)</p>
              <div className="flex flex-wrap gap-2">
                {bridge.scenes.map((s) => (
                  <BoButton
                    key={s}
                    variant={bridge.currentScene === s ? "black" : "cyan"}
                    className="!px-3 !py-1.5 !text-[11px]"
                    onClick={() => sendBridgeCommand("switchScene", { scene: s })}
                  >
                    {s}
                  </BoButton>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs font-semibold text-zb-black/50">
              Kontrol scene belum tersedia — jalankan <code>broadcast-bridge/</code> di laptop
              produksi (localhost only) lalu tekan Hubungkan Ulang. Panduan: documentation/OBS_SETUP.md
            </p>
          )}
        </BoCard>

        {/* Pengaturan stream */}
        <BoCard className="bg-white p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-black uppercase">
            <Tv className="h-4 w-4" /> Sumber Video Publik
          </h2>
          <div className="mt-3 space-y-3">
            <label className="block text-[11px] font-black uppercase tracking-wider">
              Mode Stream
              <select
                className="bo-input mt-1"
                value={settings.streamMode ?? "offline"}
                onChange={(e) => setSettings({ ...settings, streamMode: e.target.value as StreamMode })}
              >
                <option value="offline">Offline (belum menyiarkan)</option>
                <option value="youtube">YouTube Live (publik)</option>
                <option value="mediamtx">MediaMTX (LAN sekolah)</option>
              </select>
            </label>
            {(settings.streamMode ?? "offline") === "youtube" ? (
              <label className="block text-[11px] font-black uppercase tracking-wider">
                YouTube Video ID (bukan stream key!)
                <input className="bo-input mt-1" value={settings.youtubeVideoId ?? ""} onChange={(e) => setSettings({ ...settings, youtubeVideoId: e.target.value })} placeholder="mis. jfKfPfyJRdk" />
              </label>
            ) : null}
            {(settings.streamMode ?? "offline") === "mediamtx" ? (
              <label className="block text-[11px] font-black uppercase tracking-wider">
                URL HLS (LAN)
                <input className="bo-input mt-1" value={settings.hlsUrl ?? ""} onChange={(e) => setSettings({ ...settings, hlsUrl: e.target.value })} placeholder="http://IP-LAPTOP:8888/stream/index.m3u8" />
              </label>
            ) : null}
            <label className="block text-[11px] font-black uppercase tracking-wider">
              Judul Stream
              <input className="bo-input mt-1" value={settings.streamTitle ?? ""} onChange={(e) => setSettings({ ...settings, streamTitle: e.target.value })} />
            </label>
            <label className="block text-[11px] font-black uppercase tracking-wider">
              Pengumuman (pisahkan dengan baris baru)
              <textarea
                className="bo-input h-24 py-2"
                value={(settings.announcements ?? []).join("\n")}
                onChange={(e) => setSettings({ ...settings, announcements: e.target.value.split("\n").filter(Boolean) })}
              />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <BoButton variant="primary" onClick={saveSettings} disabled={busy || !tid}>
              <Save className="h-4 w-4" /> {busy ? "Menyimpan…" : "Simpan Pengaturan"}
            </BoButton>
            <span className="text-[11px] font-bold uppercase tracking-wider text-zb-black/40">
              <Settings2 className="inline h-3.5 w-3.5" /> Kunci stream TIDAK disimpan di sini
            </span>
          </div>
        </BoCard>
      </div>
    </div>
  );
}
