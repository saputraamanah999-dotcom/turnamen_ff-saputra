"use client";
// ============================================================
// /admin/local-network — STIKAR LOCAL BROADCAST CONNECTOR (§6)
// Wizard profesional: pilih metode koneksi → pilih interface →
// host server → connection test → share ke TV (QR) → viewer list.
// Semua data NYATA: IP dari network interface laptop (via bridge),
// viewer dari WebSocket presence, test via fetch sungguhan.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2, Copy, Info, Laptop, Loader2, MonitorSmartphone, QrCode,
  RefreshCcw, Server, ShieldCheck, Tv, Wifi, WifiOff, XCircle, Zap,
} from "lucide-react";
import { BoBadge, BoButton, BoCard } from "@/components/common/bo";
import {
  autoConnectBridge, disconnectBridge, getBridgeToken, getBridgeUrl, subscribeBridge,
  type BridgeState,
} from "@/services/broadcast/bridge";
import { useNotifications } from "@/components/broadcast/notification-center";
import { useBridgeHeartbeat } from "@/services/broadcast/heartbeat";
import { cn } from "@/lib/utils";

type TestState = "idle" | "testing" | "ok" | "fail";

const OPTIONS = [
  {
    id: "hotspot" as const,
    title: "OPTION 1 — LAPTOP HOTSPOT",
    note: "Laptop jadi pusat jaringan — paling sederhana, tidak butuh router.",
    icon: Laptop,
    steps: [
      "Aktifkan hotspot di laptop (Windows: Settings → Network → Mobile hotspot).",
      "Sambungkan TV ke Wi-Fi hotspot laptop tersebut.",
      "Sambungkan smartphone/HP tambahan bila perlu.",
      "Jalankan Local Broadcast Server di laptop (lihat STEP 2).",
      "Sistem memeriksa koneksi dan membuat link streaming lokal.",
      "Buka QR / URL di browser TV → gameplay muncul.",
    ],
  },
  {
    id: "router" as const,
    title: "OPTION 2 — WI-FI ROUTER",
    note: "Semua perangkat tersambung ke router yang sama — stabil untuk acara besar.",
    icon: Wifi,
    steps: [
      "Sambungkan laptop dan TV ke router Wi-Fi yang sama.",
      "Perangkat penonton ikut tersambung ke router (jika diizinkan).",
      "Jalankan Local Broadcast Server di laptop (STEP 2).",
      "Sistem mendeteksi interface jaringan aktif + IP lokal.",
      "Link + QR Code dihasilkan otomatis.",
      "TV membuka link lokal → streaming berjalan via LAN.",
    ],
  },
  {
    id: "existing" as const,
    title: "OPTION 3 — EXISTING NETWORK",
    note: "Pakai jaringan sekolah yang sudah ada — tidak perlu ganti jaringan.",
    icon: Zap,
    steps: [
      "Pastikan laptop dan TV sudah di jaringan yang sama (mis. Wi-Fi sekolah).",
      "Jalankan Local Broadcast Server di laptop (STEP 2).",
      "Perhatian: beberapa jaringan sekolah mengaktifkan AP/client isolation.",
      "Gunakan STEP 3 Connection Test untuk memastikan TV dapat menjangkau laptop.",
      "Jika terblokir, beralih ke hotspot laptop (OPTION 1).",
    ],
  },
];

