"use client";
// ============================================================
// STIKAR ESPORTS — Mode siaran P2P (tanpa bridge) — PHASE 4
// Video mengalir LANGSUNG laptop operator → penonton lewat WebRTC
// peer-to-peer. Firestore HANYA signaling (tukar SDP/ICE):
//   p2pSessions/{tid}/viewers/{viewerId}            → offer/answer/state
//   p2pSessions/{tid}/viewers/{viewerId}/candidates → ICE candidate
// Tanpa broadcast-bridge, tanpa MediaMTX, tanpa OBS, tanpa install.
// Batas: maks p2pMaxViewers penonton bersamaan (default 2, rentang 1–4).
//
// P2PHost  meniru antarmuka StreamPublisher yang dipakai Live Control
//          (attach/localStream/publish/pause/resume/stop + event state/stats).
// P2PViewer dipakai halaman publik /live & /display (via LiveVideoPlayer).
// Semua logika murni (slot, backoff, mapping status, ICE servers,
// validasi payload) diekspor terpisah agar bisa diuji di scripts/test-p2p.ts.
// ============================================================

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type FirestoreError,
} from "firebase/firestore";
import { db } from "@/services/firebase/client";
import type { PlayerStatus } from "@/components/video/player";
import {
  P2P_DEGRADATION_PREFERENCE,
  P2P_DISCONNECT_GRACE_MS,
  P2P_MAX_BITRATE_BPS,
  P2P_MAX_FRAMERATE,
  P2P_RECOVERY_BACKOFF_MS,
  P2P_STALE_SESSION_MS,
  type PublisherEvents,
} from "@/services/broadcast/stream";
import type { P2PCandidateDoc, P2PViewerDoc, P2PViewerInfo } from "@/lib/types";

// Re-export konstanta kualitas P2P (sumber kebenaran tetap di stream.ts).
export {
  P2P_CAPTURE_HEIGHT,
  P2P_CAPTURE_MAX_FRAMERATE,
  P2P_CAPTURE_WIDTH,
  P2P_DEGRADATION_PREFERENCE,
  P2P_DISCONNECT_GRACE_MS,
  P2P_MAX_BITRATE_BPS,
  P2P_MAX_FRAMERATE,
  P2P_RECOVERY_BACKOFF_MS,
  P2P_STALE_SESSION_MS,
} from "@/services/broadcast/stream";

// ============================================================
// 1. Logika murni (dapat diuji tanpa browser/Firestore)
// ============================================================

export type P2PViewerStatus =
  | "idle"
  | "waiting-host" // offer terkirim, menunggu operator menerima
  | "connecting" // answer diterima, ICE berjalan
  | "live"
  | "reconnecting"
  | "full" // slot penonton penuh (rejected)
  | "closed" // operator menutup sesi
  | "signal-lost"
  | "unsupported"; // browser tanpa WebRTC (TV lama)

/** Petakan status internal P2P → PlayerStatus yang sudah dipakai UI. */
export function mapP2PStatusToPlayerStatus(s: P2PViewerStatus): PlayerStatus {
  switch (s) {
    case "live":
      return "live";
    case "connecting":
    case "waiting-host":
      return "connecting";
    case "reconnecting":
      return "reconnecting";
    case "idle":
      return "idle";
    case "full":
    case "closed":
    case "signal-lost":
    case "unsupported":
      return "signal-lost";
    default:
      return "signal-lost";
  }
}

/** Default 2, rentang 1–4 (laptop mengirim satu aliran per penonton). */
export function clampP2pMaxViewers(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : NaN;
  if (Number.isNaN(v)) return 2;
  return Math.min(4, Math.max(1, v));
}

/** Backoff pemulihan penonton: 2 → 4 → 8 → 15 dtk (cap 15 dtk). */
export function nextBackoffMs(attempt: number): number {
  const idx = Math.min(Math.max(attempt, 1), P2P_RECOVERY_BACKOFF_MS.length);
  return P2P_RECOVERY_BACKOFF_MS[idx - 1];
}

export interface WaitingEntry {
  viewerId: string;
  createdAtMs: number | null; // null = serverTimestamp belum resolve → dianggap paling baru
}

/**
 * Pemilihan slot penonton (murni — diuji di scripts/test-p2p.ts).
 * Sesi aktif tetap menghabiskan slot; yang menunggu dilayani urut createdAt
 * (paling dulu menunggu dilayani lebih dulu); sisanya ditolak.
 */
