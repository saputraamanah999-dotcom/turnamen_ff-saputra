// ============================================================
// STIKAR ESPORTS — Tipe data Firestore
// Battle Off Friends (BOF) — SMK TI Bali Global Karangasem
// ============================================================

export type TournamentStatus = "draft" | "active" | "completed";
export type MatchFormat = "BO3" | "BO5" | "BO7" | "CUSTOM";
export type MatchStatus = "scheduled" | "live" | "completed" | "cancelled";
export type TeamStatus = "active" | "inactive" | "banned";
/** Mode sumber siaran. "p2p" = WebRTC langsung laptop → penonton, signaling Firestore (tanpa bridge/MediaMTX/OBS).
 *  "caster" = BOF CASTER — berbagi layar ala hi.casts.app: TV menampilkan kode pairing + QR,
 *  panitia membuka /caster, mengetik kode, layar laptop/HP ikut tampil real-time di website. */
export type StreamMode = "youtube" | "mediamtx" | "p2p" | "caster" | "offline";

// ---------- P2P signaling (dokumen Firestore) ----------

/** State sesi penonton P2P di p2pSessions/{tid}/viewers/{viewerId}. */
export type P2PSessionState = "waiting" | "answered" | "rejected" | "closed";

export interface P2PSdpMessage {
  type: string;
  sdp: string;
}

/** Dokumen sesi penonton P2P (dibuat penonton, dijawab admin). */
export interface P2PViewerDoc {
  viewerId: string;
  createdAt?: unknown; // Timestamp Firestore (serverTimestamp saat create)
  expiresAt?: unknown; // Timestamp Firestore — kebijakan TTL opsional (+6 jam)
  state: P2PSessionState;
  offer: P2PSdpMessage;
  answer?: P2PSdpMessage;
  reason?: string;
}

/** Dokumen ICE candidate di subkoleksi candidates. */
export interface P2PCandidateDoc {
  from: "viewer" | "host";
  candidate: string; // JSON RTCIceCandidate
  createdAt?: unknown;
}

/** Ringkasan satu slot penonton P2P untuk UI admin. */
export interface P2PViewerInfo {
  viewerId: string;
  state: "connected" | "waiting" | "answered" | "rejected" | "closed";
  reason?: string;
  since: number; // epoch ms saat sesi diterima/dibuat
}

/** Mesin status siaran Live Control (§5 prompt PHASE 2). */
export type BroadcastState =
  | "offline"
  | "preparing"
  | "ready"
  | "connecting"
  | "starting"
  | "live"
  | "paused"
  | "reconnecting"
  | "error"
  | "stopping";

export type BroadcastDestination = "local" | "public" | "local+public";

export interface BroadcastLiveState {
  state: BroadcastState;
  source?: string; // deskripsi sumber: "window:FreeFire" / "screen:1" / "OBS" / "external"
  destination?: BroadcastDestination;
  startedAt?: number | null;
  endedAt?: number | null;
  attempts?: number;
  message?: string;
}

/** Jenis pengumuman broadcast (§11 prompt PHASE 2). */
export type BroadcastEventType =
  | "LIVE_STARTING"
  | "LIVE_NOW"
  | "MATCH_STARTED"
  | "MATCH_PAUSED"
  | "MATCH_RESUMED"
  | "MATCH_COMPLETED"
  | "RESULT_PUBLISHED"
  | "NEXT_ROUND"
  | "STREAM_RECONNECTING"
  | "TECHNICAL_DIFFICULTIES"
  | "BROADCAST_ENDED"
  | "OVERLAY_PUSHED"
  | "MATCH_INFO_UPDATED";

/** Event broadcast realtime → memicu animasi/notice di TV Display & /live. */
export interface BroadcastEvent {
  id: string;
  type: BroadcastEventType;
  message?: string;
  matchNumber?: number | null;
  map?: string | null;
  at: number; // epoch ms
}

/** Konfigurasi satu layer overlay (§13 prompt PHASE 2). */
export interface OverlayLayerState {
  enabled: boolean;
  opacity?: number; // 0–1
  scale?: number; // 0.5–2
  position?: "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";
  animation?: "none" | "fade" | "slide" | "rise";
  duration?: number; // detik tampil (0 = terus)
  z?: number;
  theme?: string;
}

/** Konfigurasi scene overlay: preset + state seluruh layer. */
export interface OverlaySceneConfig {
  preset: string;
  layers: Record<string, OverlayLayerState>;
  note?: string;
}

/** Dokumen overlayConfigs/{tid} — dipisah draft (preview) vs on-air (§21). */
export interface OverlayConfigDoc {
  tournamentId: string;
  draft: OverlaySceneConfig;
  onAir: OverlaySceneConfig | null;
  /** Konfigurasi per-scene (masing-masing tak saling merusak — §13). */
  scenes?: Record<string, OverlaySceneConfig>;
  pushedAt?: number | null;
  updatedAt?: number;
}

/** State presentasi TV (§17) — TV mengikuti perintah admin realtime. */
export interface PresentationState {
  scene: string;
  playing: boolean;
  auto: boolean;
  updatedAt?: number;
}

