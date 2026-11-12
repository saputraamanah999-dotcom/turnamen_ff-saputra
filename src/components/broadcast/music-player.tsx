"use client";
// ============================================================
// STIKAR ESPORTS — MUSIK LATAR SIARAN (penonton)
// Mengikuti broadcastSettings/{tid}.music realtime (TANPA refresh):
//   - Audio langsung : <audio loop> — link MP3/M4A/OGG/WAV/AAC/OPUS
//                      dari host mana pun (Google Drive & Dropbox
//                      otomatis dikonversi ke link unduhan langsung)
//   - YouTube/YT M.  : iframe embed tersembunyi (loop=1&playlist=ID)
// AUTOPLAY MAKSIMAL (kebijakan browser):
//   1. Begitu lagu aktif → langsung coba play() BERSUARA.
//      Kalau browser mengizinkan (kunjungan sebelumnya/MEI) → musik
//      langsung terdengar TANPA ketukan apa pun.
//   2. Kalau ditolak → musik tetap diputar dalam keadaan SENYAP,
//      lalu suara dinyalakan otomatis pada SENTUHAN/KLIK/KETUKAN
//      PERTAMA DI MANA PUN di halaman (tidak harus menekan chip musik).
//   3. Setiap kali tab kembali terlihat (visibilitychange) → coba lagi.
// Volume diatur panitia (0–100). Chip status di kiri bawah video.
// Dipasang di dalam LiveVideoPlayer → aktif di /live, /display (TV),
// dan halaman interaktif, semua mode stream.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
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

const AUDIO_EXT_RE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|webm|flac)(\?|#|$)/i;

/** Link audio apa pun → URL yang benar-benar bisa diputar <audio>. */
export function normalizeAudioUrl(raw: string): string {
  const url = raw.trim();
  // Google Drive "share" → unduhan langsung (bekerja untuk file audio publik)
  const gd = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (gd) return `https://drive.google.com/uc?export=download&id=${gd[1]}`;
  // Dropbox → parameter raw=1 (direct)
  if (/dropbox\.com/i.test(url)) {
    const base = url.replace(/[?&](dl|raw)=\d/g, "").replace(/\?$/, "");
    return base + (base.includes("?") ? "&" : "?") + "raw=1";
  }
  return url;
}

/** Nama lagu bawaan dari nama file URL. */
function guessAudioTitle(url: string): string {
  try {
    const path = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    if (path) return decodeURIComponent(path).replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
  } catch { /* pakai default */ }
  return "Lagu Siaran";
}

export function MusicPlayer({ broadcast }: { broadcast: BroadcastSettings | null }) {
  const music = broadcast?.music;
  const enabled = music?.enabled === true;
  const volume = Math.min(100, Math.max(0, music?.volume ?? 40));
  const track = resolveActiveTrack(music);
  const playing = enabled && Boolean(track);

  const audioRef = useRef<HTMLAudioElement>(null);
  const ytRef = useRef<HTMLIFrameElement>(null);
  // soundOn = musik BENAR-BENAR terdengar (autoplay lolos ATAU sudah ada sentuhan).
  const [soundOn, setSoundOn] = useState(false);
  const [mutedPlaying, setMutedPlaying] = useState(false); // diputar senyap, menunggu ketukan

  const isYt = track?.type === "yt" && Boolean(track.ytId);
  const isMp3 = track?.type === "mp3" && Boolean(track.url);

  /** YT: coba bunyikan + putar SEKARANG (berhasil bila browser mengizinkan). */
  const tryYtSound = useCallback(() => {
    const win = ytRef.current?.contentWindow ?? null;
    if (!win) return;
    ytCommand(win, "setVolume", [volume]);
    ytCommand(win, "unMute");
    ytCommand(win, "playVideo");
  }, [volume]);

  // ---------- Percobaan 1: autoplay BERSUARA sejak awal ----------
  useEffect(() => {
    if (!playing) {
      setSoundOn(false);
      setMutedPlaying(false);
      return;
    }
    if (!isMp3) return;
    const a = audioRef.current;
    if (!a) return;
    let cancelled = false;
    a.muted = false;
    a.volume = volume / 100;
    a.play().then(() => {
      if (!cancelled) { setSoundOn(true); setMutedPlaying(false); }
    }).catch(() => {
      // Ditolak browser → putar SENYAP dulu (hampir selalu diizinkan),
      // suara menyala otomatis pada ketukan pertama di mana pun.
      if (cancelled) return;
      a.muted = true;
      a.volume = volume / 100;
      a.play().then(() => { if (!cancelled) setMutedPlaying(true); }).catch(() => { /* biarkan */ });
    });
    return () => { cancelled = true; };
  }, [playing, isMp3, track?.id, volume]);

  // ---------- Percobaan 2: ketukan/klik/sentuhan pertama DI MANA PUN ----------
  useEffect(() => {
    return onFirstGesture(() => {
      setSoundOn(true);
      setMutedPlaying(false);
      const a = audioRef.current;
      if (a) { a.muted = false; void a.play().catch(() => { /* tetap gagal — chip memberi tahu */ }); }
      tryYtSound();
    });
  }, [tryYtSound]);

  // ---------- Percobaan 3: tab kembali terlihat → coba nyalakan lagi ----------
  useEffect(() => {
    if (!playing) return;
    const onVis = () => {
      if (document.visibilityState !== "visible" || soundOn) return;
      const a = audioRef.current;
      if (a && isMp3) {
        a.muted = false;
        void a.play().then(() => setSoundOn(true)).catch(() => { /* nanti lagi */ });
      }
      if (isYt) tryYtSound();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [playing, soundOn, isMp3, isYt, tryYtSound]);

  // ---------- Kontrol volume & play/pause MP3 ----------
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !isMp3) return;
    a.volume = volume / 100;
    if (!playing) a.pause();
    else if (soundOn || mutedPlaying) void a.play().catch(() => { /* ditangani efek lain */ });
  }, [playing, volume, soundOn, mutedPlaying, isMp3]);

  // ---------- Kontrol YouTube / YT Music ----------
  useEffect(() => {
    if (!isYt) return;
    const win = ytRef.current?.contentWindow ?? null;
    if (!win) return;
    ytCommand(win, "setVolume", [volume]);
    if (playing && soundOn) {
      tryYtSound();
    } else if (!playing) {
      ytCommand(win, "mute");
      ytCommand(win, "pauseVideo");
    }
  }, [playing, soundOn, volume, isYt, track?.ytId, tryYtSound]);

  if (!playing || (!isMp3 && !isYt)) return null;

  return (
    <>
      {/* Audio langsung (loop) — link dari host mana pun */}
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
              className={`fs-eq-bar w-[3px] rounded-sm bg-fs-gold ${soundOn ? "" : "opacity-40"}`}
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </span>
        <span className="truncate text-[10px] font-black uppercase tracking-wider text-white/85">
          {soundOn
            ? track!.title
            : mutedPlaying
              ? `Musik menyala otomatis — sentuh layar sekali untuk suara: ${track!.title}`
              : `Musik diputar otomatis — sentuh layar sekali jika belum terdengar: ${track!.title}`}
        </span>
      </motion.div>
    </>
  );
}

