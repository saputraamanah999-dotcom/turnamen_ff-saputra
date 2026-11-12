"use client";
// ============================================================
// STIKAR ESPORTS — PANEL ADMIN BROADCAST (fitur pengayaan siaran)
// Dipakai /admin/broadcast:
//   - MusicPanel    : kelola musik latar (MP3 / YouTube Music),
//                     volume, lagu aktif, loop — realtime ke penonton
//   - SfxPanel      : tombol sound effect esport (beep, BOOYAH!,
//                     airhorn, tepuk tangan, dsb.) → semua penonton
//   - PresencePanel : indikator penonton online realtime
//   - PodiumPanel   : toggle "Panggung Juara" di TV & /live
//   - ObsGuideHint  : ringkasan pengaturan OBS/YouTube anti-delay
// Semua perubahan ditulis ke broadcastSettings/{tid} (merge).
// ============================================================

import { useState } from "react";
import {
  Eye, ListMusic, Music2, PartyPopper, Play, Plus, Trash2, Trophy, Volume2,
} from "lucide-react";
import { BoBadge, BoButton, BoCard } from "@/components/common/bo";
import { parseYouTubeId } from "@/components/video/player";
import { parseTrackInput, resolveActiveTrack } from "@/components/broadcast/music-player";
import { playSfx, SFX_CATALOG } from "@/components/broadcast/sfx";
import { useLivePresence } from "@/services/broadcast/presence";
import type { BroadcastSettings, MusicSettings } from "@/lib/types";

type PatchFn = (patch: Partial<BroadcastSettings>, okMsg: string) => Promise<void>;

const DEFAULT_MUSIC: MusicSettings = { enabled: false, volume: 40, tracks: [], activeTrackId: null };

/** Pastikan field music lengkap sebelum merge (tidak menimpa yang sudah ada). */
function withMusic(music: MusicSettings | undefined, changes: Partial<MusicSettings>): MusicSettings {
  return { ...DEFAULT_MUSIC, ...(music ?? {}), ...changes };
}