export type AdminRoleName = "superadmin" | "admin" | "operator" | "judge" | "scoring";
export type ObserverEventStatus =
  | "pending"
  | "confirmed"
  | "false_positive"
  | "dismissed";
export type ObserverEventType =
  | "MATCH_STARTED"
  | "PLAYER_OBSERVED"
  | "SPECTATOR_TARGET_CHANGED"
  | "POSSIBLE_ENGAGEMENT"
  | "ACTIVE_COMBAT_INDICATOR"
  | "ELIMINATION_DETECTED"
  | "MULTIPLE_ELIMINATIONS"
  | "POSSIBLE_TEAM_FIGHT"
  | "KILL_FEED_CHANGE"
  | "QUIET_PERIOD"
  | "MAP_DETECTED"
  | "MANUAL_EVENT";

export interface Tournament {
  id: string;
  name: string;
  shortName?: string;
  institution: string;
  developer: string;
  status: TournamentStatus;
  format: MatchFormat;
  totalMatches: number;
  teamCapacity: number;
  currentMatchId?: string | null;
  liveStatus: "offline" | "live" | "intermission";
  scoringVersion: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface RosterMember {
  nickname: string;
  role?: string;
}

export interface Team {
  id: string;
  tournamentId: string;
  name: string;
  tag: string;
  number: number;
  status: TeamStatus;
  description?: string;
  roster?: RosterMember[];
  createdAt?: number;
  updatedAt?: number;
}

export interface Match {
  id: string;
  tournamentId: string;
  matchNumber: number;
  map: string;
  format: MatchFormat;
  scheduledAt?: number | null;
  status: MatchStatus;
  isCurrent: boolean;
  resultsPublished: boolean;
  scoringVersion: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface MatchResult {
  teamId: string;
  teamName: string;
  teamTag?: string;
  placement: number;
  kills: number;
  placementPoints: number;
  killPoints: number;
  totalPoints: number;
}

export interface StandingsRow {
  teamId: string;
  teamName: string;
  teamTag: string;
  teamNumber: number;
  matchesPlayed: number;
  kills: number;
  placementPoints: number;
  killPoints: number;
  totalPoints: number; // FINAL — sudah memperhitungkan sanksi (spec §M)
  lastPlacement: number | null;
  rank: number;
  previousRank?: number | null;
  movement: "up" | "down" | "same" | "new";
  needsManualReview?: boolean;
  /** Transparansi sanksi (Tournament Rules & Disciplinary Management): */
  rawPoints?: number; // poin sebelum penalti
  violationPenalty?: number; // total pengurangan
  disciplineStatus?: string | null; // REGISTERED..DISQUALIFIED
}

export interface PublicLeaderboard {
  tournamentId: string;
  standings: StandingsRow[];
  publishedMatchCount: number;
  totalKills: number;
  updatedAt?: number;
  scoringVersion: string;
}

export interface ScoringConfiguration {
  placementPoints: number[]; // 12 nilai resmi BOF
  killPointPerKill: number;
  version: string;
  isOfficial: boolean;
  updatedAt?: number;
  updatedBy?: string;
}

/** Satu lagu pada playlist musik latar siaran. */
export interface MusicTrack {
  id: string;
  title: string;
  /** "mp3" = URL audio langsung (.mp3/.m4a/.ogg/.wav), "yt" = YouTube / YT Music. */
  type: "mp3" | "yt";
  /** URL audio langsung — wajib untuk type "mp3". */
  url?: string;
  /** ID video 11 karakter — wajib untuk type "yt". */
  ytId?: string;
}

/** Pengaturan musik latar (broadcastSettings/{tid}.music). */
export interface MusicSettings {
  enabled: boolean;
  /** 0–100 — volume musik di perangkat penonton. */
  volume: number;
  tracks: MusicTrack[];
  /** Lagu yang sedang diputar (loop). Kosong = lagu pertama. */
  activeTrackId?: string | null;
}

/** Perintah sound effect realtime (panitia → semua penonton). */
export interface SfxCommand {
  type: "beep" | "go" | "booyah" | "match-end" | "airhorn" | "applause" | "pop" | "swoosh";
  /** Epoch ms saat tombol ditekan — penonton mengabaikan perintah > 25 detik. */
  at: number;
}

export interface BroadcastEmergency {
  active: boolean;
  preset: string; // Technical Difficulties | Signal Lost | Reconnecting | Source Offline | Match Paused | Waiting for Official Results | Network Problem | OBS Disconnected
  message: string;
  updatedAt?: number;
}

export interface BroadcastSettings {
  tournamentId: string;
  streamMode: StreamMode;
  youtubeVideoId?: string;
  hlsUrl?: string;
  streamTitle?: string;
  streamUrl?: string; // untuk MediaMTX (LAN)
  /** URL WHIP untuk mempublikasikan capture browser → MediaMTX (WHIP/WHE). */
  whipUrl?: string;
  /** URL WHE (WebRTC playback endpoint) untuk pemirsa/LAN. */
  wheUrl?: string;
  /** Alamat gateway lokal laptop produksi (http://IP:8080) — terdeteksi otomatis oleh admin. */
  localGatewayUrl?: string;
  /** Mode P2P aktif: admin menyetel true saat START LIVE, false saat STOP (signaling hanya boleh dipakai bila true). */
  p2pLive?: boolean;
  /** Batas penonton P2P bersamaan (default 2, rentang 1–4) — laptop mengirim satu aliran per penonton. */
  p2pMaxViewers?: number;
  /** Mesin status siaran (Live Control). */
  live?: BroadcastLiveState;
  /** Musik latar siaran — dikelola dari kartu "Musik Siaran" /admin/broadcast,
   *  diputar (loop) di TV & halaman penonton mengikuti pengaturan realtime. */
  music?: MusicSettings;
  /** Perintah sound effect terakhir — semua penonton membunyikannya saat field berubah. */
  sfx?: SfxCommand | null;
  /** Overlay BOOYAH! besar di TV & /live — momen juara match (muncul ±8 detik lalu
   *  menutup sendiri; perintah lebih tua dari 8 detik diabaikan halaman baru). */
  booyah?: {
    active: boolean;
    /** Nama tim yang BOOYAH (ditampilkan di bawah teks BOOYAH!). */
    teamName?: string;
    matchNumber?: number | null;
    /** Epoch ms saat tombol ditekan. */
    at?: number;
  } | null;
  /** Otomatis pindah ke match berikutnya (dari data Match admin) saat sekuens
   *  mulai game selesai — panitia hanya menekan satu tombol, TV & /live
   *  berganti "MATCH 2 · KALAHARI" realtime. */
  autoNextMatch?: boolean;
  /** BOF CASTER — berbagi layar real-time dengan kode pairing (ala hi.casts.app).
   *  TV menampilkan kode + QR; panitia buka /caster di laptop/HP, ketik kode,
   *  pilih layar → tampil real-time di /display & /live berdampingan leaderboard. */
  caster?: {
    /** Kode pairing 6 digit — ditampilkan besar di TV dan QR mengarah ke /caster?code=… */
    code: string;
    /** Sesi aktif: penonton boleh menyambung ke aliran caster. */
    active: boolean;
    /** Label sumber, mis. "Laptop Operator" / "HP Meja Komentator". */
    label?: string;
    /** Epoch ms sesi dimulai. */
    startedAt?: number;
    /** Epoch ms sesi kedaluwarsa (default mulai +8 jam). */
    expiresAt?: number;
  } | null;
  /** Pengaturan panggung/presentasi (TV & /live). */
  presentation?: {
    /** Sembunyikan judul video & nama channel pada embed YouTube (strip branding di atas video). Default true. */
    cleanYouTube?: boolean;
    /** Animasi & efek panggung (countdown besar, burst GAME START, dsb.). Default true. */
    effects?: boolean;
    /** Tampilkan "Panggung Juara" (podium Top 3 + confetti) fullscreen di TV & /live. */
    podium?: boolean;
  };
  /** Countdown besar di TV & /live — dipicu panitia dari kartu "Panggung TV & Countdown".
   *  endsAt wajib saat active=true (patch stop mengirim { active: false } saja). */
  countdown?: {
    active: boolean;
    /** Epoch ms saat countdown selesai (dihitung dari laptop panitia). */
    endsAt?: number;
    /** Label di atas angka, mis. "MENUJU SIARAN DIMULAI". */
    label?: string;
  };
  /** Sekuens mulai game dengan delay yang diatur panitia — overlay besar di TV & /live:
   *  hitung mundur -> 10..1 -> GAME START. Field wajib saat active=true. */
  startSequence?: {
    active: boolean;
    /** Epoch ms saat panitia menekan tombol mulai. */
    triggerAt?: number;
    /** Jeda (detik) sebelum game benar-benar dimulai, 5–600. */
    delaySeconds?: number;
    /** Label, mis. "MATCH 3 · BERLIN". */
    matchLabel?: string;
  };
  /** Event broadcast terakhir (LIVE NOW, dst.) untuk TV & /live. */
  event?: BroadcastEvent | null;
  showPublicTimeline: boolean;
  announcements?: string[];
  emergency?: BroadcastEmergency;
  updatedAt?: number;
}

export interface ObserverEvent {
  id: string;
  tournamentId: string;
  matchId?: string;
  type: ObserverEventType;
  timestamp: number;
  playerName?: string;
  teamName?: string;
  confidence: number;
  reason?: string;
  status: ObserverEventStatus;
  source?: "ai" | "operator";
  createdAt?: number;
}

export interface AuditLog {
  id: string;
  action: string;
  actorUid: string;
  actorEmail: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
  createdAt?: number;
}

export interface ChampionState {
  /** true HANYA bila semua match format selesai & dipublikasikan dan juara tidak seri. */
  confirmed: boolean;
  candidate: StandingsRow | null;
  gap: number; // selisih poin dengan peringkat 2
  remainingMatches: number;
  possibleTie: boolean;
}

export interface AdminRole {
  uid: string;
  email: string;
  role: AdminRoleName;
  createdAt?: number;
}

export interface FirebaseStatus {
  state: "connecting" | "online" | "offline";
  message?: string;
}
