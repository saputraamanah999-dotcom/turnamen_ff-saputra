"use client";
// ============================================================
// /caster — BOF CASTER (bagikan layar via kode pairing)
// Pengalaman persis hi.casts.app:
//   1. TV/smartboard menampilkan kode 6 digit + QR (mode "caster" di admin).
//   2. Panitia membuka halaman ini di laptop/HP → ketik kode (atau ?code=…).
//   3. Pilih layar → layar mengalir REAL-TIME ke /display & /live website,
//      tampil berdampingan leaderboard — tanpa install apa pun.
// Tanpa login: keamanan lewat kode rahasia 6 digit (path signaling)
// + sesi dibuat/dimatikan admin + kedaluwarsa otomatis 8 jam.
// ============================================================

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Cast, CircleStop, MonitorUp, Radio, ShieldCheck, Tv, Users } from "lucide-react";
import { BoButton, BoCard } from "@/components/common/bo";
import { cn } from "@/lib/utils";
import { ORG } from "@/lib/constants";
import {
  casterDisplayConstraints,
  casterBitrateBps,
  casterDegradation,
  createCasterHost,
  formatPairCodeSafe,
  isSessionUsable,
  loadCasterQuality,
  readCasterSession,
  saveCasterQuality,
  subscribeCasterSession,
  validatePairCode,
  type CasterHostHandle,
  type CasterSessionInfo,
} from "@/services/broadcast/caster";
import type { CasterQuality } from "@/lib/types";
import { useKeepAwake } from "@/lib/wakelock";

type Phase = "idle" | "checking" | "ready" | "sharing" | "error";