// ============================================================
// MUSIK SIARAN
// ============================================================
export function MusicPanel({ tid, settings, patch }: { tid: string | null; settings: Partial<BroadcastSettings>; patch: PatchFn }) {
  const music = settings.music;
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [vol, setVol] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const tracks = music?.tracks ?? [];
  const activeId = music?.activeTrackId ?? tracks[0]?.id ?? null;
  const shownVol = vol ?? music?.volume ?? 40;

  async function addTrack() {
    setErr("");
    const { track, error } = parseTrackInput(url, title);
    if (!track || error) {
      setErr(error ?? "Link tidak dikenali.");
      return;
    }
    if (tracks.some((t) => (t.ytId && t.ytId === track.ytId) || (t.url && t.url === track.url))) {
      setErr("Lagu ini sudah ada di daftar.");
      return;
    }
    const next = withMusic(music, {
      tracks: [...tracks, track],
      // Lagu pertama otomatis jadi lagu aktif.
      activeTrackId: activeId ?? track.id,
      enabled: music?.enabled ?? true,
    });
    await patch({ music: next }, `Lagu "${track.title}" ditambahkan${tracks.length === 0 ? " & mulai diputar (loop)" : ""}`);
    setUrl("");
    setTitle("");
  }

  async function removeTrack(id: string) {
    const rest = tracks.filter((t) => t.id !== id);
    const next = withMusic(music, {
      tracks: rest,
      activeTrackId: activeId === id ? (rest[0]?.id ?? null) : activeId,
    });
    await patch({ music: next }, "Lagu dihapus dari daftar");
  }

  async function setActive(id: string) {
    await patch({ music: withMusic(music, { activeTrackId: id, enabled: true }) }, "Lagu aktif diganti — penonton langsung mendengar");
  }

  async function commitVolume() {
    if (vol === null) return;
    const v = Math.min(100, Math.max(0, vol));
    setVol(null);
    await patch({ music: withMusic(music, { volume: v }) }, `Volume musik: ${v}%`);
  }

  const active = resolveActiveTrack(music);

  return (
    <BoCard className="bg-fs-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-base font-black uppercase">
          <Music2 className="h-4 w-4" /> Musik Latar Siaran <span className="text-[10px] font-bold text-fs-text/40">(loop)</span>
        </h2>
        <label className="flex items-center gap-2 text-xs font-bold">
          <input
            type="checkbox"
            className="h-4 w-4 accent-orange-500"
            checked={music?.enabled === true}
            onChange={(e) => void patch({ music: withMusic(music, { enabled: e.target.checked }) }, e.target.checked ? "Musik latar AKTIF di semua penonton" : "Musik latar dimatikan")}
          />
          Aktif
        </label>
      </div>
      <p className="mt-1 text-[11px] font-semibold text-fs-text/50">
        Terima link <b>MP3 langsung</b> (…/lagu.mp3) atau <b>YouTube / YT Music</b> (music.youtube.com). Lagu diputar
        berulang di TV &amp; halaman penonton; suara baru keluar setelah penonton menyentuh halaman (kebijakan autoplay browser).
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className="bo-input min-w-0 flex-1"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://music.youtube.com/watch?v=… atau https://…/lagu.mp3"
        />
        <input
          className="bo-input w-44"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Judul (opsional)"
        />
        <BoButton variant="primary" className="!px-3 !py-2 !text-xs" disabled={!tid || !url.trim()} onClick={() => void addTrack()}>
          <Plus className="h-3.5 w-3.5" /> Tambah
        </BoButton>
      </div>
      {err ? <p className="mt-1.5 text-[11px] font-bold text-fs-err">{err}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex min-w-56 flex-1 items-center gap-2 text-[11px] font-black uppercase tracking-wider">
          <Volume2 className="h-4 w-4 shrink-0" /> Volume penonton: {shownVol}%
          <input
            type="range"
            min={0}
            max={100}
            value={shownVol}
            onChange={(e) => setVol(Number(e.target.value))}
            onPointerUp={() => void commitVolume()}
            onKeyUp={() => void commitVolume()}
            className="flex-1 accent-orange-500"
          />
        </label>
      </div>

      {tracks.length ? (
        <ul className="mt-3 space-y-1.5">
          {tracks.map((t) => {
            const isActive = t.id === activeId;
            return (
              <li
                key={t.id}
                className={`flex flex-wrap items-center gap-2 border px-2.5 py-1.5 text-xs font-bold ${isActive ? "border-fs-gold/60 bg-fs-gold/10" : "border-fs-edge"}`}
              >
                <span className={`shrink-0 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${isActive ? "bg-fs-gold text-fs-ink" : "bg-fs-head text-white/70"}`}>
                  {t.type === "yt" ? "YT" : "MP3"}
                </span>
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                {isActive ? <BoBadge className="bg-fs-gold/20 text-fs-gold">DIPUTAR</BoBadge> : null}
                {!isActive ? (
                  <BoButton variant="cyan" className="!px-2 !py-1 !text-[10px]" onClick={() => void setActive(t.id)}>
                    <Play className="h-3 w-3" /> Pakai
                  </BoButton>
                ) : null}
                <BoButton
                  variant="white"
                  className="!px-2 !py-1 !text-[10px]"
                  onClick={() => setPreview(preview === t.id ? null : t.id)}
                >
                  {preview === t.id ? "Tutup" : "Pratinjau"}
                </BoButton>
                <BoButton variant="destructive" className="!px-2 !py-1 !text-[10px]" onClick={() => void removeTrack(t.id)}>
                  <Trash2 className="h-3 w-3" />
                </BoButton>
                {preview === t.id ? (
                  <div className="w-full">
                    {t.type === "mp3" ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <audio controls src={t.url} className="h-8 w-full" />
                    ) : (
                      <iframe
                        title={`Pratinjau ${t.title}`}
                        className="aspect-video w-full max-w-[280px] border border-fs-edge"
                        src={`https://www.youtube.com/embed/${t.ytId}?autoplay=1`}
                        allow="autoplay; encrypted-media"
                      />
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-[11px] font-semibold text-fs-text/40">
          Belum ada lagu — tambahkan link pertama. Lagu pertama otomatis diputar (loop) saat musik diaktifkan.
        </p>
      )}

      {music?.enabled && active ? (
        <p className="mt-2 text-[11px] font-bold text-fs-ok">
          Sedang diputar (loop): “{active.title}” · volume {music.volume ?? 40}% — berlaku di TV, /live &amp; halaman interaktif.
        </p>
      ) : null}
    </BoCard>
  );
}

// ============================================================
// SOUND FX
// ============================================================
export function SfxPanel({ tid, settings, patch }: { tid: string | null; settings: Partial<BroadcastSettings>; patch: PatchFn }) {
  async function fire(type: (typeof SFX_CATALOG)[number]["type"], label: string) {
    playSfx(type, 0.9); // panitia ikut mendengar
    await patch({ sfx: { type, at: Date.now() } }, `SFX “${label}” dikirim ke semua penonton`);
  }
  return (
    <BoCard className="bg-fs-panel p-5">
      <h2 className="flex items-center gap-2 font-display text-base font-black uppercase">
        <PartyPopper className="h-4 w-4" /> Sound Effect Esport — satu klik ke semua penonton
      </h2>
      <p className="mt-1 text-[11px] font-semibold text-fs-text/50">
        Semua perangkat penonton (TV &amp; /live) membunyikan efek ini seketika — pas untuk momen BOOYAH, mulai match,
        dan penutupan. Beep &amp; Game Start juga bunyi OTOMATIS saat countdown/sekuens mulai game berjalan.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SFX_CATALOG.map((s) => (
          <BoButton
            key={s.type}
            variant={s.type === "booyah" ? "primary" : s.type === "airhorn" ? "cyan" : "white"}
            className="!flex-col !items-start !gap-0.5 !px-3 !py-2 !text-left !text-xs"
            disabled={!tid}
            onClick={() => void fire(s.type, s.label)}
          >
            <span className="font-display text-[11px] font-black uppercase tracking-wider">{s.label}</span>
            <span className="text-[9px] font-semibold normal-case tracking-normal opacity-60">{s.desc}</span>
          </BoButton>
        ))}
      </div>
      <p className="mt-2 text-[10px] font-semibold text-fs-text/40">
        SFX terakhir terkirim: {settings.sfx ? `${settings.sfx.type} · ${new Date(settings.sfx.at).toLocaleTimeString("id-ID")}` : "belum ada"}
      </p>
    </BoCard>
  );
}

// ============================================================
// PENONTON ONLINE
// ============================================================
export function PresencePanel({ tid }: { tid: string | null }) {
  const { count, viewers, status } = useLivePresence(tid);
  return (
    <BoCard className="bg-fs-panel p-5">
      <h2 className="flex items-center gap-2 font-display text-base font-black uppercase">
        <Eye className="h-4 w-4" /> Penonton Online <span className="animate-pulse text-fs-cyan">●</span>
      </h2>
      <p className="mt-1 text-[11px] font-semibold text-fs-text/50">
        Dihitung dari halaman /live, TV /display &amp; halaman interaktif (heartbeat tiap 20 detik; dianggap offline
        setelah ±1 menit menutup halaman). Admin tidak ikut terhitung.
      </p>
      <div className="mt-3">
        <div className="flex items-baseline gap-3">
          <span className="font-stat text-5xl font-black tabular-nums text-fs-cyan">{count}</span>
          <span className="text-xs font-black uppercase tracking-widest text-fs-muted">
            {status === "online" ? "perangkat menonton" : status === "connecting" ? "menghubungkan…" : "database tidak terjangkau"}
          </span>
        </div>
        {viewers.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {viewers.slice(0, 24).map((v) => (
              <span key={v.id} className="border border-fs-cyan/30 bg-fs-cyan/10 px-1.5 py-0.5 text-[10px] font-bold text-white/85">
                {v.name}
              </span>
            ))}
            {viewers.length > 24 ? (
              <span className="px-1 text-[10px] font-black uppercase text-fs-cyan">+{viewers.length - 24} lainnya</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </BoCard>
  );
}

// ============================================================
// PANGGUNG JUARA
// ============================================================
export function PodiumPanel({ tid, settings, patch }: { tid: string | null; settings: Partial<BroadcastSettings>; patch: PatchFn }) {
  const on = settings.presentation?.podium === true;
  return (
    <BoCard className="bg-fs-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-base font-black uppercase">
          <Trophy className="h-4 w-4" /> Panggung Juara (podium Top 3)
        </h2>
        <label className="flex items-center gap-2 text-xs font-bold">
          <input
            type="checkbox"
            className="h-4 w-4 accent-orange-500"
            checked={on}
            onChange={(e) => void patch({ presentation: { ...(settings.presentation ?? {}), podium: e.target.checked } }, e.target.checked ? "PANGGUNG JUARA tampil di TV & /live" : "Panggung juara disembunyikan")}
          />
          Tampilkan
        </label>
      </div>
      <p className="mt-1 text-[11px] font-semibold leading-relaxed text-fs-text/50">
        Saat aktif: layar TV &amp; /live berganti jadi podium emas/perak/perunggu penuh animasi (mahkota melayang,
        shimmer, confetti) berdasarkan klasemen realtime + status juara resmi. Cocok di akhir turnamen atau sesi
        pengumuman juara. Nonaktifkan untuk kembali ke siaran.
      </p>
      {!tid ? <p className="mt-2 text-[11px] font-bold text-fs-gold">Belum ada turnamen aktif.</p> : null}
    </BoCard>
  );
}

// ============================================================
// PANDUAN OBS × YOUTUBE (ringkas — dokumen lengkap di repo)
// ============================================================
export function ObsGuideHint() {
  const rows = [
    { res: "1280×720 (720p60)", fps: "60", bitrate: "4 500–6 000 Kbps" },
    { res: "1920×1080 (1080p60)", fps: "60", bitrate: "6 000–9 000 Kbps" },
    { res: "1280×720 (720p30)", fps: "30", bitrate: "3 000–4 000 Kbps" },
  ];
  return (
    <BoCard className="bg-fs-panel p-5">
      <h2 className="flex items-center gap-2 font-display text-base font-black uppercase">
        <ListMusic className="h-4 w-4" /> Siaran Lancar — OBS &amp; YouTube (ringkasan)
      </h2>
      <ul className="mt-2 space-y-1.5 text-[11px] font-semibold leading-relaxed text-fs-text/70">
        <li>• OBS → Settings → Output: <b>Rate Control CBR</b>, Keyframe Interval <b>2 s</b> (paling berpengaruh ke delay), Encoder NVENC/x264 preset “quality”/“veryfast”.</li>
        <li>• YouTube Studio → Stream: Latency <b>Low (±5–10 dtk)</b> atau Normal (±15–30 dtk paling stabil); aktifkan DVR.</li>
        <li>• Internet upload minimal <b>1,5× bitrate</b> (mis. 6000 Kbps → upload ≥ 9 Mbps). Kabel LAN lebih stabil daripada Wi-Fi.</li>
        <li>• Resolusi jangan lebih tinggi dari bitrate — tabel aman:</li>
      </ul>
      <table className="mt-2 w-full text-left text-[11px] font-bold">
        <thead>
          <tr className="border-b border-fs-edge text-[10px] uppercase tracking-widest text-fs-muted">
            <th className="py-1">Resolusi</th><th className="py-1">FPS</th><th className="py-1">Bitrate OBS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.res} className="border-b border-fs-edge/40">
              <td className="py-1">{r.res}</td><td className="py-1 tabular-nums">{r.fps}</td><td className="py-1 tabular-nums text-fs-cyan">{r.bitrate}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] font-semibold text-fs-text/40">
        Panduan lengkap langkah-demi-langkah (dari buat channel sampai siaran lancar):
        <code className="ml-1 border border-fs-edge bg-fs-bg px-1.5 py-0.5">documentation/OBS_YOUTUBE_GUIDE.md</code>
      </p>
    </BoCard>
  );
}
