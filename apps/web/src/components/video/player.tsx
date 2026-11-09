"use client";
// ============================================================
// ZEROID ESPORTS — Video player live
// Sumber didukung: YouTube Live embed & MediaMTX (HLS, LAN).
// Status offline ditampilkan JUJUR — tidak ada video palsu.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BroadcastSettings } from "@/lib/types";

export function LiveVideoPlayer({
  broadcast,
  className,
}: {
  broadcast: BroadcastSettings | null;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mode = broadcast?.streamMode ?? "offline";
  const ytId = broadcast?.youtubeVideoId?.trim() ?? "";
  const hlsUrl = broadcast?.hlsUrl?.trim() ?? "";

  // Muat HLS (MediaMTX) bila dipakai.
  useEffect(() => {
    if (mode !== "mediamtx" || !hlsUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const Hls = (await import("hls.js")).default;
        if (cancelled || !videoRef.current) return;
        if (Hls.isSupported()) {
          const hls = new Hls({ lowLatencyMode: true });
          hls.loadSource(hlsUrl);
          hls.attachMedia(videoRef.current);
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) setError("Stream lokal tidak dapat diputar. Pastikan MediaMTX berjalan di laptop produksi.");
          });
          hlsRef.current = hls;
        } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
          videoRef.current.src = hlsUrl;
        } else {
          setError("Browser tidak mendukung HLS.");
        }
      } catch {
        setError("Gagal memuat pemutar HLS.");
      }
    })();
    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [mode, hlsUrl]);

  return (
    <div className={cn("bo-card-lg overflow-hidden bg-zb-black", className)}>
      <div className="aspect-video w-full bg-black">
        {mode === "youtube" && ytId ? (
          <iframe
            className="h-full w-full"
            src={`https://www.youtube.com/embed/${ytId}?autoplay=0&rel=0&modestbranding=1`}
            title="Siaran langsung turnamen"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : mode === "mediamtx" && hlsUrl ? (
           
          <video ref={videoRef} className="h-full w-full" controls autoPlay muted playsInline />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <Radio className="h-10 w-10 text-white/30" aria-hidden />
            <p className="font-display text-lg font-black uppercase text-white/70">
              Stream Belum Aktif
            </p>
            <p className="max-w-sm text-xs text-white/50">
              Panitia belum menyiarkan video. Untuk menyiarkan: jalankan OBS Studio dengan
              YouTube Live (mode publik) atau MediaMTX (mode LAN sekolah), lalu atur di
              <strong> Admin → Broadcast Control</strong>.
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t-[3px] border-zb-black bg-white px-3 py-2">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
          <span
            className={cn(
              "inline-block h-2.5 w-2.5 rounded-full",
              mode !== "offline" ? "bg-red-500" : "bg-zb-black/30",
            )}
          />
          {mode === "youtube"
            ? "YouTube Live"
            : mode === "mediamtx"
              ? "MediaMTX · LAN Sekolah"
              : "Stream Offline"}
        </span>
        {broadcast?.streamTitle ? (
          <span className="truncate text-xs font-semibold text-zb-black/60">{broadcast.streamTitle}</span>
        ) : null}
      </div>
      {error ? (
        <div className="flex items-center gap-2 border-t-[3px] border-zb-black bg-zb-yellow px-3 py-2 text-xs font-bold">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      ) : null}
    </div>
  );
}
