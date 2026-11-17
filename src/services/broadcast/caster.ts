"use client";
// ============================================================
// STIKAR ESPORTS — BOF CASTER (berbagi layar ala hi.casts.app)
// TV/smartboard menampilkan KODE PAIRING 6 digit + QR. Panitia
// membuka /caster di laptop/HP lain, mengetik kode, memilih layar
// (getDisplayMedia) → layar mengalir real-time ke website:
// /display & /live menampilkannya berdampingan leaderboard.
//
// Signaling memakai mesin P2P yang sama (P2PHost/P2PViewer), tetapi
// akarnya digeser ke pohon yang DILINDUNGI KODE:
//   casterSessions/{kode}/viewers/{viewerId}            (+ candidates)
// Kode rahasia = bagian dari PATH dokumen → siapa pun yang tidak
// tahu kode tidak bisa menyentuh signaling (pola hi.casts.app).
// Sesi dibuat/dimatikan admin; kedaluwarsa otomatis +8 jam.
// ============================================================

import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import { P2PHost, clampP2pMaxViewers } from "@/services/broadcast/p2p";
import type { StreamStats } from "@/services/broadcast/stream";
import type { BroadcastSettings, CasterQuality } from "@/lib/types";

/** Nama koleksi sesi caster (dokumen id = kode pairing). */
export const CASTER_COLLECTION = "casterSessions";
/** Masa berlaku sesi default: 8 jam (turnamen sekolah satu hari). */
export const CASTER_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Ubah error Firestore teknis (mis. "Missing or insufficient permissions") menjadi
 * pesan Indonesia yang bisa DITINDAKLANJUTI panitia — lengkap dengan cara memperbaiki
 * aturan keamanan (rules) yang belum ter-deploy di project.
 */
export function friendlyCasterError(e: unknown, aksi: string): Error {
  const code = (e as { code?: string })?.code ?? "";
  const raw = e instanceof Error ? e.message : String(e ?? "");
  if (code === "permission-denied" || /missing or insufficient|permission/i.test(raw)) {
    return new Error(
      `SERVER MENOLAK ${aksi} — aturan keamanan (rules) Firestore di project belum memuat koleksi "casterSessions". ` +
      "Perbaikan ±1 menit: buka console.firebase.google.com → pilih project → Firestore Database → menu Rules → " +
      "hapus isi lama, tempel SELURUH isi firebase/firestore.rules (versi terbaru, ada di repo / salinan di halaman /setup.html) → " +
      "klik Publish. Setelah itu ulangi aksi ini — tanpa deploy rules, fitur BOF Caster tidak bisa menyala.",
    );
  }
  if (code === "unavailable" || /unavailable|network/i.test(raw)) {
    return new Error(`Koneksi ke database terputus saat ${aksi}. Periksa internet perangkat lalu coba lagi.`);
  }
  return new Error(raw || "Kesalahan tidak diketahui.");
}