export function selectAdmittedViewers(
  waiting: WaitingEntry[],
  activeIds: string[],
  maxViewers: number,
): { admit: WaitingEntry[]; reject: WaitingEntry[] } {
  const max = clampP2pMaxViewers(maxViewers);
  const free = Math.max(0, max - activeIds.length);
  const sorted = [...waiting].sort((a, b) => {
    const av = a.createdAtMs ?? Number.MAX_SAFE_INTEGER;
    const bv = b.createdAtMs ?? Number.MAX_SAFE_INTEGER;
    if (av !== bv) return av - bv;
    return a.viewerId.localeCompare(b.viewerId); // deterministik saat seri
  });
  return {
    admit: sorted.slice(0, free),
    reject: sorted.slice(free),
  };
}

export interface TurnConfig {
  url?: string;
  username?: string;
  credential?: string;
}

/** STUN Google default + TURN opsional (env NEXT_PUBLIC_TURN_*; tanpa hardcode kredensial). */
export function buildP2PIceServers(turn?: TurnConfig): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  const url = turn?.url?.trim();
  if (url) {
    servers.push({
      urls: url,
      username: turn?.username?.trim() || undefined,
      credential: turn?.credential?.trim() || undefined,
    });
  }
  return servers;
}

/** Baca konfigurasi TURN dari NEXT_PUBLIC_* env (dipanggil di browser). */
export function turnFromEnv(): TurnConfig {
  return {
    url: process.env.NEXT_PUBLIC_TURN_URL,
    username: process.env.NEXT_PUBLIC_TURN_USERNAME,
    credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
  };
}

/** Batas ukuran SDP offer (harus sama dengan aturan Firestore: ≤ 12000). */
export const P2P_MAX_OFFER_CHARS = 12000;
/** Batas ukuran candidate JSON (aturan Firestore: ≤ 2000). */
export const P2P_MAX_CANDIDATE_CHARS = 2000;

/**
 * Cermin validasi aturan Firestore untuk create dokumen viewer.
 * Dipakai di sisi klien agar offer yang jelas-jelas ditolak rules
 * tidak pernah dikirim (menghemat kuota & memberi pesan jelas).
 */
export function isValidViewerCreatePayload(
  data: { viewerId: string; state: string; offer: { type: string; sdp: string } },
  pathViewerId: string,
): { ok: boolean; reason?: string } {
  if (data.viewerId !== pathViewerId) return { ok: false, reason: "viewerId tidak cocok dengan path" };
  if (data.state !== "waiting") return { ok: false, reason: "state awal harus waiting" };
  if (data.offer.type !== "offer") return { ok: false, reason: "offer.type harus 'offer'" };
  if (typeof data.offer.sdp !== "string" || data.offer.sdp.length === 0) {
    return { ok: false, reason: "SDP kosong" };
  }
  if (data.offer.sdp.length > P2P_MAX_OFFER_CHARS) {
    return { ok: false, reason: `SDP terlalu besar (${data.offer.sdp.length} > ${P2P_MAX_OFFER_CHARS} karakter)` };
  }
  return { ok: true };
}

/** Sesi waiting/closed lebih tua dari 2 menit → dihapus admin (jangan spam). */
export function isStaleSession(d: { state?: string; createdAtMs?: number | null }, nowMs: number): boolean {
  if (d.state !== "waiting" && d.state !== "closed") return false;
  if (d.createdAtMs == null) return false;
  return nowMs - d.createdAtMs > P2P_STALE_SESSION_MS;
}

function tsToMillis(v: unknown): number | null {
  if (v && typeof v === "object" && typeof (v as { toMillis?: unknown }).toMillis === "function") {
    try {
      return (v as { toMillis: () => number }).toMillis();
    } catch {
      return null;
    }
  }
  if (typeof v === "number") return v;
  return null;
}

function errCode(e: unknown): string {
  return (e as FirestoreError)?.code ?? "";
}

// ============================================================
// 2. P2PHost — sisi admin (Live Control)
// ============================================================

export interface P2PHostEvents extends PublisherEvents {
  /** Daftar slot penonton (terhubung/menunggu/ditolak) untuk UI admin. */
  onViewers?: (info: P2PViewerInfo[]) => void;
}

interface HostSession {
  viewerId: string;
  docId: string;
  pc: RTCPeerConnection;
  unsubCandidates: () => void;
  appliedCandidates: Set<string>;
}

