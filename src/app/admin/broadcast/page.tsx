"use client";
// ============================================================
// /admin/broadcast — Broadcast Control Center
// Hanya mengaktifkan kontrol yang benar-benar terhubung.
// ============================================================

import { useEffect, useRef, useState } from "react";
import {
  Copy, MonitorPlay, Plug, PlugZap, RefreshCw, Save, Settings2, Tv, Wifi,
} from "lucide-react";
import { BoBadge, BoButton, BoCard } from "@/components/common/bo";
import { useActiveTournament, useBroadcast } from "@/services/firestore/hooks";
import {
  autoConnectBridge, bootstrapBridge, buildStreamUrls, connectBridge, disconnectBridge, getBridgeToken, getBridgeUrl,
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
  const [chosenIp, setChosenIp] = useState<string | null>(null);
  const [autoFill, setAutoFill] = useState(true);
  const lastAutoSaved = useRef<string>("");

  useEffect(() => {
    setUrl(getBridgeUrl());
    setToken(getBridgeToken());
    try { if (localStorage.getItem("stikar.broadcast.autofill") === "off") setAutoFill(false); } catch { /* abaikan */ }
    return subscribeBridge((s) => {
      setBridge(s);
      // Hasil deteksi otomatis: tampilkan URL & token yang dipakai.
      if (s.bootstrap) {
        setUrl(getBridgeUrl());
        setToken(getBridgeToken());
      }
    });
  }, []);

  useEffect(() => {
    if (broadcast.data) setSettings(broadcast.data);
  }, [broadcast.data]);

  useEffect(() => {
    void autoConnectBridge();
    return () => disconnectBridge();
  }, []);

  // ---------- Deteksi jaringan otomatis ----------
  const detectedIp = chosenIp ?? bridge.lanIp ?? null;
  const gwPort = bridge.gatewayPort ?? bridge.bootstrap?.gatewayPort ?? 8080;
  const streamPath = bridge.bootstrap?.mediamtxPath ?? "bof-main";
  const suggested = detectedIp ? buildStreamUrls(detectedIp, gwPort, streamPath) : null;

  /** Terapkan URL hasil deteksi ke form (dan simpan ke Firestore bila diminta). */
  async function applyDetected(opts: { forceMode?: boolean; silent?: boolean } = {}) {
    if (!suggested || !tid || !db) return;
    const patch: Partial<BroadcastSettings> = {
      hlsUrl: suggested.hlsUrl,
      wheUrl: suggested.wheUrl,
      whipUrl: suggested.whipUrl,
      localGatewayUrl: suggested.localGatewayUrl,
      ...(opts.forceMode ? { streamMode: "mediamtx" as StreamMode } : {}),
    };
    setSettings((cur) => ({ ...cur, ...patch }));
    try {
      await setDoc(
        doc(db, `broadcastSettings/${tid}`),
        { ...patch, tournamentId: tid, updatedAt: serverTimestamp() },
        { merge: true },
      );
      if (!opts.silent) toast({ title: "URL siaran terisi otomatis", description: suggested.localGatewayUrl });
    } catch (e) {
      if (!opts.silent) toast({ title: "Gagal menyimpan", description: String((e as Error).message ?? e), variant: "destructive" });
    }
  }

  // Mode MediaMTX + IP terdeteksi + URL tersimpan berbeda → perbarui otomatis (sekali per kombinasi).
  useEffect(() => {
    if (!autoFill || !suggested || !broadcast.data || broadcast.data.streamMode !== "mediamtx") return;
    const saved = broadcast.data;
    const same =
      saved.hlsUrl === suggested.hlsUrl && saved.wheUrl === suggested.wheUrl &&
      saved.whipUrl === suggested.whipUrl && saved.localGatewayUrl === suggested.localGatewayUrl;
    const key = `${suggested.localGatewayUrl}|${streamPath}`;
    if (same || lastAutoSaved.current === key) return;
    lastAutoSaved.current = key;
    void applyDetected({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFill, suggested?.localGatewayUrl, broadcast.data?.streamMode, broadcast.data?.hlsUrl, broadcast.data?.wheUrl, broadcast.data?.whipUrl, broadcast.data?.localGatewayUrl]);

  function toggleAutoFill(v: boolean) {
    setAutoFill(v);
    try { localStorage.setItem("stikar.broadcast.autofill", v ? "on" : "off"); } catch { /* abaikan */ }
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast({ title: "Disalin", description: text }); } catch { /* abaikan */ }
  }

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
      <p className="mt-1 text-sm font-semibold text-fs-text/60">
        Pusat produksi siaran — OBS, overlay, dan streaming. Kontrol hanya aktif saat service
        benar-benar terhubung.
      </p>

      {/* Jaringan terdeteksi otomatis */}
      <BoCard className="mt-4 bg-fs-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-base font-black uppercase">
            <Wifi className="h-4 w-4" /> Jaringan Terdeteksi Otomatis
          </h2>
          <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider">
            <input type="checkbox" checked={autoFill} onChange={(e) => toggleAutoFill(e.target.checked)} />
            Isi URL stream otomatis
          </label>
        </div>
        {suggested ? (
          <>
            <ul className="mt-3 space-y-2 text-sm font-bold">
              <li className="flex flex-wrap items-center gap-2">
                IP laptop: <span className="font-stat text-fs-cyan">{detectedIp}</span>
                {bridge.bootstrap?.interface ? <span className="text-xs text-fs-text/50">({bridge.bootstrap.interface})</span> : null}
              </li>
              <li className="flex flex-wrap items-center gap-2">
                MediaMTX:
                <BoBadge className={bridge.mediamtx ? "bg-emerald-300" : "bg-zb-yellow"}>{bridge.mediamtx ? "BERJALAN" : "BELUM JALAN"}</BoBadge>
              </li>
              <li className="flex flex-wrap items-center gap-2">
                Link TV / HP penonton:
                <code className="font-mono text-xs">{suggested.displayUrl}</code>
                <BoButton variant="white" className="!px-2 !py-1 !text-[11px]" onClick={() => void copy(suggested.displayUrl)}>
                  <Copy className="h-3 w-3" /> Salin
                </BoButton>
              </li>
            </ul>
            {(bridge.bootstrap?.lanIps?.length ?? 0) > 1 ? (
              <label className="mt-3 block text-[11px] font-black uppercase tracking-wider">
                Beberapa jaringan ditemukan — pilih yang dipakai HP/TV penonton
                <select className="bo-input mt-1" value={detectedIp ?? ""} onChange={(e) => setChosenIp(e.target.value)}>
                  {bridge.bootstrap!.lanIps.map((i) => (
                    <option key={`${i.name}-${i.address}`} value={i.address}>
                      {i.address} — {i.name}{i.virtual ? " (virtual)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <BoButton variant="primary" className="!px-3 !py-2 !text-xs" disabled={!tid} onClick={() => void applyDetected({ forceMode: true })}>
                <Wifi className="h-3.5 w-3.5" /> Pakai jaringan ini (isi &amp; simpan otomatis)
              </BoButton>
            </div>
            {!(settings.streamMode === "mediamtx") ? (
              <p className="mt-2 text-[11px] font-semibold text-fs-text/50">
                Mode stream belum MediaMTX — tombol di atas sekaligus mengaturnya.
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-3 text-sm font-semibold text-fs-text/60">
            Belum terdeteksi. Jalankan <code>start-bridge.bat</code> di laptop produksi, lalu buka halaman ini
            di <b>browser laptop yang sama</b> (Chrome bisa menampilkan izin &ldquo;akses jaringan lokal&rdquo; — pilih Izinkan).
            IP, token, dan URL stream akan terisi sendiri.
          </p>
        )}
      </BoCard>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Status OBS via bridge */}
        <BoCard className="bg-fs-panel p-5">
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
              <BoBadge className={bridge.obsConnected ? "bg-emerald-300" : "bg-fs-panel"}>
                {bridge.obsConnected ? `TERHUBUNG ${bridge.obsVersion ?? ""}` : "TIDAK TERHUBUNG"}
              </BoBadge>
            </li>
            <li>Scene aktif: <span className="text-fs-fire">{bridge.currentScene ?? "—"}</span></li>
            {typeof bridge.viewers === "number" ? (
              <li>Perangkat gateway: <BoBadge className="bg-fs-cyan/15 text-fs-cyan">{bridge.viewers} NYATA</BoBadge></li>
            ) : null}
            <li>Stream output: <BoBadge className={bridge.streaming ? "bg-[#e5484d] text-white" : "bg-fs-panel"}>{bridge.streaming ? "ON AIR" : "OFF"}</BoBadge></li>
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
            <BoButton variant="black" className="!px-3 !py-2 !text-xs" onClick={async () => {
              disconnectBridge();
              const info = await bootstrapBridge();
              if (!info) { setBridgeUrl(url); setBridgeToken(token); } // bukan laptop bridge → pakai isian manual
              setUrl(getBridgeUrl());
              setToken(getBridgeToken());
              connectBridge();
            }}>
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
            <p className="mt-3 text-xs font-semibold text-fs-text/50">
              Kontrol scene belum tersedia — jalankan <code>broadcast-bridge/</code> di laptop
              produksi (localhost only) lalu tekan Hubungkan Ulang. Panduan: documentation/OBS_SETUP.md
            </p>
          )}
        </BoCard>

        {/* Pengaturan stream */}
        <BoCard className="bg-fs-panel p-5">
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
              <>
                <label className="block text-[11px] font-black uppercase tracking-wider">
                  URL HLS (LAN / publik)
                  <input className="bo-input mt-1" value={settings.hlsUrl ?? ""} onChange={(e) => setSettings({ ...settings, hlsUrl: e.target.value })} placeholder="http://IP-LAPTOP:8080/hls/bof-main/index.m3u8" />
                </label>
                <label className="block text-[11px] font-black uppercase tracking-wider">
                  URL WHE — WebRTC playback (latensi rendah)
                  <input className="bo-input mt-1 font-mono" value={settings.wheUrl ?? ""} onChange={(e) => setSettings({ ...settings, wheUrl: e.target.value })} placeholder="http://IP-LAPTOP:8080/mediamtx/bof-main/whe" />
                </label>
                <label className="block text-[11px] font-black uppercase tracking-wider">
                  URL WHIP — tujuan publish dari Live Control
                  <input className="bo-input mt-1 font-mono" value={settings.whipUrl ?? ""} onChange={(e) => setSettings({ ...settings, whipUrl: e.target.value })} placeholder="http://127.0.0.1:8080/mediamtx/bof-main/whip" />
                </label>
                <p className="text-[11px] font-semibold text-fs-text/50">
                  Alur resmi PHASE 2: capture browser (Live Control) → WHIP → MediaMTX → WHE/HLS ke TV & penonton.
                  Gateway lokal (port 8080) mem-proxy MediaMTX agar bebas masalah CORS. Port 8078 khusus WebSocket bridge.
                </p>
              </>
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
            <span className="text-[11px] font-bold uppercase tracking-wider text-fs-text/40">
              <Settings2 className="inline h-3.5 w-3.5" /> Kunci stream TIDAK disimpan di sini
            </span>
          </div>
        </BoCard>
      </div>
    </div>
  );
}
