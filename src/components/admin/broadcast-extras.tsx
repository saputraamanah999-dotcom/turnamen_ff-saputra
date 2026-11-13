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

import { useEffect, useState } from "react";
import {
  Cast, Copy, Eye, ListMusic, MonitorUp, Music2, PartyPopper, Play, Plus, RefreshCw, Trash2, Trophy, Volume2, Zap,
} from "lucide-react";
import { BoBadge, BoButton, BoCard } from "@/components/common/bo";
import { parseYouTubeId } from "@/components/video/player";
import { parseTrackInput, resolveActiveTrack } from "@/components/broadcast/music-player";
import { playSfx, SFX_CATALOG } from "@/components/broadcast/sfx";
import { useLivePresence } from "@/services/broadcast/presence";
import {
  casterUrl, formatPairCodeSafe, rotateCasterCode, startCasterSession, stopCasterSession,
} from "@/services/broadcast/caster";
import { useQr } from "@/services/broadcast/heartbeat";
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
  const [warn, setWarn] = useState("");

  const tracks = music?.tracks ?? [];
  const activeId = music?.activeTrackId ?? tracks[0]?.id ?? null;
  const shownVol = vol ?? music?.volume ?? 40;

  async function addTrack() {
    setErr("");
    setWarn("");
    const { track, error, warning } = parseTrackInput(url, title);
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
    if (warning) setWarn(warning);
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
        Terima <b>link audio apa pun</b> — MP3, M4A, OGG, WAV, AAC, OPUS dari host mana pun (hosting
        “audio to URL”, server sekolah, dsb.). Link <b>Google Drive / Dropbox</b> otomatis dikonversi ke link
        langsung. Juga menerima <b>YouTube / YT Music</b>. Musik diputar berulang (loop) di TV &amp; halaman
        penonton dan menyala otomatis — bila browser memblokir, cukup satu sentuhan di mana pun (tidak perlu
        menekan chip musik).
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className="bo-input min-w-0 flex-1"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Link audio apa pun / Google Drive / music.youtube.com/watch?v=…"
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
      {warn ? <p className="mt-1.5 text-[11px] font-bold text-fs-gold">{warn}</p> : null}

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
        Dihitung dari halaman /live, TV /display &amp; halaman interaktif (heartbeat tiap 20 detik + saat tab kembali
        terlihat; dianggap offline setelah ±1,5 menit menutup halaman). Admin tidak ikut terhitung.
      </p>
      <div className="mt-3">
        <div className="flex items-baseline gap-3">
          <span className="font-stat text-5xl font-black tabular-nums text-fs-cyan">{count}</span>
          <span className="text-xs font-black uppercase tracking-widest text-fs-muted">
            {status === "online" ? "perangkat menonton" : status === "connecting" ? "menghubungkan…" : "database tidak terjangkau"}
          </span>
        </div>
        {status === "offline" && tid ? (
          <p className="mt-2 border border-fs-err/50 bg-fs-err/5 px-2.5 py-1.5 text-[10px] font-semibold leading-relaxed text-fs-err">
            <b>Server menolak baca data penonton.</b> Hampir selalu karena aturan keamanan (rules) Firestore di
            project belum versi terbaru (koleksi <code>livePresence</code> belum dikenal server). Perbaikan ±1 menit:
            buka <b>console.firebase.google.com</b> → project → <b>Firestore Database → Rules</b> → hapus isi lama,
            tempel seluruh isi <code>firebase/firestore.rules</code> (versi terbaru; salinannya juga tampil di halaman
            <code>/setup.html</code>) → klik <b>Publish</b> → muat ulang halaman ini.
          </p>
        ) : null}
        {status === "online" && count === 0 ? (
          <p className="mt-2 border border-fs-gold/40 bg-fs-gold/5 px-2.5 py-1.5 text-[10px] font-semibold leading-relaxed text-fs-gold">
            Terhubung ke database, tapi belum ada penonton terdeteksi. Bila halaman /live pasti sedang terbuka di
            perangkat lain dan angka tetap 0 → jalankan <code>npm run deploy:rules</code> dari laptop panitia
            (rules koleksi <code>livePresence</code> harus ter-deploy; panduan: documentation/SERTIFIKAT_JUARA.md).
          </p>
        ) : null}
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
  const [booyahTeam, setBooyahTeam] = useState("");
  const [booyahBusy, setBooyahBusy] = useState(false);

  async function fireBooyah() {
    if (!tid || booyahBusy) return;
    setBooyahBusy(true);
    try {
      await patch(
        {
          booyah: {
            active: true,
            teamName: booyahTeam.trim() || (settings.booyah?.teamName ?? "MATCH SURVIVOR"),
            matchNumber: settings.booyah?.matchNumber ?? null,
            at: Date.now(),
          },
        },
        "BOOYAH! meledak di semua TV & /live penonton",
      );
      setBooyahTeam("");
    } finally {
      setBooyahBusy(false);
    }
  }

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

      {/* BOOYAH! — momen juara match, gaya turnamen resmi Free Fire */}
      <div className="mt-3 border border-fs-gold/40 bg-fs-gold/5 p-3">
        <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-fs-gold">
          <Zap className="h-3.5 w-3.5" /> BOOYAH! — ledakan juara match (±8 detik, auto-tutup)
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            className="bo-input min-w-0 flex-1"
            value={booyahTeam}
            onChange={(e) => setBooyahTeam(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void fireBooyah(); }}
            placeholder={`Nama tim juara match (kosong = "${settings.booyah?.teamName ?? "MATCH SURVIVOR"}")`}
          />
          <BoButton variant="primary" className="!px-3 !py-2 !text-xs" disabled={!tid || booyahBusy} onClick={() => void fireBooyah()}>
            <Zap className="h-3.5 w-3.5" /> {booyahBusy ? "Mengirim…" : "BOOYAH Sekarang"}
          </BoButton>
        </div>
        <p className="mt-1.5 text-[10px] font-semibold text-fs-text/45">
          Suara fanfare BOOYAH + confetti + teks emas raksasa di semua perangkat penonton seketika —
          bareng tombol SFX “Match Selesai” untuk penutupan match.
        </p>
      </div>

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

// ============================================================
// BOF CASTER — bagikan layar via kode pairing (ala hi.casts.app)
// ============================================================
export function CasterPanel({ tid, settings }: { tid: string | null; settings: Partial<BroadcastSettings> }) {
  const caster = settings.caster ?? null;
  const active = caster?.active === true && Boolean(caster?.code);
  const [label, setLabel] = useState(caster?.label ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [origin, setOrigin] = useState("");
  // origin (untuk QR & link) dihitung di klien — aman untuk SSR/hidrasi.
  useEffect(() => setOrigin(window.location.origin), []);
  const qr = useQr(active ? casterUrl(caster!.code, origin) : null);

  async function start() {
    if (!tid) return;
    setBusy(true); setMsg("Membuat sesi + kode…");
    try {
      const code = await startCasterSession(tid, label.trim() || undefined);
      setMsg(`Sesi aktif — kode ${formatPairCodeSafe(code)}. TV & /live sekarang menampilkan kartu pairing.`);
    } catch (e) {
      setMsg(`Gagal memulai: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  async function rotate() {
    if (!tid) return;
    setBusy(true); setMsg("Mengganti kode…");
    try {
      const code = await rotateCasterCode(tid, caster?.code, label.trim() || caster?.label);
      setMsg(`Kode baru: ${formatPairCodeSafe(code)}. Kode lama otomatis mati.`);
    } catch (e) {
      setMsg(`Gagal ganti kode: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  async function stop() {
    if (!tid) return;
    setBusy(true); setMsg("Mematikan sesi…");
    try {
      await stopCasterSession(tid, caster?.code);
      setMsg("Sesi dimatikan. Mode siaran kembali Offline.");
    } catch (e) {
      setMsg(`Gagal mematikan: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  const sisa = caster?.expiresAt && caster.expiresAt > Date.now()
    ? Math.round((caster.expiresAt - Date.now()) / 60000)
    : null;

  return (
    <BoCard className="bg-fs-panel p-5">
      <h2 className="flex items-center gap-2 font-display text-base font-black uppercase">
        <MonitorUp className="h-4 w-4 text-fs-cyan" /> BOF Caster — Layar via Kode Pairing
        {active ? <BoBadge className="bg-fs-ok/15 text-fs-ok">AKTIF</BoBadge> : null}
      </h2>
      <p className="mt-1 text-[11px] font-semibold text-fs-text/50">
        Persis hi.casts.app: TV menampilkan kode + QR, panitia membuka <code>/caster</code> di laptop/HP,
        ketik kode, pilih layar → tayang real-time di /display &amp; /live berdampingan leaderboard.
        Tanpa OBS, tanpa install.
      </p>

      {active ? (
        <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row">
          <div className="border border-fs-edge bg-white p-2">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="QR halaman caster" className="h-28 w-28" />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center text-[10px] font-bold text-black/40">QR…</div>
            )}
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-fs-muted">Kode Pairing</p>
            <p className="font-stat text-5xl font-black tracking-[0.18em] text-fs-cyan tabular-nums">
              {formatPairCodeSafe(caster!.code)}
            </p>
            <p className="mt-1 break-all text-[11px] font-bold text-fs-muted">
              {origin}/caster?code={caster!.code}
            </p>
            {sisa !== null ? (
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-fs-text/40">
                Berlaku ±{Math.floor(sisa / 60)} jam {sisa % 60} menit
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label sumber (opsional) — mis. Laptop Operator"
            className="flex-1 border border-fs-edge bg-black/40 px-3 py-2 text-xs font-semibold text-white outline-none focus:border-fs-cyan"
          />
          <BoButton onClick={() => void start()} disabled={busy || !tid}>
            <Cast className="h-4 w-4" /> Mulai Sesi Caster
          </BoButton>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {active ? (
          <>
            <BoButton
              variant="cyan"
              disabled={busy}
              onClick={() => { void navigator.clipboard?.writeText(casterUrl(caster!.code, origin)); setMsg("Link caster disalin."); }}
            >
              <Copy className="h-3.5 w-3.5" /> Salin Link
            </BoButton>
            <BoButton variant="yellow" disabled={busy} onClick={() => void rotate()}>
              <RefreshCw className="h-3.5 w-3.5" /> Ganti Kode
            </BoButton>
            <BoButton variant="danger" disabled={busy} onClick={() => void stop()}>
              <Trash2 className="h-3.5 w-3.5" /> Matikan Sesi
            </BoButton>
          </>
        ) : null}
      </div>
      {msg ? <p className="mt-2 text-[11px] font-bold text-fs-cyan">{msg}</p> : null}
      <p className="mt-2 text-[10px] font-semibold text-fs-text/40">
        Catatan: aliran dikirim langsung laptop caster → penonton (P2P). Kapasitas bersamaan mengikuti
        batas penonton P2P ({settings.p2pMaxViewers ?? 3} perangkat). Untuk ribuan penonton, tetap gunakan YouTube.
      </p>
    </BoCard>
  );
}
