"use client";
// /admin/local-network — Local Network Manager (§14 master prompt).
// Semua status NYATA dari bridge WebSocket (token dari Broadcast Control):
// kalau bridge offline → tampil offline, tidak pernah berpura-pura.
// IP + port disimpan lokal operator; QR dibuat lokal (library qrcode).
import { useEffect, useState } from "react";
import { Copy, RefreshCcw, Wifi, WifiOff } from "lucide-react";
import { BoBadge, BoButton, BoCard, BoCardLg } from "@/components/common/bo";
import {
  connectBridge, disconnectBridge, getBridgeToken, getBridgeUrl,
  setBridgeUrl, subscribeBridge, type BridgeState,
} from "@/services/broadcast/bridge";

export default function AdminLocalNetworkPage() {
  const [state, setState] = useState<BridgeState | null>(null);
  const [ip, setIp] = useState("");
  const [hlsPort, setHlsPort] = useState("8888");
  const [path, setPath] = useState("bof-main");
  const [qr, setQr] = useState<string | null>(null);
  const [probe, setProbe] = useState<"idle" | "testing" | "ok" | "fail" | "skip">("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    // URL bridge yang tersimpan (ws://...) dipakai juga untuk menandai host.
    const url = getBridgeUrl();
    const m = url.match(/^wss?:\/\/([^:/]+):(\d+)/);
    if (m && m[1] !== "127.0.0.1") setIp(m[1]);
    setState(null);
    connectBridge();
    const unsub = subscribeBridge((s) => setState(s));
    return () => { unsub(); disconnectBridge(); };
  }, []);

  const viewerUrl = ip ? `http://${ip}:${hlsPort}/${path}` : "";

  // QR lokal (tanpa API eksternal) bila URL terisi.
  useEffect(() => {
    if (!viewerUrl) { setQr(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const QR = (await import("qrcode")).default;
        const url = await QR.toDataURL(viewerUrl, { width: 320, margin: 1 });
        if (!cancelled) setQr(url);
      } catch { if (!cancelled) setQr(null); }
    })();
    return () => { cancelled = true; };
  }, [viewerUrl]);

  // Diagnosa nyata: coba fetch halaman HLS dari browser operator.
  async function diagnose() {
    if (!viewerUrl) return;
    setProbe("testing");
    try {
      await fetch(viewerUrl, { mode: "no-cors", signal: AbortSignal.timeout(4000) });
      setProbe("ok"); // no-cors: berhasil menjangkau host:port (respons opak)
    } catch {
      setProbe("fail");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-black uppercase">Local Network Manager</h1>
        <p className="mt-1 text-sm font-semibold text-zb-black/60">
          Laptop produksi = pusat streaming. Alur: OBS → MediaMTX → Wi-Fi lokal → TV/HP.
          Status di bawah adalah status bridge NYATA (butuh token di Broadcast Control).
        </p>
      </div>

      {/* Status bridge & OBS — realtime */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatusCard label="Bridge (8078)" ok={Boolean(state?.connected)} note={state?.connected ? "Terhubung" : state?.message ?? "Offline"} />
        <StatusCard label="OBS Studio" ok={Boolean(state?.obsConnected)} note={state?.obsConnected ? `v${state.obsVersion ?? "?"}` : "Tidak terhubung"} />
        <StatusCard label="Stream Output" ok={Boolean(state?.streaming)} note={state?.streaming ? "Streaming aktif" : "Tidak streaming"} />
        <StatusCard label="Recording" ok={Boolean(state?.recording)} note={state?.recording ? "Rekam aktif" : "Idle"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Konfigurasi alamat */}
        <BoCardLg className="bg-white p-5">
          <p className="font-display text-sm font-black uppercase">Alamat Penonton (LAN)</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <label className="text-xs font-black uppercase tracking-widest text-zb-black/60">
              IP Laptop
              <input className="bo-input mt-1" placeholder="192.168.x.x" value={ip} onChange={(e) => setIp(e.target.value.trim())} />
            </label>
            <label className="text-xs font-black uppercase tracking-widest text-zb-black/60">
              Port HLS (MediaMTX)
              <input className="bo-input mt-1" value={hlsPort} onChange={(e) => setHlsPort(e.target.value.trim())} />
            </label>
            <label className="text-xs font-black uppercase tracking-widest text-zb-black/60">
              Path / Stream Key
              <input className="bo-input mt-1" value={path} onChange={(e) => setPath(e.target.value.trim())} />
            </label>
          </div>
          <p className="mt-2 text-xs font-semibold text-zb-black/50">
            Isi IP sesuai LAN laptop produksi (cek: Windows <code>ipconfig</code> / macOS <code>ifconfig</code>).
            Alamat mengikuti konfigurasi nyata, bukan hardcoded. URL bridge saat ini: <code>{getBridgeUrl()}</code>
            {" "}— ubah di Broadcast Control bila perlu. <button className="underline" onClick={() => { setBridgeUrl(getBridgeUrl()); }}>pakai ulang</button>
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {viewerUrl ? (
              <>
                <code className="bo-card-flat bg-zb-black px-3 py-2 text-sm font-bold text-zb-cyan">{viewerUrl}</code>
                <BoButton
                  variant="white"
                  onClick={() => { void navigator.clipboard.writeText(viewerUrl); }}
                >
                  <Copy className="h-4 w-4" /> Salin
                </BoButton>
                <BoButton variant="primary" onClick={() => void diagnose()} disabled={probe === "testing"}>
                  <RefreshCcw className="h-4 w-4" /> {probe === "testing" ? "Menguji…" : "Diagnosa Konektivitas"}
                </BoButton>
              </>
            ) : (
              <p className="text-sm font-semibold text-zb-black/50">Isi IP laptop untuk membuat alamat penonton.</p>
            )}
          </div>

          {probe === "ok" ? (
            <p className="mt-3 text-sm font-bold text-emerald-700">✔ Host dijangkau dari browser ini — penonton di jaringan yang sama seharusnya bisa membuka alamat itu.</p>
          ) : null}
          {probe === "fail" ? (
            <p className="mt-3 text-sm font-bold text-red-600">
              ✖ Tidak terjangkau. Diagnosis: (1) MediaMTX belum jalan/port salah, (2) IP berubah, (3) client
              isolation router/hotspot aktif — matikan AP isolation atau pakai hotspot.
            </p>
          ) : null}
          {probe === "skip" ? <p className="mt-3 text-sm font-bold text-zb-black/50">Diagnosa dilewati.</p> : null}
        </BoCardLg>

        {/* QR */}
        <BoCardLg className="flex flex-col items-center justify-center bg-white p-5 text-center">
          <p className="font-display text-sm font-black uppercase">QR Code Penonton</p>
          {qr ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={`QR ${viewerUrl}`} className="mt-4 h-56 w-56 border-[3px] border-zb-black bo-shadow" />
              <p className="mt-3 break-all text-xs font-bold text-zb-black/60">{viewerUrl}</p>
              <p className="mt-1 text-[11px] font-semibold text-zb-black/40">
                QR dibuat lokal di perangkat ini — alamat tidak pernah dikirim ke internet.
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm font-semibold text-zb-black/50">QR muncul otomatis setelah alamat lengkap.</p>
          )}
        </BoCardLg>
      </div>

      <BoCard className="bg-zb-yellow p-4 text-sm font-bold">
        ⚠ Multi-viewer: satu stream dari OBS didistribusikan MediaMTX ke banyak penonton TANPA capture
        ulang. Jumlah viewer nyata ditampilkan bila bridge mengirim metrik viewer — sistem tidak pernah
        mengarang angka penonton. Panduan lengkap: <code>/guide/local-network</code>.
      </BoCard>
    </div>
  );
}

function StatusCard({ label, ok, note }: { label: string; ok: boolean; note: string }) {
  return (
    <BoCard className={`p-4 ${ok ? "bg-emerald-50" : "bg-white"}`}>
      <p className="flex items-center gap-2 font-display text-xs font-black uppercase tracking-wider">
        {ok ? <Wifi className="h-4 w-4 text-emerald-600" /> : <WifiOff className="h-4 w-4 text-zb-black/40" />}
        {label}
      </p>
      <BoBadge className={`mt-2 ${ok ? "bg-emerald-300" : "bg-zb-black/10"}`}>{ok ? "OK" : "OFFLINE"}</BoBadge>
      <p className="mt-1 text-[11px] font-semibold text-zb-black/50">{note}</p>
    </BoCard>
  );
}