/** Kode 6 digit acak (100000–999999) — gaya hi.casts.app ("Device ID: 528346"). */
export function genPairCode(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

/** Validasi input kode: terima "528346", "528 346", "528-346" → "528346" | null. */
export function validatePairCode(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

/** Path akar signaling untuk sesi caster tertentu. */
export function casterBasePath(code: string): string {
  return `${CASTER_COLLECTION}/${validatePairCode(code) ?? code}`;
}

/** URL halaman caster dengan kode terisi (untuk QR di TV & admin). */
export function casterUrl(code: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/caster?code=${encodeURIComponent(code)}`;
}

export interface CasterSessionInfo {
  code: string;
  tid: string;
  active: boolean;
  label?: string;
  expiresAtMs: number | null;
}

/** Baca sesi caster sekali — dipakai /caster sebelum menyalakan getDisplayMedia.
 *  Melempar error ramah bila SERVER MENOLAK (rules belum ter-deploy);
 *  return null hanya bila kode benar-benar tidak ada. */
export async function readCasterSession(code: string): Promise<CasterSessionInfo | null> {
  if (!db) return null;
  const valid = validatePairCode(code);
  if (!valid) return null;
  try {
    const snap = await getDoc(doc(db, `${CASTER_COLLECTION}/${valid}`));
    if (!snap.exists()) return null;
    const d = snap.data() as {
      tid?: string; active?: boolean; label?: string;
      expiresAt?: Timestamp | null;
    };
    return {
      code: valid,
      tid: d.tid ?? "",
      active: d.active === true,
      label: d.label,
      expiresAtMs: d.expiresAt?.toMillis?.() ?? null,
    };
  } catch (e) {
    // Bedakan "kode salah" dari "server menolak (rules lama)" — jangan samakan.
    const code = (e as { code?: string })?.code ?? "";
    const raw = e instanceof Error ? e.message : String(e ?? "");
    if (code === "permission-denied" || /missing or insufficient|permission/i.test(raw)) {
      throw friendlyCasterError(e, "memeriksa kode pairing");
    }
    return null;
  }
}

/** Sesi masih boleh dipakai? (aktif & belum kedaluwarsa) */
export function isSessionUsable(s: CasterSessionInfo | null): boolean {
  if (!s || !s.active || !s.tid) return false;
  if (s.expiresAtMs && Date.now() > s.expiresAtMs) return false;
  return true;
}

/** Dengarkan sesi (status berubah saat admin mematikan sesi → caster ikut berhenti). */
export function subscribeCasterSession(
  code: string,
  cb: (s: CasterSessionInfo | null) => void,
): () => void {
  if (!db) { cb(null); return () => {}; }
  const valid = validatePairCode(code);
  if (!valid) { cb(null); return () => {}; }
  return onSnapshot(
    doc(db, `${CASTER_COLLECTION}/${valid}`),
    (snap) => {
      if (!snap.exists()) { cb(null); return; }
      const d = snap.data() as {
        tid?: string; active?: boolean; label?: string;
        expiresAt?: Timestamp | null;
      };
      cb({
        code: valid,
        tid: d.tid ?? "",
        active: d.active === true,
        label: d.label,
        expiresAtMs: d.expiresAt?.toMillis?.() ?? null,
      });
    },
    () => cb(null),
  );
}

// ---------- Sisi ADMIN (mulai/mati/ganti kode) ----------

/** Mulai sesi caster baru: buat dokumen sesi + pasang kode di broadcastSettings.
 *  Dipanggil dari /admin/broadcast (kartu BOF CASTER). Return kode. */
export async function startCasterSession(tid: string, label?: string): Promise<string> {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");
  const code = genPairCode();
  const expiresAt = Date.now() + CASTER_TTL_MS;
  try {
    await setDoc(doc(db, `${CASTER_COLLECTION}/${code}`), {
      tid,
      active: true,
      ...(label ? { label } : {}),
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(expiresAt),
    });
  } catch (e) {
    throw friendlyCasterError(e, "MEMULAI SESI CASTER (membuat kode)");
  }
  try {
    await setDoc(
      doc(db, `broadcastSettings/${tid}`),
      {
        caster: { code, active: true, ...(label ? { label } : {}), startedAt: Date.now(), expiresAt },
        streamMode: "caster",
        tournamentId: tid,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    throw friendlyCasterError(e, "menyalakan kartu pairing di TV (broadcastSettings)");
  }
  return code;
}

/** Ganti kode sesi aktif (mis. kode tersebar ke pihak luar). */
export async function rotateCasterCode(tid: string, oldCode: string | undefined, label?: string): Promise<string> {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");
  if (oldCode) {
    try { await setDoc(doc(db, `${CASTER_COLLECTION}/${oldCode}`), { active: false }, { merge: true }); }
    catch { /* kode lama mungkin tak pernah ada — abaikan */ }
  }
  try {
    return await startCasterSession(tid, label);
  } catch (e) {
    throw e instanceof Error && /SERVER MENOLAK/.test(e.message)
      ? e
      : friendlyCasterError(e, "MENGANTI KODE PAIRING");
  }
}

/** Matikan sesi caster (admin): dokumen sesi inactive + broadcastSettings dikosongkan. */
export async function stopCasterSession(tid: string, code?: string): Promise<void> {
  if (!db) throw new Error("Firebase tidak terkonfigurasi.");
  if (code && /^\d{6}$/.test(code)) {
    try { await setDoc(doc(db, `${CASTER_COLLECTION}/${code}`), { active: false }, { merge: true }); }
    catch { /* abaikan — dokumen mungkin sudah tidak ada */ }
  }
  try {
    await setDoc(
      doc(db, `broadcastSettings/${tid}`),
      {
        caster: { code: code ?? "", active: false, startedAt: 0, expiresAt: 0 },
        streamMode: "offline",
        tournamentId: tid,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    throw friendlyCasterError(e, "MEMATIKAN SESI CASTER");
  }
}

// ---------- Kualitas berbagi layar (aturan di DESIGN.md) ----------

export const CASTER_QUALITY_DEFAULT: CasterQuality = {
  resolution: "720",
  fps: 30,
  quality: "balanced",
  rawAudio: true,
};

const CASTER_QUALITY_KEY = "bof.casterQuality";

/** Baca pengaturan kualitas perangkat ini (localStorage, fallback default). */
export function loadCasterQuality(): CasterQuality {
  if (typeof window === "undefined") return CASTER_QUALITY_DEFAULT;
  try {
    const raw = localStorage.getItem(CASTER_QUALITY_KEY);
    if (!raw) return CASTER_QUALITY_DEFAULT;
    const q = JSON.parse(raw) as Partial<CasterQuality>;
    return {
      resolution: q.resolution === "1080" || q.resolution === "native" ? q.resolution : "720",
      fps: q.fps === 15 || q.fps === 24 || q.fps === 60 ? q.fps : 30,
      quality: q.quality === "hd" || q.quality === "light" ? q.quality : "balanced",
      rawAudio: q.rawAudio !== false,
    };
  } catch {
    return CASTER_QUALITY_DEFAULT;
  }
}

/** Simpan pengaturan kualitas perangkat ini. */
export function saveCasterQuality(q: CasterQuality): void {
  try { localStorage.setItem(CASTER_QUALITY_KEY, JSON.stringify(q)); } catch { /* abaikan */ }
}

/** maxBitrate per preset (bps): HD 8 Mbps, Seimbang 4,5 Mbps, Hemat 2,5 Mbps. */
export function casterBitrateBps(q: CasterQuality): number {
  if (q.quality === "hd") return 8_000_000;
  if (q.quality === "light") return 2_500_000;
  return 4_500_000;
}

/** degradationPreference: HD & Seimbang menjaga framerate (game), Hemat seimbang. */
export function casterDegradation(q: CasterQuality): string {
  return q.quality === "light" ? "balanced" : "maintain-framerate";
}

/** Konstraints getDisplayMedia dari pengaturan — resolusi & fps dibatasi di sumber,
 *  audio: rawAudio = TANPA voice processing (musik game tidak berubah aneh/robotik). */
export function casterDisplayConstraints(q: CasterQuality): MediaStreamConstraints {
  const video: MediaTrackConstraints = {
    frameRate: { ideal: q.fps, max: q.fps },
  };
  if (q.resolution === "720") { video.width = { max: 1280 }; video.height = { max: 720 }; }
  else if (q.resolution === "1080") { video.width = { max: 1920 }; video.height = { max: 1080 }; }
  const audio: MediaTrackConstraints = q.rawAudio
    ? {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 2 },
        sampleRate: { ideal: 48000 },
      }
    : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  return { video, audio };
}

// ---------- Sisi CASTER (host — laptop/HP panitia) ----------

export interface CasterHostEvents {
  onState?: (state: string, detail?: string) => void;
  onViewers?: (info: { connected: number; waiting: number; total: number }) => void;
  onStats?: (s: StreamStats) => void;
}

export interface CasterHostHandle {
  host: P2PHost;
  maxViewers: number;
}

/** Bangun host caster dari kode pairing — memakai mesin P2PHost dengan
 *  basePath casterSessions/{code} (tanpa menyentuh broadcastSettings).
 *  q = kualitas encoder (bitrate/fps/degradation) dari pengaturan /caster. */
export function createCasterHost(
  tid: string,
  code: string,
  events: CasterHostEvents,
  maxViewers?: number,
  q?: CasterQuality,
): CasterHostHandle {
  const quality = q
    ? { maxBitrateBps: casterBitrateBps(q), maxFramerate: q.fps, degradation: casterDegradation(q) }
    : undefined;
  const host = new P2PHost(
    tid,
    {
      onState: events.onState,
      onStats: events.onStats,
      onViewers: (list) => {
        // Ringkas daftar penonton menjadi hitungan untuk UI /caster.
        events.onViewers?.({
          connected: list.filter((v) => v.state === "answered").length,
          waiting: list.filter((v) => v.state === "waiting").length,
          total: list.length,
        });
      },
    },
    { basePath: casterBasePath(code), controlBroadcastLive: false, quality },
  );
  host.maxViewers = clampP2pMaxViewers(maxViewers ?? 3);
  return { host, maxViewers: host.maxViewers };
}

/** Ambil batas penonton dari pengaturan broadcast (publik dibaca semua halaman). */
export function casterMaxViewersFrom(broadcast: BroadcastSettings | null): number {
  return clampP2pMaxViewers(broadcast?.p2pMaxViewers ?? 3);
}

/** Kelompokkan kode 6 digit agar mudah dibaca dari jauh: "528346" → "528 346". */
export function formatPairCodeSafe(code: string): string {
  const d = (code ?? "").replace(/\D/g, "").slice(0, 6);
  return d.length <= 3 ? d : `${d.slice(0, 3)} ${d.slice(3)}`;
}