export class P2PHost {
  private tid: string;
  private ev: P2PHostEvents;
  /** Akar signaling: default p2pSessions/{tid} — mode Caster memakai casterSessions/{code}. */
  private basePath: string;
  /** true (admin/Live Control): publish/stop menulis broadcastSettings.p2pLive.
   *  false (Caster anonim): jangan sentuh broadcastSettings — tidak berizin. */
  private controlBroadcastLive: boolean;
  /** Kualitas encoder per penonton (maxBitrate/fps/degradation) —
   *  diatur panitia di /caster; default tetap 720p-capable 3,5 Mbps/30fps. */
  private quality: { maxBitrateBps?: number; maxFramerate?: number; degradation?: string } = {};
  private stream: MediaStream | null = null;
  private sessions = new Map<string, HostSession>(); // key = viewerId
  private reserved = new Set<string>(); // slot yang sedang dijawab (cegah race dua penonton bersamaan)
  private known = new Map<string, P2PViewerInfo>(); // key = viewerId
  private decided = new Set<string>(); // docId yang sudah dilayani/ditolak
  private unsubWaiting: (() => void) | null = null;
  private unsubFallback: (() => void) | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private lastBytes = 0;
  private lastStatsAt = 0;
  private listening = false;
  private stopped = false;

  constructor(
    tid: string,
    events: P2PHostEvents = {},
    opts: {
      basePath?: string;
      controlBroadcastLive?: boolean;
      quality?: { maxBitrateBps?: number; maxFramerate?: number; degradation?: string };
    } = {},
  ) {
    this.tid = tid;
    this.ev = events;
    this.basePath = opts.basePath ?? `p2pSessions/${tid}`;
    this.controlBroadcastLive = opts.controlBroadcastLive ?? true;
    this.quality = opts.quality ?? {};
  }

  /** Ubah kualitas encoder saat siaran berjalan (langsung ke semua sesi aktif). */
  async setQuality(q: { maxBitrateBps?: number; maxFramerate?: number; degradation?: string }): Promise<void> {
    this.quality = { ...this.quality, ...q };
    for (const s of this.sessions.values()) {
      await this.applySenderQuality(s.pc);
    }
  }

  /** Koleksi dokumen penonton untuk mode ini. */
  private get viewersRoot(): string {
    return `${this.basePath}/viewers`;
  }

  /** Batas penonton — Live Control menyambungkan ini ke broadcast.p2pMaxViewers. */
  maxViewers = 2;

  attach(stream: MediaStream): void {
    this.stream = stream;
  }

  get localStream(): MediaStream | null {
    return this.stream;
  }

  get connected(): boolean {
    for (const s of this.sessions.values()) {
      if (s.pc.connectionState === "connected") return true;
    }
    return false;
  }

  get connectedCount(): number {
    let n = 0;
    for (const s of this.sessions.values()) {
      if (s.pc.connectionState === "connected") n++;
    }
    return n;
  }

  /** Mulai mendengarkan sesi penonton + set p2pLive=true (tanpa URL apa pun).
   *  Mode Caster (controlBroadcastLive=false) tidak menulis broadcastSettings. */
  async publish(stream: MediaStream): Promise<void> {
    if (!db) throw new Error("Firebase tidak terkonfigurasi — signaling P2P butuh Firestore.");
    this.stream = stream;
    this.stopped = false;
    this.ev.onState?.("connecting", "Mengaktifkan signaling…");
    if (this.controlBroadcastLive) {
      await setDoc(
        doc(db, `broadcastSettings/${this.tid}`),
        { p2pLive: true, tournamentId: this.tid, updatedAt: serverTimestamp() },
        { merge: true },
      );
    }
    this.startListening();
    this.startCleanup();
    this.startStats();
    this.ev.onState?.("live", "Siaran aktif — menunggu penonton tersambung.");
  }

  /** Re-listen setelah gangguan (paritas dengan StreamPublisher.reconnect). */
  async reconnect(): Promise<boolean> {
    if (!db || !this.stream) return false;
    this.ev.onState?.("reconnecting", "Menyalakan ulang signaling P2P…");
    try {
      await this.publish(this.stream);
      return true;
    } catch {
      this.ev.onState?.("error", "Gagal mengaktifkan ulang signaling P2P.");
      return false;
    }
  }

