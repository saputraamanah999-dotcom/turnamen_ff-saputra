"use client";
// ============================================================
// ZEROID ESPORTS — Live Video Player v2 (PHASE 2 §7, §8, §19, §26)
// Sumber didukung (prioritas):
//   1. WHE  — WebRTC playback via MediaMTX (latensi rendah, LAN)
//   2. HLS  — MediaMTX / URL HLS apa pun (fallback codec TV lama)
//   3. YouTube Live embed (mode publik)
// Status DITENTUKAN KONEKSI NYATA: connecting → live / reconnecting /
// signal lost. Autoplay diblokir? tombol Play muncul. Tidak ada video palsu.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Play, Radio, Volume2, VolumeX, WifiOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { playWHE } from "@/services/broadcast/stream";
import type { BroadcastSettings } from "@/lib/types";

export type PlayerStatus = "idle" | "connecting" | "live" | "reconnecting" | "signal-lost" | "blocked";

export interface PlayerHandle {
  status: PlayerStatus;
  /** Panggil saat autoplay diblokir oleh browser TV. */
  play: () => void;
  retry: () => void;
}

export function LiveVideoPlayer({
  broadcast,
  className,
  wheUrlOverride,
  onStatus,
  /** Konten tampil ketika siaran belum aktif (mis. Starting Soon). */
  idleContent,
}: {
  broadcast: BroadcastSettings | null;
  className?: string;
  wheUrlOverride?: string;
  onStatus?: (s: PlayerStatus) => void;
  idleContent?: React.ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const wheRef = useRef<{ pc: RTCPeerConnection; close: () => void } | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [detail, setDetail] = useState<string>("");
  const [needsPlay, setNeedsPlay] = useState(false);
  const [muted, setMuted] = useState(true);
  const [attempt, setAttempt] = useState(0);

  const mode = broadcast?.streamMode ?? "offline";
  const ytId = broadcast?.youtubeVideoId?.trim() ?? "";
  const hlsUrl = broadcast?.hlsUrl?.trim() ?? "";
  const wheUrl = (wheUrlOverride ?? broadcast?.wheUrl?.trim() ?? "").trim();
  const streamKey = `${mode}|${wheUrl}|${hlsUrl}|${ytId}`;

  const setStat = useCallback((s: PlayerStatus, msg = "") => {
    setStatus(s);
    setDetail(msg);
    onStatus?.(s);
  }, [onStatus]);

  // ---------- Sumber WHE (WebRTC) ----------
  useEffect(() => {
    if (mode !== "mediamtx" || !wheUrl) return;
    let cancelled = false;
    const abort = new AbortController();
    setStatus("connecting");
    (async () => {
      // Bounded retry — tanpa loop tanpa akhir (§19).
      for (let i = 1; i <= 3 && !cancelled; i++) {
        setDetail(i > 1 ? `Percobaan ${i}/3…` : "");
        const pcHandle = await playWHE(videoRef.current!, wheUrl, abort.signal);
        if (cancelled) return;
        if (pcHandle) {
          wheRef.current = pcHandle;
          const pc = pcHandle.pc;
          await new Promise<void>((resolve) => {
            const check = () => {
              if (pc.connectionState === "connected") resolve();
              else if (pc.connectionState === "failed" || pc.connectionState === "closed") resolve();
            };
            pc.onconnectionstatechange = check;
            check();
            setTimeout(resolve, 6000); // guard waktu
          });
          if (pc.connectionState === "connected") {
            setStat("live");
            setNeedsPlay(true); // trigger autoplay & tombol play fallback
            return;
          }
          pcHandle.close();
          wheRef.current = null;
        }
        if (i < 3) await new Promise((r) => setTimeout(r, 1500 * i));
      }
      if (!cancelled) {
        setStat("signal-lost", "WebRTC tidak tersedia — mencoba fallback HLS…");
      }
    })();
    return () => {
      cancelled = true;
      abort.abort();
      wheRef.current?.close();
      wheRef.current = null;
    };
  }, [mode, wheUrl, setStat, streamKey]);

  // ---------- Fallback HLS ----------
  useEffect(() => {
    if (mode !== "mediamtx" || !hlsUrl) return;
    // Tunggu percobaan WHE selesai dulu bila ada.
    if (wheUrl && status === "connecting") return;
    if (status === "live") return;
    let cancelled = false;
    (async () => {
      try {
        const Hls = (await import("hls.js")).default;
        if (cancelled || !videoRef.current) return;
        if (Hls.isSupported()) {
          const hls = new Hls({ lowLatencyMode: true });
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) {
              setStat("signal-lost", "Stream HLS tidak dapat diputar. Pastikan server siaran lokal berjalan.");
            }
          });
          hls.loadSource(hlsUrl);
          hls.attachMedia(videoRef.current);
          hlsRef.current = hls;
          setStat("connecting", "Menghubungkan HLS…");
        } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
          videoRef.current.src = hlsUrl;
          setStat("connecting", "Menghubungkan HLS native…");
        } else {
          setStat("signal-lost", "Browser tidak mendukung WebRTC maupun HLS.");
        }
      } catch {
        setStat("signal-lost", "Gagal memuat pemutar HLS.");
      }
    })();
    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [mode, hlsUrl, wheUrl, status, setStat, streamKey]);

  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
  }, []);

  function manualRetry() {
    setAttempt((a) => a + 1);
    setStat("connecting", "Menyambung ulang…");
  }

  function forcePlay() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.play().then(() => {
      setNeedsPlay(false);
      setStat("live");
    }).catch(() => setStat("blocked", "Ketuk tombol PLAY untuk menonton."));
  }

  const showIdle =
    mode === "offline" || (mode === "mediamtx" && !wheUrl && !hlsUrl) || (mode === "youtube" && !ytId);
  const isYouTube = mode === "youtube" && Boolean(ytId);
  const showVideo = mode === "mediamtx" && (wheUrl || hlsUrl) && !showIdle;

  return (
    <div className={cn("relative overflow-hidden border border-fs-edge bg-black", className)}>
      <div className="relative aspect-video w-full">
        {isYouTube ? (
          <iframe
            className="h-full w-full"
            src={`https://www.youtube.com/embed/${ytId}?autoplay=0&rel=0&modestbranding=1`}
            title="Siaran langsung turnamen"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : showVideo ? (
          <video
            ref={videoRef}
            data-zeroid-preview={undefined}
            className="h-full w-full object-contain"
            autoPlay
            muted={muted}
            playsInline
            onPlaying={() => { setStat("live"); setNeedsPlay(false); }}
            onStalled={() => setStatus((s) => (s === "live" ? "reconnecting" : s))}
            onWaiting={() => setStatus((s) => (s === "live" ? "reconnecting" : s))}
          />
        ) : null}

        {showIdle ? (
          <div className="absolute inset-0 flex items-center justify-center">
            {idleContent ?? (
              <div className="flex flex-col items-center gap-3 px-6 text-center">
                <Radio className="h-10 w-10 text-white/25" aria-hidden />
                <p className="font-display text-lg font-bold uppercase tracking-[0.2em] text-white/70">
                  Signal Belum Aktif
                </p>
                <p className="max-w-sm text-xs text-white/50">
                  Panitia belum menyiarkan gameplay. Buka halaman ini lagi saat siaran dimulai —
                  video akan tersambung otomatis.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {/* Overlay status — jujur sesuai koneksi (§8: area video tidak boleh kosong tanpa penjelasan) */}
        {!showIdle && status !== "live" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/72 px-6 text-center">
            {status === "connecting" ? (
              <>
                <span className="fs-connecting inline-block h-10 w-10 rounded-full border-2 border-fs-cyan border-t-transparent motion-safe:animate-spin" />
                <p className="font-display text-base font-bold uppercase tracking-[0.22em] text-fs-cyan">
                  Menghubungkan Stream…
                </p>
                {detail ? <p className="text-xs text-white/55">{detail}</p> : null}
              </>
            ) : status === "reconnecting" ? (
              <>
                <RefreshCw className="fs-connecting h-9 w-9 text-fs-gold" />
                <p className="font-display text-base font-bold uppercase tracking-[0.22em] text-fs-gold">
                  Reconnecting…
                </p>
                {detail ? <p className="text-xs text-white/55">{detail}</p> : null}
              </>
            ) : status === "signal-lost" ? (
              <>
                <WifiOff className="h-9 w-9 text-fs-err" />
                <p className="font-display text-base font-bold uppercase tracking-[0.22em] text-fs-err">
                  Signal Lost
                </p>
                {detail ? <p className="max-w-sm text-xs text-white/60">{detail}</p> : null}
                <button onClick={manualRetry} className="bo-btn bo-btn-fire mt-2 !px-4 !py-2 text-xs">
                  <RefreshCw className="h-3.5 w-3.5" /> Coba Lagi
                </button>
              </>
            ) : status === "blocked" || (needsPlay && status === "connecting") ? (
              <>
                <button
                  onClick={forcePlay}
                  className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-fs-fire bg-fs-fire/20 text-fs-fire transition hover:scale-105 hover:bg-fs-fire/30"
                  aria-label="Putar siaran"
                >
                  <Play className="h-7 w-7 fill-current" />
                </button>
                <p className="text-xs font-bold uppercase tracking-widest text-white/70">
                  Ketuk untuk memutar (autoplay diblokir TV)
                </p>
              </>
            ) : null}
          </div>
        ) : null}

        {/* LIVE badge saat benar-benar live */}
        {status === "live" ? (
          <div className="absolute left-3 top-3 flex items-center gap-2">
            <span className="fs-live-badge inline-flex items-center gap-1.5 bg-fs-err px-2.5 py-1 font-display text-xs font-black uppercase tracking-[0.2em] text-white">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-white" /> LIVE
            </span>
          </div>
        ) : null}

        {/* Kontrol audio */}
        {showVideo && status === "live" ? (
          <button
            onClick={() => setMuted((m) => !m)}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center border border-white/25 bg-black/55 text-white/85 hover:bg-black/75"
            aria-label={muted ? "Bunyikan audio" : "Bisukan audio"}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      {/* Bar info sumber */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-fs-edge bg-fs-head px-3 py-2">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-fs-muted">
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              status === "live" ? "bg-fs-ok" : status === "connecting" || status === "reconnecting" ? "bg-fs-gold" : "bg-fs-muted/40",
            )}
          />
          {isYouTube
            ? "YouTube Live · Internet"
            : showVideo
              ? `Local Stream · ${status === "live" ? "WebRTC/HLS" : "MediaMTX"}`
              : "Stream Offline"}
        </span>
        {broadcast?.streamTitle ? (
          <span className="truncate text-xs font-semibold text-fs-muted">{broadcast.streamTitle}</span>
        ) : null}
      </div>
      {detail && status === "signal-lost" && !showIdle ? (
        <div className="flex items-center gap-2 border-t border-fs-err/40 bg-fs-err/10 px-3 py-2 text-xs font-bold text-fs-err">
          <AlertTriangle className="h-4 w-4" /> {detail}
        </div>
      ) : null}
    </div>
  );
}