/** Baris pilihan segmen (resolusi/fps/kualitas) — tombol nyata, state jelas. */
function SegRow({
  label, hint, value, options, onChange, disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  options: { v: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-fs-muted">{label}</p>
      <div className="mt-1 flex overflow-hidden border border-fs-edge">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            aria-pressed={value === o.v}
            disabled={disabled}
            onClick={() => onChange(o.v)}
            className={cn(
              "flex-1 px-1 py-1.5 text-[11px] font-black uppercase tracking-wide transition-colors",
              value === o.v ? "bg-fs-cyan text-fs-ink" : "bg-black/30 text-fs-muted hover:text-fs-text",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint ? <p className="mt-1 text-[10px] font-semibold text-fs-muted/70">{hint}</p> : null}
    </div>
  );
}

function CasterInner() {
  const params = useSearchParams();
  useKeepAwake(); // layar caster juga jangan mati saat berbagi

  const [code, setCode] = useState(params.get("code") ?? "");
  const [session, setSession] = useState<CasterSessionInfo | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [msg, setMsg] = useState("");
  const [state, setState] = useState("");
  const [viewers, setViewers] = useState({ connected: 0, waiting: 0, total: 0 });
  const [stats, setStats] = useState({ kbps: 0, fps: 0 });
  const hostRef = useRef<CasterHostHandle | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Kualitas berbagi layar (perangkat ini) — dimuat dari localStorage.
  const [quality, setQuality] = useState<CasterQuality | null>(null);
  useEffect(() => setQuality(loadCasterQuality()), []);

  const stopSharing = useCallback(async (silent = false) => {
    if (!silent) setMsg("Menghentikan berbagi…");
    try { await hostRef.current?.host.stop(); } catch { /* abaikan */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    hostRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setViewers({ connected: 0, waiting: 0, total: 0 });
    setStats({ kbps: 0, fps: 0 });
    setState("");
    setPhase("ready");
    setMsg("Berbagi dihentikan. Ketuk Bagikan Layar untuk mulai lagi.");
  }, []);

  // Sesi dimatikan admin dari jauh → berhenti otomatis.
  useEffect(() => {
    if (phase !== "sharing" || !session?.code) return;
    return subscribeCasterSession(session.code, (s) => {
      if (!isSessionUsable(s)) void stopSharing(true);
    });
  }, [phase, session?.code, stopSharing]);

  // Tab ditutup → best-effort hentikan (hapus sesi penonton).
  useEffect(() => {
    const leave = () => { void hostRef.current?.host.stop(); };
    window.addEventListener("pagehide", leave);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("beforeunload", leave);
    };
  }, []);

  async function checkCode(raw?: string) {
    const valid = validatePairCode(raw ?? code);
    if (!valid) {
      setPhase("error");
      setMsg("Kode harus 6 angka — lihat layar TV/smartboard.");
      return;
    }
    setCode(valid);
    setPhase("checking");
    setMsg("Memeriksa kode…");
    // readCasterSession melempar pesan ramah bila SERVER MENOLAK (rules belum ter-deploy).
    let s: Awaited<ReturnType<typeof readCasterSession>> = null;
    try {
      s = await readCasterSession(valid);
    } catch (e) {
      setPhase("error");
      setMsg((e as Error).message);
      return;
    }
    if (!s) {
      setPhase("error");
      setMsg("Kode tidak ditemukan. Pastikan angka sesuai layar TV dan sesi caster sudah dimulai admin.");
      return;
    }
    if (!isSessionUsable(s)) {
      setPhase("error");
      setMsg("Sesi caster sudah tidak aktif / kedaluwarsa. Minta panitia memulai sesi baru di Admin → Broadcast → BOF Caster.");
      return;
    }
    setSession(s);
    setPhase("ready");
    setMsg(`Sesi ditemukan${s.label ? ` — ${s.label}` : ""}. Siap membagikan layar.`);
  }

  async function startSharing() {
    if (!session?.tid) return;
    const q = quality ?? loadCasterQuality();
    setMsg("Membuka pemilih layar…");
    try {
      // Kualitas diatur di sumber: resolusi & fps dibatasi, audio game murni
      // tanpa voice processing (musik game tidak berubah aneh/robotik).
      const stream = await navigator.mediaDevices.getDisplayMedia(casterDisplayConstraints(q));
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => {});
      }
      // Tombol "Stop sharing" di bar browser → hentikan rapi.
      stream.getVideoTracks().forEach((t) => {
        t.addEventListener("ended", () => void stopSharing(true));
      });

      const handle = createCasterHost(session.tid, session.code, {
        onState: (st, detail) => {
          setState(st);
          if (detail) setMsg(detail);
          if (st === "offline") setMsg("Berbagi dihentikan.");
        },
        onViewers: setViewers,
        onStats: (s) => setStats({ kbps: Math.round(s.bitrateKbps ?? 0), fps: Math.round(s.fps ?? 0) }),
      }, undefined, q);
      hostRef.current = handle;
      await handle.host.publish(stream);
      setPhase("sharing");
      setMsg("LAYAR KAMU SEDANG TAYANG di website — real-time.");
    } catch (e) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setPhase(session ? "ready" : "idle");
      const name = (e as { name?: string })?.name ?? "";
      setMsg(
        name === "NotAllowedError"
          ? "Izin berbagi layar ditolak — pilih layar/jendela lalu klik Bagikan."
          : `Gagal memulai berbagi: ${name || "kesalahan tidak diketahui"}. Gunakan Chrome/Edge/Safari terbaru.`,
      );
    }
  }

  const codeDigits = code.replace(/\D/g, "").slice(0, 6);

  /** Ubah pengaturan kualitas: tersimpan lokal + bitrate/fps langsung berlaku
   *  pada encoder WebRTC bila siaran sedang berjalan. Resolusi berlaku saat
   *  berbagi dimulai lagi (batasan getDisplayMedia). */
  function updateQuality(patch: Partial<CasterQuality>) {
    const next = { ...(quality ?? loadCasterQuality()), ...patch };
    setQuality(next);
    saveCasterQuality(next);
    void hostRef.current?.host
      .setQuality({ maxBitrateBps: casterBitrateBps(next), maxFramerate: next.fps, degradation: casterDegradation(next) })
      .catch(() => { /* sesi belum berjalan — berlaku saat mulai berbagi */ });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-4 py-10 text-fs-text">
      <p className="bo-kicker flex items-center gap-2">
        <Cast className="h-4 w-4 text-fs-cyan" /> {ORG.brand} — BOF Caster
      </p>
      <h1 className="mt-2 text-center font-display text-2xl font-black uppercase tracking-wide sm:text-3xl">
        Bagikan Layar ke Website <span className="text-fs-cyan">Real-Time</span>
      </h1>
      <p className="mt-2 max-w-md text-center text-xs font-semibold text-fs-muted">
        Sama seperti hi.casts.app: masukkan kode yang tampil di TV/smartboard, pilih layar,
        dan layar kamu langsung tayang di halaman siaran berdampingan leaderboard.
      </p>

      {/* ---------- INPUT KODE ---------- */}
      {phase === "idle" || phase === "checking" || phase === "error" ? (
        <BoCard className="mt-8 w-full">
          <label htmlFor="paircode" className="text-[11px] font-black uppercase tracking-[0.3em] text-fs-muted">
            Kode Pairing (6 angka)
          </label>
          <input
            id="paircode"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="528346"
            value={formatPairCodeSafe(code)}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => { if (e.key === "Enter") void checkCode(); }}
            className="font-stat mt-2 w-full rounded-sm border border-fs-edge bg-black/40 px-4 py-4 text-center text-4xl font-black tracking-[0.25em] text-white outline-none tabular-nums focus:border-fs-cyan sm:text-5xl"
          />
          <BoButton onClick={() => void checkCode()} disabled={phase === "checking"} className="mt-4 w-full">
            <Cast className="h-4 w-4" /> {phase === "checking" ? "Memeriksa…" : "Sambungkan"}
          </BoButton>
          {msg ? (
            <p className={cn("mt-3 text-center text-xs font-bold", phase === "error" ? "text-fs-err" : "text-fs-muted")}>
              {msg}
            </p>
          ) : null}
        </BoCard>
      ) : null}

      {/* ---------- SESI SIAP / SEDANG BERBAGI ---------- */}
      {phase === "ready" || phase === "sharing" ? (
        <BoCard className="mt-8 w-full">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-fs-muted">Sesi</p>
              <p className="font-stat text-3xl font-black tracking-[0.2em] text-fs-cyan tabular-nums">
                {formatPairCodeSafe(session?.code ?? codeDigits)}
              </p>
            </div>
            {phase === "sharing" ? (
              <div className="flex items-center gap-2">
                <span className="fs-live-badge inline-flex items-center gap-1.5 bg-fs-err px-2.5 py-1 font-display text-xs font-black uppercase tracking-[0.2em] text-white">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-white" /> TAYANG
                </span>
                <span className="flex items-center gap-1.5 border border-fs-edge px-2 py-1 text-[11px] font-bold text-fs-muted">
                  <Users className="h-3.5 w-3.5" /> {viewers.connected} tersambung
                </span>
              </div>
            ) : (
              <span className="flex items-center gap-1.5 border border-fs-edge px-2 py-1 text-[11px] font-bold text-fs-muted">
                <ShieldCheck className="h-3.5 w-3.5 text-fs-ok" /> Sesi aktif
              </span>
            )}
          </div>

          {/* Pratinjau layar yang dibagikan */}
          <div className="mt-4 border border-fs-edge bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              className={cn("aspect-video w-full object-contain", phase === "sharing" ? "" : "hidden")}
            />
            {phase !== "sharing" ? (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 text-center">
                <MonitorUp className="h-10 w-10 text-fs-muted/50" />
                <p className="max-w-xs px-4 text-xs font-semibold text-fs-muted">
                  Ketuk tombol di bawah, pilih layar/jendela game, lalu layar tampil di TV &amp; semua penonton.
                </p>
              </div>
            ) : null}
          </div>

          {phase === "sharing" ? (
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="border border-fs-edge px-2 py-1.5">
                <p className="text-[9px] font-black uppercase tracking-widest text-fs-muted">Status</p>
                <p className="text-xs font-bold text-fs-ok">{state === "live" ? "Mengalir" : state || "…"}</p>
              </div>
              <div className="border border-fs-edge px-2 py-1.5">
                <p className="text-[9px] font-black uppercase tracking-widest text-fs-muted">Bitrate · FPS</p>
                <p className="text-xs font-bold tabular-nums">{stats.kbps} kbps · {stats.fps} fps</p>
              </div>
              <div className="border border-fs-edge px-2 py-1.5">
                <p className="text-[9px] font-black uppercase tracking-widest text-fs-muted">Menunggu</p>
                <p className="text-xs font-bold tabular-nums">{viewers.waiting}</p>
              </div>
            </div>
          ) : null}

          {quality ? (
            <div className="mt-4 border border-fs-edge bg-black/20 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-fs-muted">Kualitas Siaran (perangkat ini)</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <SegRow
                  label="Resolusi"
                  value={quality.resolution}
                  onChange={(v) => updateQuality({ resolution: v as CasterQuality["resolution"] })}
                  options={[
                    { v: "720", label: "720p" },
                    { v: "1080", label: "1080p HD" },
                    { v: "native", label: "Ikuti layar" },
                  ]}
                  hint="Berlaku saat berbagi dimulai lagi"
                />
                <SegRow
                  label="FPS"
                  value={String(quality.fps)}
                  onChange={(v) => updateQuality({ fps: Number(v) as CasterQuality["fps"] })}
                  options={[
                    { v: "15", label: "15" },
                    { v: "24", label: "24" },
                    { v: "30", label: "30" },
                    { v: "60", label: "60" },
                  ]}
                  hint="Makin tinggi makin berat CPU"
                />
                <SegRow
                  label="Kualitas video"
                  value={quality.quality}
                  onChange={(v) => updateQuality({ quality: v as CasterQuality["quality"] })}
                  options={[
                    { v: "hd", label: "HD" },
                    { v: "balanced", label: "Sedang" },
                    { v: "light", label: "Hemat" },
                  ]}
                  hint={
                    quality.quality === "hd"
                      ? "Gambar tajam ±8 Mbps (internet kencang)"
                      : quality.quality === "light"
                        ? "Tahan lag ±2,5 Mbps (CPU ringan)"
                        : "Seimbang ±4,5 Mbps"
                  }
                />
              </div>
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] font-semibold text-fs-text/80">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-orange-500"
                  checked={quality.rawAudio}
                  onChange={(e) => updateQuality({ rawAudio: e.target.checked })}
                />
                <span>
                  <b>Audio game murni</b> (tanpa filter suara) — musik &amp; efek game tersalur apa adanya,
                  tanpa suara aneh/robotik. Matikan hanya bila membagikan suara bicara/mic.
                </span>
              </label>
              <p className="mt-1.5 text-[10px] font-semibold text-fs-muted/70">
                Perubahan kualitas langsung berlaku; resolusi baru berlaku ketika berbagi dimulai ulang.
              </p>
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {phase === "ready" ? (
              <BoButton onClick={() => void startSharing()} className="flex-1">
                <MonitorUp className="h-4 w-4" /> Bagikan Layar Sekarang
              </BoButton>
            ) : (
              <BoButton variant="danger" onClick={() => void stopSharing()} className="flex-1">
                <CircleStop className="h-4 w-4" /> Hentikan Berbagi
              </BoButton>
            )}
          </div>
          {msg ? <p className="mt-3 text-center text-xs font-bold text-fs-muted">{msg}</p> : null}
        </BoCard>
      ) : null}

      {/* Petunjuk bawah */}
      <div className="mt-6 flex w-full flex-col gap-2 text-[11px] font-semibold text-fs-muted sm:flex-row sm:justify-center">
        <span className="flex items-center gap-1.5"><Tv className="h-3.5 w-3.5 text-fs-cyan" /> TV: buka /display</span>
        <span className="hidden sm:inline text-fs-muted/30">•</span>
        <span className="flex items-center gap-1.5"><Radio className="h-3.5 w-3.5 text-fs-cyan" /> Penonton: buka /live</span>
        <span className="hidden sm:inline text-fs-muted/30">•</span>
        <Link href="/live" className="text-fs-cyan underline-offset-2 hover:underline">Buka halaman siaran</Link>
      </div>
      <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-[0.28em] text-fs-muted/50">
        {ORG.brand} · {ORG.developer}
      </p>
    </main>
  );
}

export default function CasterPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center text-sm font-bold uppercase tracking-[0.3em] text-fs-muted">
          Memuat Caster…
        </main>
      }
    >
      <CasterInner />
    </Suspense>
  );
}
