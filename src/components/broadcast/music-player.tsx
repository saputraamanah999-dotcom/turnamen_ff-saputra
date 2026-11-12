"use client";
// ============================================================
// STIKAR ESPORTS — MUSIK LATAR SIARAN (penonton)
// Mengikuti broadcastSettings/{tid}.music realtime:
//   - MP3  : <audio loop> dengan src URL langsung
//   - YT   : iframe embed tersembunyi (loop=1&playlist=ID)
// Volume diatur panitia (0–100). Kebijakan autoplay: pemutaran
// dimulai saat interaksi pertama di halaman (klik/ketuk apa pun);
// chip status di kiri bawah video menampilkan kondisi musik.
// Dipasang di dalam LiveVideoPlayer → otomatis aktif di /live,
// /display (TV), dan halaman interaktif, semua mode stream.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Music2 } from "lucide-react";
import { parseYouTubeId } from "@/components/video/player";
import { onFirstGesture } from "@/components/broadcast/sfx";
import type { BroadcastSettings, MusicTrack } from "@/lib/types";

/** Lagu aktif: activeTrackId → bila hilang, pakai lagu pertama. */
export function resolveActiveTrack(music: BroadcastSettings["music"]): MusicTrack | null {
  if (!music || !music.tracks?.length) return null;
  return music.tracks.find((t) => t.id === music.activeTrackId) ?? music.tracks[0];
}

function ytCommand(win: Window | null, func: string, args: (string | number)[] = []) {
  win?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
}

export function MusicPlayer({ broadcast }: { broadcast: BroadcastSettings | null }) {
  const music = broadcast?.music;
  const enabled = music?.enabled === true;
  const volume = Math.min(100, Math.max(0, music?.volume ?? 40));
  const track = resolveActiveTrack(music);
  const playing = enabled && Boolean(track);

  const audioRef = useRef<HTMLAudioElement>(null);
  const ytRef = useRef<HTMLIFrameElement>(null);
  const [started, setStarted] = useState(false); // sudah lewat interaksi pertama
  const isYt = track?.type === "yt" && Boolean(track.ytId);
  const isMp3 = track?.type === "mp3" && Boolean(track.url);

  // Interaksi pertama → musik mulai bersuara (MP3 & YouTube sama-sama di-unmute).
  useEffect(() => {
    return onFirstGesture(() => setStarted(true));
  }, []);

  // ---------- MP3 ----------
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !isMp3) return;
    a.volume = volume / 100;
    if (playing && started) {
      void a.play().catch(() => { /* autoplay ditolak — menunggu interaksi */ });
    } else {
      a.pause();
    }
  }, [playing, started, volume, isMp3, track?.id]);

  // ---------- YouTube / YT Music ----------
  useEffect(() => {
    if (!isYt) return;
    const win = ytRef.current?.contentWindow ?? null;
    if (!win) return;
    ytCommand(win, "setVolume", [volume]);
    if (playing && started) {
      ytCommand(win, "unMute");
      ytCommand(win, "playVideo");
    } else {
      ytCommand(win, "mute");
      ytCommand(win, "pauseVideo");
    }
  }, [playing, started, volume, isYt, track?.ytId]);

  if (!playing || (!isMp3 && !isYt)) return null;

  return (
    <>
      {/* Audio MP3 (loop) */}
      {isMp3 ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio ref={audioRef} src={track!.url} loop preload="auto" className="hidden" />
      ) : null}

      {/* YouTube / YT Music tersembunyi — loop via parameter playlist */}
      {isYt ? (
        <iframe
          key={track!.ytId}
          ref={ytRef}
          title="Musik latar siaran"
          className="pointer-events-none absolute bottom-0 left-0 h-px w-1 opacity-0"
          src={`https://www.youtube.com/embed/${track!.ytId}?autoplay=1&mute=1&loop=1&playlist=${track!.ytId}&playsinline=1&controls=0&disablekb=1&modestbranding=1&iv_load_policy=3&enablejsapi=1`}
          allow="autoplay; encrypted-media"
          tabIndex={-1}
          aria-hidden
        />
      ) : null}

      {/* Chip status musik */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="pointer-events-none absolute bottom-3 left-3 z-10 flex max-w-[75%] items-center gap-2 border border-fs-gold/40 bg-black/65 px-2.5 py-1.5 backdrop-blur-sm"
      >
        <Music2 className="h-3.5 w-3.5 shrink-0 text-fs-gold" />
        <span className="flex items-end gap-[2px]" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`fs-eq-bar w-[3px] rounded-sm bg-fs-gold ${started ? "" : "opacity-40"}`}
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </span>
        <span className="truncate text-[10px] font-black uppercase tracking-wider text-white/85">
          {started ? track!.title : `Musik siap — ketuk untuk suara: ${track!.title}`}
        </span>
      </motion.div>
    </>
  );
}

/** Validasi input lagu dari admin → MusicTrack | pesan galat. */
export function parseTrackInput(rawUrl: string, rawTitle: string): { track?: MusicTrack; error?: string } {
  const url = rawUrl.trim();
  if (!url) return { error: "Tempel URL lagu dulu (MP3 atau YouTube/YT Music)." };
  const ytId = parseYouTubeId(url);
  if (ytId) {
    const title = rawTitle.trim() || `YouTube · ${ytId}`;
    return { track: { id: `yt-${ytId}-${Date.now().toString(36)}`, title, type: "yt", ytId } };
  }
  if (!/^https?:\/\//i.test(url)) {
    return { error: "Link tidak dikenali. Pakai URL MP3 langsung (…/lagu.mp3) atau link YouTube / YT Music." };
  }
  let name = "Lagu MP3";
  try {
    const path = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    if (path) name = decodeURIComponent(path).replace(/\.[a-z0-9]+$/i, "");
  } catch { /* pakai default */ }
  const title = rawTitle.trim() || name;
  return { track: { id: `mp3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, title, type: "mp3", url } };
}