  /** Pause sirkulasi frame (track yang sama dipakai semua sender). */
  pause(): void {
    this.stream?.getVideoTracks().forEach((t) => { t.enabled = false; });
    this.ev.onState?.("paused");
  }

  resume(): void {
    this.stream?.getVideoTracks().forEach((t) => { t.enabled = true; });
    this.ev.onState?.("live");
  }

  /** STOP: hapus semua dokumen sesi+candidates, tutup semua peer.
   *  Mode admin juga memadamkan broadcastSettings.p2pLive. */
  async stop(): Promise<void> {
    this.ev.onState?.("stopping");
    this.teardownListeners();
    await this.closeAllSessions();
    if (db) {
      await this.deleteAllSessions();
      if (this.controlBroadcastLive) {
        try {
          await setDoc(
            doc(db, `broadcastSettings/${this.tid}`),
            { p2pLive: false, tournamentId: this.tid, updatedAt: serverTimestamp() },
            { merge: true },
          );
        } catch { /* Firestore offline — viewer tetap pulih lewat expiresAt/koneksi */ }
      }
    }
    this.stopStats();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.emitViewers();
    this.ev.onState?.("offline");
  }

  // ---------- signaling listeners ----------

  private startListening(): void {
    this.teardownListeners();
    if (!db) return;
    this.listening = true;
    const viewersRef = collection(db, this.viewersRoot);
    // Utama: hanya 'waiting' urut createdAt (butuh composite index state+createdAt).
    const q = query(viewersRef, where("state", "==", "waiting"), orderBy("createdAt", "asc"));
    this.unsubWaiting = onSnapshot(
      q,
      (snap) => {
        snap.docChanges().forEach((ch) => {
          if (ch.type === "added") this.onWaitingDoc(ch.doc.id, ch.doc.data() as P2PViewerDoc);
        });
      },
      (err) => {
        // Index belum dideploy → fallback tanpa query (filter di klien).
        if (err.code === "failed-precondition") this.startListeningFallback();
        else if (err.code === "permission-denied") {
          this.ev.onState?.("error", "Signaling P2P ditolak aturan Firestore — deploy rules terbaru: Firebase Console → Firestore Database → Rules → tempel isi firebase/firestore.rules → Publish (lihat documentation/P2P_MODE.md).");
        }
      },
    );
  }

  private startListeningFallback(): void {
    if (!db || this.unsubFallback) return;
    const viewersRef = collection(db, this.viewersRoot);
    this.unsubFallback = onSnapshot(
      viewersRef,
      (snap) => {
        snap.docChanges().forEach((ch) => {
          const data = ch.doc.data() as P2PViewerDoc;
          if (ch.type === "added" && data.state === "waiting") this.onWaitingDoc(ch.doc.id, data);
        });
      },
      () => { /* abaikan — permission-denied sudah dilaporkan listener utama */ },
    );
  }