/** Validasi input lagu dari admin → MusicTrack | pesan galat.
 *  Menerima: link audio langsung dari host mana pun (MP3/M4A/OGG/WAV/AAC/OPUS/…),
 *  link Google Drive & Dropbox (otomatis dikonversi), dan YouTube / YT Music. */
export function parseTrackInput(rawUrl: string, rawTitle: string): { track?: MusicTrack; error?: string; warning?: string } {
  const raw = rawUrl.trim();
  if (!raw) return { error: "Tempel link lagu dulu (audio langsung apa pun, atau YouTube / YT Music)." };

  const ytId = parseYouTubeId(raw);
  if (ytId) {
    const title = rawTitle.trim() || `YouTube · ${ytId}`;
    return { track: { id: `yt-${ytId}-${Date.now().toString(36)}`, title, type: "yt", ytId } };
  }

  if (!/^https?:\/\//i.test(raw)) {
    return {
      error:
        "Link tidak dikenali. Tempel link audio langsung (…/lagu.mp3), link Google Drive/Dropbox, atau link YouTube / YT Music.",
    };
  }

  const url = normalizeAudioUrl(raw);
  const converted = url !== raw;
  const looksDirect = AUDIO_EXT_RE.test(url);
  const warning = looksDirect || converted
    ? undefined
    : "Link tidak berakhiran file audio — pastikan link itu MEMBUKA/MEMUTAR audio langsung di browser, bukan halaman web biasa.";

  const title = rawTitle.trim() || guessAudioTitle(url);
  return { track: { id: `mp3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, title, type: "mp3", url }, warning };
}