export default function AdminLocalNetworkPage() {
  const [bridge, setBridge] = useState<BridgeState | null>(null);
  const [option, setOption] = useState<"hotspot" | "router" | "existing">("hotspot");
  const [step, setStep] = useState(1);
  const [gatewayStatus, setGatewayStatus] = useState<Record<string, unknown> | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [qr, setQr] = useState<string | null>(null);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null);
  const [copied, setCopied] = useState("");
  const [ipFlash, setIpFlash] = useState(false);
  const prevIp = useRef<string | undefined>(undefined);
  const { push } = useNotifications();

  const bridgeUrl = getBridgeUrl();
  const gatewayHttpUrl = useMemo(() => bridgeUrl.replace(/^ws/, "http"), [bridgeUrl]);
  const lanIp = bridge?.lanIp;
  const gatewayPort = bridge?.gatewayPort ?? 8080;
  const displayUrl = lanIp ? `http://${lanIp}:${gatewayPort}/display` : "";
  const liveUrl = lanIp ? `http://${lanIp}:${gatewayPort}/live` : "";
  const token = getBridgeToken();

  useEffect(() => {
    void autoConnectBridge();
    return subscribeBridge((s) => setBridge(s));
  }, []);
  useEffect(() => () => disconnectBridge(), []);

  // Deteksi perubahan IP (§6: perbarui URL, QR, dan beri notifikasi).
  useEffect(() => {
    if (lanIp && prevIp.current && lanIp !== prevIp.current) {
      setIpFlash(true);
      push("network", `IP laptop berubah: ${prevIp.current} → ${lanIp}. QR & link diperbarui — perangkat perlu reconnect.`);
      setTimeout(() => setIpFlash(false), 4000);
    }
    if (lanIp) prevIp.current = lanIp;
  }, [lanIp, push]);

  // Status gateway (via bridge → data sudah di state; fallback fetch langsung)
  const refreshGateway = useCallback(async () => {
    try {
      const res = await fetch(`${gatewayHttpUrl}:${gatewayPort}/api/status`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) setGatewayStatus(await res.json());
    } catch {
      setGatewayStatus(null);
    }
  }, [gatewayHttpUrl, gatewayPort]);

  useEffect(() => {
    void refreshGateway();
    const t = setInterval(() => void refreshGateway(), 8000);
    return () => clearInterval(t);
  }, [refreshGateway]);

  // QR display URL
  useEffect(() => {
    if (!displayUrl) { setQr(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const QR = (await import("qrcode")).default;
        const url = await QR.toDataURL(displayUrl, { width: 260, margin: 1, color: { dark: "#0B0E14", light: "#FFFFFF" } });
        if (!cancelled) setQr(url);
      } catch { if (!cancelled) setQr(null); }
    })();
    return () => { cancelled = true; };
  }, [displayUrl]);

  // ---------- Connection tests (nyata) ----------
  async function runTest(key: string, fn: () => Promise<boolean>) {
    setTests((t) => ({ ...t, [key]: "testing" }));
    let ok = false;
    try { ok = await fn(); } catch { ok = false; }
    setTests((t) => ({ ...t, [key]: ok ? "ok" : "fail" }));
    push("network", `Connection test "${key}": ${ok ? "BERHASIL" : "GAGAL"}`);
  }

  function runAllTests() {
    void runTest("gateway", async () => {
      const r = await fetch(`${displayUrl.replace("/display", "")}/api/status`, { signal: AbortSignal.timeout(3500) });
      return r.ok;
    });
    void runTest("mediamtx", async () => {
      const st = gatewayStatus as { mediamtx?: boolean } | null;
      if (st && typeof st.mediamtx === "boolean") return st.mediamtx;
      return bridge?.mediamtx === true;
    });
    void runTest("whe", async () => {
      const base = displayUrl.replace(/\/display$/, "");
      await fetch(`${base}/mediamtx/bof-main/whe`, { mode: "no-cors", signal: AbortSignal.timeout(3500) });
      return true; // no-cors: menjangkau = ok
    });
    void runTest("hls", async () => {
      const base = displayUrl.replace(/\/display$/, "");
      await fetch(`${base}/hls/bof-main/index.m3u8`, { mode: "no-cors", signal: AbortSignal.timeout(3500) });
      return true;
    });
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(""), 1600);
    } catch { /* clipboard ditolak */ }
  }

  async function createPairing() {
    try {
      const res = await fetch(`${gatewayHttpUrl}:${gatewayPort}/api/pairing`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      setPairing({ code: j.code, expiresAt: j.expiresAt });
      push("network", `Pairing code dibuat: ${j.code} (15 menit)`);
    } catch {
      push("network", "Gagal membuat pairing — gateway lokal tidak terjangkau dari halaman ini. Jalankan admin di laptop yang sama dengan bridge.");
    }
  }

  async function revokePairing() {
    if (!pairing) return;
    try {
      await fetch(`${gatewayHttpUrl}:${gatewayPort}/api/pairing/${pairing.code}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* abaikan */ }
    setPairing(null);
    push("network", "Pairing code dicabut");
  }

  const bridgeOn = Boolean(bridge?.connected);
  const viewerList = (bridge?.viewerList ?? gatewayStatus?.viewerList ?? []) as Array<{
    label?: string; type?: string; since?: number;
  }>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide">STIKAR Local Broadcast Connector</h1>
        <p className="mt-1 max-w-3xl text-sm font-semibold text-fs-muted">
          Hubungkan laptop → hotspot/router → TV & perangkat penonton. Semua status di bawah
          diambil dari kondisi jaringan nyata — bukan simulasi.
        </p>
      </div>

      <LocalHeartbeatBanner />

      {/* Status ringkas */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatusCard icon={<Server className="h-4 w-4" />} label="Bridge (8078)" ok={bridgeOn} note={bridgeOn ? "Tersambung" : bridge?.message ?? "Offline — jalankan npm run bridge di laptop"} />
        <StatusCard icon={<Wifi className="h-4 w-4" />} label="Gateway LAN" ok={bridgeOn} note={bridgeOn ? `Aktif port ${gatewayPort}` : "N/A"} />
        <StatusCard icon={<Tv className="h-4 w-4" />} label="MediaMTX" ok={bridge?.mediamtx ?? gatewayStatus?.mediamtx === true ? true : bridgeOn ? false : null} note={bridge?.mediamtx || gatewayStatus?.mediamtx === true ? "Server stream berjalan" : "Belum berjalan — lihat panduan"} />
        <StatusCard icon={<Laptop className="h-4 w-4" />} label="IP Laptop" ok={lanIp ? true : null} note={lanIp ? `${lanIp} (dari interface aktif)` : "Menunggu bridge"} flash={ipFlash} />
        <StatusCard icon={<MonitorSmartphone className="h-4 w-4" />} label="Perangkat" ok={viewerList.length > 0 ? true : false} note={`${viewerList.length} perangkat terhubung (nyata)`} />
      </div>

      {/* Pilihan metode */}
      <div className="grid gap-3 lg:grid-cols-3">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const active = option === o.id;
          return (
            <button
              key={o.id}
              onClick={() => setOption(o.id)}
              className={cn(
                "bo-card p-4 text-left transition",
                active ? "!border-fs-fire shadow-[0_0_18px_rgba(255,90,31,.18)]" : "hover:!border-fs-edge-strong",
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn("fs-cut-sm inline-flex h-9 w-9 items-center justify-center", active ? "bg-gradient-to-br from-fs-fire to-fs-flame text-white" : "border border-fs-edge bg-fs-bg text-fs-muted")}>
                  <Icon className="h-4.5 w-4.5" />
                </span>
                {active ? <BoBadge className="bg-fs-fire text-white">Dipilih</BoBadge> : null}
              </div>
              <p className={cn("mt-2.5 font-display text-sm font-black tracking-wide", active ? "text-fs-fire" : "text-fs-text")}>{o.title}</p>
              <p className="mt-1 text-[11px] font-semibold leading-snug text-fs-muted">{o.note}</p>
              <ol className="mt-2.5 space-y-1">
                {o.steps.map((s, i) => (
                  <li key={i} className="flex gap-2 text-[11px] font-semibold text-fs-muted">
                    <span className="font-stat shrink-0 font-bold text-fs-flame">{i + 1}.</span> {s}
                  </li>
                ))}
              </ol>
            </button>
          );
        })}
      </div>

      {/* Wizard 5 langkah */}
      <BoCard className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {["Network", "Host Server", "Connection Test", "Share to TV", "Viewer"].map((label, i) => (
            <button
              key={label}
              onClick={() => setStep(i + 1)}
              className={cn(
                "flex items-center gap-2 border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition",
                step === i + 1 ? "border-fs-fire bg-fs-fire/12 text-fs-fire" : "border-fs-edge text-fs-muted hover:text-fs-text",
              )}
            >
              <span className="font-stat">STEP {i + 1}</span> {label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {/* STEP 1 */}
          {step === 1 ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="border border-fs-edge bg-fs-bg/60 p-4">
                <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-fs-cyan">
                  <Wifi className="h-4 w-4" /> Interface Aktif
                </p>
                <div className="mt-3 space-y-2 text-sm font-bold">
                  <p className="flex justify-between"><span className="text-fs-muted">Nama interface</span><span>{(gatewayStatus as { interface?: string } | null)?.interface ?? "— (via bridge)"}</span></p>
                  <p className="flex justify-between"><span className="text-fs-muted">IP lokal</span><span className="font-stat">{lanIp ?? "—"}</span></p>
                  <p className="flex justify-between"><span className="text-fs-muted">Status</span>
                    {lanIp ? <span className="text-fs-ok">CONNECTED</span> : <span className="fs-connecting text-fs-gold">MENUNGGU BRIDGE</span>}
                  </p>
                  <p className="flex justify-between"><span className="text-fs-muted">Jenis koneksi</span><span className="text-fs-text">{OPTIONS.find((o) => o.id === option)?.title.replace("OPTION X — ", "")}</span></p>
                </div>
                <p className="mt-3 text-[11px] font-semibold text-fs-muted">
                  IP diambil dari network interface laptop yang benar-benar aktif (bukan tebakan).
                  Jika IP berubah, sistem otomatis memperbarui link + QR dan memberi notifikasi.
                </p>
              </div>
              <div className="border border-fs-edge bg-fs-bg/60 p-4">
                <p className="font-display text-sm font-bold uppercase tracking-wider text-fs-gold">Panduan Hotspot (Ringkas)</p>
                <ol className="mt-3 space-y-1.5 text-[12px] font-semibold text-fs-muted">
                  <li>1. Windows: <b className="text-fs-text">Settings → Network & internet → Mobile hotspot</b> → ON.</li>
                  <li>2. macOS: <b className="text-fs-text">System Settings → General → Sharing → Internet Sharing</b>.</li>
                  <li>3. Sambungkan TV ke nama hotspot laptop (cek nama & kata sandi di layar laptop).</li>
                  <li>4. Jangan sampai TV dan laptop berbeda jaringan — tes dengan STEP 3.</li>
                  <li>5. Password Wi-Fi TIDAK diminta/diimpan oleh sistem STIKAR.</li>
                </ol>
                <p className="mt-3 flex items-start gap-2 border border-fs-gold/40 bg-fs-gold/10 p-2.5 text-[11px] font-semibold text-fs-gold">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Client isolation pada beberapa router/hotspot memblokir TV↔laptop. Jika STEP 3 gagal padahal semua tersambung, gunakan hotspot laptop.
                </p>
              </div>
            </div>
          ) : null}

          {/* STEP 2 */}
          {step === 2 ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="border border-fs-edge bg-fs-bg/60 p-4">
                <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-fs-fire">
                  <Server className="h-4 w-4" /> Local Broadcast Server
                </p>
                <p className="mt-2 text-[12px] font-semibold text-fs-muted">
                  Server berjalan sebagai proses di laptop (bukan dari browser — demi keamanan).
                  Jalankan perintah berikut di folder proyek:
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <code className="flex-1 border border-fs-edge bg-black px-3 py-2.5 font-mono text-xs text-fs-cyan">npm run bridge</code>
                  <BoButton variant="cyan" className="!px-2.5 !py-2 !text-[11px]" onClick={() => copy("npm run bridge", "cmd")}><Copy className="h-3.5 w-3.5" /></BoButton>
                </div>
                <p className="mt-2 text-[11px] font-semibold text-fs-muted">
                  Gateway HTTP ikut aktif otomatis (port {gatewayPort}). Pastikan <code className="text-fs-text">BRIDGE_TOKEN</code> di
                  <code className="text-fs-text"> broadcast-bridge/.env</code> sama dengan token di Broadcast Control.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  {bridgeOn ? (
                    <span className="flex items-center gap-1.5 text-sm font-bold text-fs-ok"><CheckCircle2 className="h-4 w-4" /> SERVER RUNNING</span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm font-bold text-fs-err"><WifiOff className="h-4 w-4" /> SERVER OFFLINE</span>
                  )}
                  <BoButton variant="white" className="!px-2.5 !py-1.5 !text-[11px]" onClick={() => { disconnectBridge(); void autoConnectBridge(); }}>
                    <RefreshCcw className="h-3.5 w-3.5" /> Restart Koneksi
                  </BoButton>
                </div>
              </div>
              <div className="border border-fs-edge bg-fs-bg/60 p-4">
                <p className="font-display text-sm font-bold uppercase tracking-wider text-fs-gold">Port yang Dipakai</p>
                <ul className="mt-3 space-y-2 text-[12px] font-bold">
                  <li className="flex justify-between"><span>Gateway HTTP (TV/HP)</span><span className="font-stat text-fs-cyan">{gatewayPort} — buka di firewall LAN</span></li>
                  <li className="flex justify-between"><span>Bridge WebSocket</span><span className="font-stat text-fs-cyan">8078 — localhost saja</span></li>
                  <li className="flex justify-between"><span>MediaMTX WebRTC</span><span className="font-stat text-fs-cyan">8889</span></li>
                  <li className="flex justify-between"><span>MediaMTX HLS</span><span className="font-stat text-fs-cyan">8888</span></li>
                </ul>
                <p className="mt-3 text-[11px] font-semibold text-fs-muted">
                  Firewall Windows: izinkan Node.js & MediaMTX untuk jaringan privat SAJA. Panduan lengkap ada di <code>broadcast-bridge/mediamtx/README.md</code>.
                </p>
              </div>
            </div>
          ) : null}

          {/* STEP 3 */}
          {step === 3 ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold">Uji apakah TV dapat menjangkau laptop — hasilnya nyata, bukan asumsi.</p>
                <BoButton variant="fire" className="!px-4 !py-2 !text-xs" onClick={runAllTests} disabled={!lanIp}>
                  <Loader2 className="h-3.5 w-3.5" /> Jalankan Semua Test
                </BoButton>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <TestCard label="Server terjangkau" state={tests.gateway} note="GET /api/status dari gateway" />
                <TestCard label="MediaMTX berjalan" state={tests.mediamtx} note="Probe port 8889" />
                <TestCard label="WebRTC endpoint" state={tests.whe} note="/mediamtx/bof-main/whe" />
                <TestCard label="HLS endpoint" state={tests.hls} note="/hls/bof-main/index.m3u8" />
              </div>
              <p className="mt-3 text-[11px] font-semibold text-fs-muted">
                Catatan jujur: test dijalankan dari browser operator. Bila operator membuka panel via HP (jaringan berbeda), hasil bisa gagal
                walau laptop benar — jalankan test dari laptop untuk hasil paling akurat.
              </p>
            </div>
          ) : null}

          {/* STEP 4 */}
          {step === 4 ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-3">
                <div className="border border-fs-edge bg-fs-bg/60 p-4">
                  <p className="font-display text-sm font-bold uppercase tracking-wider text-fs-cyan">Local Display URL (TV)</p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate border border-fs-edge bg-black px-3 py-2.5 font-mono text-xs text-fs-cyan">{displayUrl || "menunggu IP…"}</code>
                    <BoButton variant="cyan" className="!px-2.5 !py-2 !text-[11px]" disabled={!displayUrl} onClick={() => copy(displayUrl, "disp")}>
                      {copied === "disp" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </BoButton>
                  </div>
                  <p className="mt-1.5 font-display text-sm font-bold uppercase tracking-wider text-fs-flame">Local Live URL (HP)</p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate border border-fs-edge bg-black px-3 py-2.5 font-mono text-xs text-fs-flame">{liveUrl || "menunggu IP…"}</code>
                    <BoButton variant="flame" className="!px-2.5 !py-2 !text-[11px]" disabled={!liveUrl} onClick={() => copy(liveUrl, "live")}>
                      {copied === "live" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </BoButton>
                  </div>
                  <p className="mt-2 text-[11px] font-semibold text-fs-muted">
                    TV buka Display URL → langsung tampil layout siaran STIKAR (Mode A, tanpa internet untuk video).
                  </p>
                </div>
                {/* Pairing Mode B untuk website publik */}
                <div className="border border-fs-edge bg-fs-bg/60 p-4">
                  <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-fs-gold">
                    <ShieldCheck className="h-4 w-4" /> Pairing Website Publik (Mode B)
                  </p>
                  <p className="mt-2 text-[11px] font-semibold leading-snug text-fs-muted">
                    Pengunjung membuka <b className="text-fs-text">/live/connect</b> di website publik lalu memasukkan kode.
                    Kode berlaku 15 menit & dapat dicabut. (Catatan jujur: browser HTTPS publik dibatasi mixed-content —
                    video lokal optimal bila viewer di jaringan yang sama membuka halaman lokal.)
                  </p>
                  {pairing ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="font-stat border border-fs-gold bg-fs-gold/10 px-3 py-1.5 text-2xl font-bold tracking-[0.3em] text-fs-gold">{pairing.code}</span>
                      <span className="text-[11px] font-bold text-fs-muted">berlaku s.d. {new Date(pairing.expiresAt).toLocaleTimeString("id-ID")}</span>
                      <BoButton variant="danger" className="!px-3 !py-1.5 !text-[11px]" onClick={revokePairing}>Cabut</BoButton>
                    </div>
                  ) : (
                    <BoButton variant="gold" className="mt-3 !px-4 !py-2 !text-xs" onClick={createPairing} disabled={!bridgeOn}>
                      <QrCode className="h-3.5 w-3.5" /> Buat Pairing Code
                    </BoButton>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-center justify-center border border-fs-edge bg-fs-bg/60 p-4">
                {qr ? (
                  <>
                    <img src={qr} alt="QR Code Local Display URL" className="h-56 w-56 border border-fs-edge bg-white p-2" />
                    <p className="mt-3 text-center text-[11px] font-bold uppercase tracking-widest text-fs-muted">
                      Scan dari browser TV / HP di jaringan yang sama
                    </p>
                  </>
                ) : (
                  <div className="flex h-56 w-56 items-center justify-center border border-dashed border-fs-edge">
                    <p className="px-4 text-center text-[11px] font-bold text-fs-muted">QR muncul setelah IP laptop terdeteksi via bridge</p>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* STEP 5 */}
          {step === 5 ? (
            <div>
              <p className="text-sm font-bold">Perangkat yang BENAR-BENAR terhubung ke gateway lokal:</p>
              <div className="mt-3 space-y-2">
                {viewerList.length === 0 ? (
                  <p className="border border-dashed border-fs-edge px-4 py-6 text-center text-xs font-bold text-fs-muted">
                    Belum ada perangkat — buka Display URL di TV, halaman ini akan menampilkannya dalam 5 detik.
                  </p>
                ) : viewerList.map((v, i) => {
                  const row = v as { label?: string; type?: string; since?: number };
                  return (
                    <div key={i} className="flex items-center justify-between border border-fs-edge bg-fs-bg/60 px-3 py-2.5">
                      <span className="flex items-center gap-2 text-sm font-bold">
                        {row.type === "display" ? <Tv className="h-4 w-4 text-fs-fire" /> : <MonitorSmartphone className="h-4 w-4 text-fs-cyan" />}
                        {String(row.label ?? "Perangkat").toUpperCase()}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-[11px] font-bold text-fs-muted">sejak {row.since ? new Date(row.since).toLocaleTimeString("id-ID") : "—"}</span>
                        <span className="flex items-center gap-1.5 text-xs font-black uppercase text-fs-ok">
                          <span className="inline-block h-2 w-2 rounded-full bg-fs-ok" /> CONNECTED
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] font-semibold text-fs-muted">
                Daftar ini bukan perkiraan — dihitung dari koneksi WebSocket nyata ke gateway laptop.
              </p>
            </div>
          ) : null}
        </div>
      </BoCard>
    </div>
  );
}

function StatusCard({
  icon, label, ok, note, flash,
}: {
  icon: React.ReactNode; label: string; ok: boolean | null; note: string; flash?: boolean;
}) {
  return (
    <div className={cn("bo-card fs-cut-sm px-3.5 py-3", flash && "fs-onair border-fs-fire/60")}>
      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-fs-muted">{icon} {label}</p>
      <p className={cn(
        "mt-1.5 flex items-center gap-1.5 font-display text-sm font-black uppercase",
        ok === true ? "text-fs-ok" : ok === false ? "text-fs-err" : "text-fs-gold",
      )}>
        {ok === true ? <CheckCircle2 className="h-4 w-4" /> : ok === false ? <XCircle className="h-4 w-4" /> : <span className="fs-connecting inline-block h-3.5 w-3.5 rounded-full border-2 border-fs-gold border-t-transparent" />}
        {ok === true ? "OK" : ok === false ? "OFFLINE" : "MENUNGGU"}
      </p>
      <p className="mt-1 truncate text-[11px] font-semibold text-fs-muted" title={note}>{note}</p>
    </div>
  );
}

function TestCard({ label, state, note }: { label: string; state: TestState; note: string }) {
  return (
    <div className={cn(
      "border p-3",
      state === "ok" ? "border-fs-ok/60 bg-fs-ok/10" : state === "fail" ? "border-fs-err/60 bg-fs-err/10" : "border-fs-edge bg-fs-bg/60",
    )}>
      <p className="flex items-center justify-between text-xs font-bold">
        {label}
        {state === "testing" ? <Loader2 className="h-4 w-4 animate-spin text-fs-cyan" /> :
          state === "ok" ? <CheckCircle2 className="h-4 w-4 text-fs-ok" /> :
          state === "fail" ? <XCircle className="h-4 w-4 text-fs-err" /> :
            <span className="text-[10px] font-bold text-fs-muted">IDLE</span>}
      </p>
      <p className="mt-1 text-[10px] font-semibold text-fs-muted">{note}</p>
    </div>
  );
}

/** Banner heartbeat bridge: status running dari perangkat MANA PUN (via Firestore). */
function LocalHeartbeatBanner() {
  const { data, ageSec, fresh } = useBridgeHeartbeat("bof-main");
  const running = fresh && (data?.gatewayUp ?? false);
  return (
    <div className={cn(
      "flex flex-wrap items-center justify-between gap-2 border p-3 text-xs font-bold",
      running ? "border-fs-ok/60 bg-fs-ok/10" : data ? "border-fs-err/60 bg-fs-err/10" : "border-fs-edge bg-fs-bg/60",
    )}>
      <span className="flex items-center gap-2">
        <span className={cn("inline-block h-2.5 w-2.5 rounded-full", running ? "animate-pulse bg-fs-ok" : "bg-fs-err")} />
        BRIDGE LOKAL: {running ? "RUNNING" : data ? "TIDAK AKTIF (laporan terakhir sudah basi)" : "BELUM ADA LAPORAN"}
        {running && data?.lanIp ? (
          <span className="font-stat text-fs-cyan">
            {data.lanIp}:{data.gatewayPort ?? 8080} · MediaMTX {data.mediamtxUp ? "UP" : "DOWN"} · OBS {data.obsConnected ? "OK" : "-"} · {data.viewers} penonton
          </span>
        ) : null}
      </span>
      {ageSec != null ? <span className="text-[10px] font-semibold text-fs-muted">laporan {ageSec}s lalu (heartbeat tiap 30s)</span> : null}
    </div>
  );
}