  private teardownListeners(): void {
    this.unsubWaiting?.();
    this.unsubWaiting = null;
    this.unsubFallback?.();
    this.unsubFallback = null;
    this.listening = false;
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  private onWaitingDoc(docId: string, data: P2PViewerDoc): void {
    if (this.stopped || !this.listening) return;
    if (this.decided.has(docId) || this.sessions.has(data.viewerId) || this.reserved.has(data.viewerId)) return;
    this.decided.add(docId);
    const active = [...this.sessions.keys(), ...this.reserved];
    const { admit } = selectAdmittedViewers(
      [{ viewerId: data.viewerId, createdAtMs: tsToMillis(data.createdAt) }],
      active,
      this.maxViewers,
    );
    if (admit.length) {
      // Reservasi slot sinkron — jawaban async tidak boleh melebihi batas.
      this.reserved.add(data.viewerId);
      void this.admit(docId, data);
    }
    else void this.reject(docId, data.viewerId, "Slot penonton P2P penuh");
  }

  private async admit(docId: string, data: P2PViewerDoc): Promise<void> {
    if (!db || !this.stream) return;
    const viewerId = data.viewerId;
    this.known.set(viewerId, { viewerId, state: "answered", since: Date.now() });
    this.emitViewers();
    try {
      const pc = new RTCPeerConnection({ iceServers: buildP2PIceServers(turnFromEnv()) });
      const candidatesRef = collection(db, `${this.viewersRoot}/${docId}/candidates`);
      const applied = new Set<string>();

      // Semua track capture → satu aliran per penonton.
      this.stream.getTracks().forEach((track) => {
        if (track.kind === "video") track.contentHint = "motion";
        pc.addTrack(track, this.stream!);
      });
      await this.applySenderQuality(pc);

      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        void addDoc(candidatesRef, {
          from: "host",
          candidate: JSON.stringify(e.candidate.toJSON()),
          createdAt: serverTimestamp(),
        } satisfies P2PCandidateDoc).catch(() => { /* jaringan signaling sesaat hilang */ });
      };

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        const info = this.known.get(viewerId);
        if (st === "connected") {
          if (info) this.known.set(viewerId, { ...info, state: "connected" });
          this.emitViewers();
        } else if (st === "failed" || st === "closed") {
          void this.dropSession(viewerId, docId);
        } else if (st === "disconnected") {
          if (info) this.known.set(viewerId, { ...info, state: "answered" });
          this.emitViewers();
        }
      };

      // ICE dari penonton.
      const unsubCandidates = onSnapshot(
        query(candidatesRef, where("from", "==", "viewer")),
        (snap) => {
          snap.docChanges().forEach((ch) => {
            if (ch.type !== "added") return;
            const c = ch.doc.data() as P2PCandidateDoc;
            if (applied.has(ch.doc.id)) return;
            applied.add(ch.doc.id);
            void this.safeAddCandidate(pc, c.candidate);
          });
        },
        () => { /* abaikan */ },
      );

      await pc.setRemoteDescription({ type: "offer", sdp: data.offer.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await updateDoc(doc(db, `${this.viewersRoot}/${docId}`), {
        answer: { type: answer.type, sdp: answer.sdp ?? "" },
        state: "answered",
      });

      const session: HostSession = { viewerId, docId, pc, unsubCandidates, appliedCandidates: applied };
      this.sessions.set(viewerId, session);
      this.reserved.delete(viewerId);
      this.emitViewers();
    } catch (e) {
      this.reserved.delete(viewerId);
      this.known.set(viewerId, { viewerId, state: "closed", since: Date.now(), reason: errDesc(e) });
      this.emitViewers();
      try { await deleteDoc(doc(db, `${this.viewersRoot}/${docId}`)); } catch { /* abaikan */ }
    }
  }

  private async reject(docId: string, viewerId: string, reason: string): Promise<void> {
    if (!db) return;
    this.known.set(viewerId, { viewerId, state: "rejected", since: Date.now(), reason });
    try {
      await updateDoc(doc(db, `${this.viewersRoot}/${docId}`), { state: "rejected", reason });
    } catch { /* dokumen mungkin sudah dihapus */ }
    this.emitViewers();
  }

  private async safeAddCandidate(pc: RTCPeerConnection, candidateJson: string): Promise<void> {
    if (candidateJson.length > P2P_MAX_CANDIDATE_CHARS) return;
    try {
      await pc.addIceCandidate(JSON.parse(candidateJson));
    } catch { /* candidate sudah tidak relevan (renegosiasi) */ }
  }

  /** Kualitas per penonton: default 720p-capable (3,5 Mbps, 30 fps, maintain-framerate);
   *  dioverride pengaturan kualitas dari /caster bila ada. */
  private async applySenderQuality(pc: RTCPeerConnection): Promise<void> {
    const maxBitrate = this.quality.maxBitrateBps ?? P2P_MAX_BITRATE_BPS;
    const maxFps = this.quality.maxFramerate ?? P2P_MAX_FRAMERATE;
    const degradation = this.quality.degradation ?? P2P_DEGRADATION_PREFERENCE;
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== "video") continue;
      try {
        const params = sender.getParameters();
        if (!params.encodings?.length) params.encodings = [{}];
        params.encodings[0].maxBitrate = maxBitrate;
        params.encodings[0].maxFramerate = maxFps;
        (params.encodings[0] as RTCRtpEncodingParameters & { degradationPreference?: string }).degradationPreference =
          degradation;
        await sender.setParameters(params);
      } catch { /* browser lama tanpa setParameters — lanjut default */ }
    }
  }

  private async dropSession(viewerId: string, docId: string): Promise<void> {
    const s = this.sessions.get(viewerId);
    if (s) {
      s.unsubCandidates();
      try { s.pc.close(); } catch { /* abaikan */ }
      this.sessions.delete(viewerId);
    }
    try { await deleteDoc(doc(db!, `${this.viewersRoot}/${docId}`)); } catch { /* sudah hilang */ }
    this.known.delete(viewerId);
    this.emitViewers();
  }

  private async closeAllSessions(): Promise<void> {
    for (const s of Array.from(this.sessions.values())) {
      s.unsubCandidates();
      try { s.pc.close(); } catch { /* abaikan */ }
    }
    this.sessions.clear();
  }

  private async deleteAllSessions(): Promise<void> {
    if (!db) return;
    try {
      const viewersRef = collection(db, this.viewersRoot);
      const snap = await getDocs(viewersRef);
      await Promise.all(snap.docs.map(async (d) => {
        try {
          const cands = await getDocs(collection(db!, `${this.viewersRoot}/${d.id}/candidates`));
          const batch = writeBatch(db!);
          cands.docs.forEach((c) => batch.delete(c.ref));
          batch.delete(d.ref);
          await batch.commit();
        } catch { /* abaikan per dokumen */ }
      }));
      this.known.clear();
      this.decided.clear();
    } catch { /* Firestore offline */ }
  }

  /** Hapus sesi waiting/closed > 2 menit (spam/lupa cleanup) — dijalankan tiap 60 dtk + saat mount. */
  async cleanupStale(): Promise<void> {
    if (!db) return;
    try {
      const viewersRef = collection(db, this.viewersRoot);
      const snap = await getDocs(viewersRef);
      const now = Date.now();
      const stale = snap.docs
        .map((d) => ({ id: d.id, data: d.data() as P2PViewerDoc }))
        .filter((x) => isStaleSession(
          { state: x.data.state, createdAtMs: tsToMillis(x.data.createdAt) },
          now,
        ));
      await Promise.all(stale.map(async (x) => {
        try {
          const cands = await getDocs(collection(db!, `${this.viewersRoot}/${x.id}/candidates`));
          const batch = writeBatch(db!);
          cands.docs.forEach((c) => batch.delete(c.ref));
          batch.delete(doc(db!, `${this.viewersRoot}/${x.id}`));
          await batch.commit();
        } catch { /* abaikan per dokumen */ }
      }));
    } catch { /* Firestore offline / rules lama */ }
  }

  private startCleanup(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    void this.cleanupStale();
    this.cleanupTimer = setInterval(() => void this.cleanupStale(), 60_000);
  }

  private emitViewers(): void {
    const list = Array.from(this.known.values()).sort((a, b) => a.since - b.since);
    this.ev.onViewers?.(list);
  }

  // ---------- stats agregat (semua penonton) ----------

  private startStats(): void {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.lastBytes = 0;
    this.lastStatsAt = Date.now();
    this.statsTimer = setInterval(async () => {
      if (!this.sessions.size) return;
      try {
        let bytes = 0;
        let ts = 0;
        for (const s of this.sessions.values()) {
          const report = await s.pc.getStats();
          report.forEach((st) => {
            const r = st as unknown as Record<string, unknown>;
            if (st.type === "outbound-rtp" && r.kind === "video") {
              bytes += Number(r.bytesSent ?? 0);
              ts = Math.max(ts, Number(r.timestamp ?? 0));
            }
          });
        }
        const now = Date.now();
        const dt = (now - this.lastStatsAt) / 1000;
        if (this.lastStatsAt && dt > 0 && bytes >= this.lastBytes) {
          const kbps = Math.round(((bytes - this.lastBytes) * 8) / dt / 1000);
          const track = this.stream?.getVideoTracks()[0];
          const st = track?.getSettings() ?? {};
          this.ev.onStats?.({
            bitrateKbps: kbps,
            fps: st.frameRate ? Math.round(st.frameRate) : null,
            resolution: st.width && st.height ? `${st.width}x${st.height}` : null,
            framesSent: null,
            connectionState: this.connectedCount > 0 ? "connected" : "new",
          });
        }
        this.lastBytes = bytes;
        this.lastStatsAt = now;
        void ts;
      } catch { /* renegosiasi sesaat */ }
    }, 1000);
  }

  private stopStats(): void {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
  }
}

function errDesc(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ============================================================
// 3. P2PViewer — sisi penonton (/live & /display)
// ============================================================

export interface P2PViewerEvents {
  tid: string;
  /** Akar signaling — default `p2pSessions/{tid}`. Mode Caster: `casterSessions/{code}`. */
  basePath?: string;
  /** Remote stream siap dipasang ke <video>. */
  onStream?: (stream: MediaStream | null) => void;
  onStatus?: (status: P2PViewerStatus, detail?: string) => void;
}

export class P2PViewer {
  private tid: string;
  private basePath: string;
  private ev: P2PViewerEvents;
  private running = false;
  private pc: RTCPeerConnection | null = null;
  private viewerId: string | null = null;
  private docId: string | null = null;
  private unsubDoc: (() => void) | null = null;
  private unsubCandidates: (() => void) | null = null;
  private answerApplied = false;
  private pendingCandidates: string[] = [];
  private failTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;

  constructor(opts: P2PViewerEvents) {
    this.tid = opts.tid;
    this.basePath = opts.basePath ?? `p2pSessions/${opts.tid}`;
    this.ev = opts;
  }

  async start(): Promise<void> {
    if (typeof RTCPeerConnection === "undefined") {
      this.ev.onStatus?.("unsupported", "Browser ini tidak mendukung WebRTC (TV lama?). Gunakan Chrome/TV browser baru.");
      return;
    }
    if (!db) {
      this.ev.onStatus?.("signal-lost", "Database signaling tidak terjangkau — periksa internet.");
      return;
    }
    this.running = true;
    this.attempt = 0;
    await this.createSession();
  }

  stop(): void {
    this.running = false;
    this.clearFailTimer();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.teardownSession();
    this.ev.onStream?.(null);
  }

  /** Ulangi dari nol (tombol Coba Lagi / ganti p2pLive). */
  async retry(): Promise<void> {
    this.stop();
    this.running = true;
    this.attempt = 0;
    await this.createSession();
  }

  private teardownSession(): void {
    this.unsubDoc?.();
    this.unsubDoc = null;
    this.unsubCandidates?.();
    this.unsubCandidates = null;
    try { this.pc?.close(); } catch { /* abaikan */ }
    this.pc = null;
    this.answerApplied = false;
    this.pendingCandidates = [];
  }

  private clearFailTimer(): void {
    if (this.failTimer) clearTimeout(this.failTimer);
    this.failTimer = null;
  }

  private async createSession(): Promise<void> {
    if (!this.running || !db) return;
    this.teardownSession();
    const viewerId = crypto.randomUUID();
    this.viewerId = viewerId;
    this.docId = viewerId;
    const docRef = doc(db, `${this.basePath}/viewers/${viewerId}`);
    const candidatesRef = collection(db, `${this.basePath}/viewers/${viewerId}/candidates`);
    this.ev.onStatus?.("connecting", "Menyiapkan koneksi P2P…");

    try {
      const pc = new RTCPeerConnection({ iceServers: buildP2PIceServers(turnFromEnv()) });
      this.pc = pc;
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });

      pc.ontrack = (ev) => {
        const remote = ev.streams[0] ?? new MediaStream([ev.track]);
        this.ev.onStream?.(remote);
      };
      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        const json = JSON.stringify(e.candidate.toJSON());
        if (json.length > P2P_MAX_CANDIDATE_CHARS) return;
        void addDoc(candidatesRef, {
          from: "viewer",
          candidate: json,
          createdAt: serverTimestamp(),
        } satisfies P2PCandidateDoc).catch(() => { /* signaling sesaat hilang */ });
      };
      pc.onconnectionstatechange = () => this.onConnState(pc.connectionState);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const payload = {
        viewerId,
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 6 * 60 * 60 * 1000),
        state: "waiting" as const,
        offer: { type: offer.type, sdp: offer.sdp ?? "" },
      };
      const validity = isValidViewerCreatePayload(payload, viewerId);
      if (!validity.ok) {
        this.ev.onStatus?.("signal-lost", `Offer tidak valid: ${validity.reason}`);
        return;
      }
      await setDoc(docRef, payload);
      this.ev.onStatus?.("waiting-host", "Menunggu operator menerima koneksi…");

      // Dengarkan dokumen sendiri (jawaban/penolakan).
      this.unsubDoc = onSnapshot(
        docRef,
        (snap) => {
          if (!snap.exists()) return;
          const d = snap.data() as P2PViewerDoc;
          if (d.state === "rejected") {
            this.clearFailTimer();
            this.ev.onStatus?.("full", d.reason ?? "Slot penonton P2P penuh — coba lagi nanti.");
            this.teardownSession(); // bebas-kan peer — tanpa auto-retry (hindari spam)
            return;
          }
          if (d.state === "closed") {
            this.scheduleRecovery("Operator menutup koneksi ini — menyambung ulang…");
            return;
          }
          if (d.answer && !this.answerApplied) {
            this.answerApplied = true;
            void (async () => {
              try {
                await pc.setRemoteDescription({ type: "answer", sdp: d.answer!.sdp });
                for (const c of this.pendingCandidates.splice(0)) {
                  await this.safeAddCandidate(pc, c);
                }
                this.ev.onStatus?.("connecting", "Menyambung ke operator…");
              } catch {
                this.scheduleRecovery("Jawaban signaling tidak cocok — menyambung ulang…");
              }
            })();
          }
        },
        (err) => this.onSignalingError(err, "menunggu jawaban"),
      );

      // ICE candidate dari host.
      this.unsubCandidates = onSnapshot(
        query(candidatesRef, where("from", "==", "host")),
        (snap) => {
          snap.docChanges().forEach((ch) => {
            if (ch.type !== "added") return;
            const c = ch.doc.data() as P2PCandidateDoc;
            if (!this.answerApplied) this.pendingCandidates.push(c.candidate);
            else void this.safeAddCandidate(pc, c.candidate);
          });
        },
        () => { /* abaikan */ },
      );
    } catch (e) {
      const code = errCode(e);
      this.teardownSession();
      if (code === "permission-denied") {
        this.ev.onStatus?.("signal-lost", "Signaling ditolak server (permission-denied) — rules Firestore belum versi terbaru. Perbaikan ±1 menit: Firebase Console → Firestore Database → Rules → tempel seluruh isi firebase/firestore.rules → Publish (atau /setup.html tahap ⑤). Lihat documentation/P2P_MODE.md.");
        return;
      }
      this.scheduleRecovery(`Gagal membuat sesi (${errDesc(e)}) — mencoba lagi…`);
    }
  }

  private onSignalingError(err: FirestoreError, phase: string): void {
    if (err.code === "permission-denied") {
      this.ev.onStatus?.("signal-lost", `Akses signaling ditolak (${phase}) — rules Firestore belum versi terbaru: Firebase Console → Firestore Database → Rules → tempel isi firebase/firestore.rules → Publish.`);
      return;
    }
    this.scheduleRecovery(`Koneksi signaling terputus (${phase}) — mencoba lagi…`);
  }

  private onConnState(st: RTCPeerConnectionState): void {
    if (!this.running) return;
    if (st === "connected") {
      this.clearFailTimer();
      this.attempt = 0;
      this.ev.onStatus?.("live");
    } else if (st === "failed" || st === "disconnected") {
      if (!this.failTimer) {
        this.ev.onStatus?.("reconnecting", "Koneksi terputus — memeriksa 5 detik…");
        this.failTimer = setTimeout(() => {
          this.failTimer = null;
          this.scheduleRecovery();
        }, P2P_DISCONNECT_GRACE_MS);
      }
    }
  }

  /** Tutup sesi lama → sesi baru dengan backoff 2→4→8→15 dtk. */
  private scheduleRecovery(msg?: string): void {
    if (!this.running) return;
    this.clearFailTimer();
    this.attempt += 1;
    const wait = nextBackoffMs(this.attempt);
    this.ev.onStatus?.("reconnecting", `${msg ?? "Menyambung ulang"} (coba ${this.attempt} dalam ${Math.round(wait / 1000)} dtk)`);
    this.teardownSession();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.createSession();
    }, wait);
  }

  /** Viewer dilarang menulis (rules) — sesi lama dibiarkan, admin menghapus >2 menit. */
  private async safeAddCandidate(pc: RTCPeerConnection, candidateJson: string): Promise<void> {
    try {
      await pc.addIceCandidate(JSON.parse(candidateJson));
    } catch { /* candidate basi setelah renegosiasi */ }
  }
}

/** Pembersihan admin saat membuka Live Control (stale > 2 menit). */
export async function cleanupStaleP2PSessions(tid: string): Promise<void> {
  const host = new P2PHost(tid);
  await host.cleanupStale();
}

/** Ambil N sesi terbaru untuk audit admin (list butuh isAdmin). */
export async function listP2PViewersOnce(tid: string, max = 20): Promise<P2PViewerDoc[]> {
  if (!db) return [];
  const snap = await getDocs(query(
    collection(db, `p2pSessions/${tid}/viewers`),
    orderBy("createdAt", "desc"),
    limit(max),
  ));
  return snap.docs.map((d) => d.data() as P2PViewerDoc);
}
