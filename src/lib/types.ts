// ============================================================
// STIKAR ESPORTS — Tipe data Firestore
// Battle Off Friends (BOF) — SMK TI Bali Global Karangasem
// ============================================================

export type TournamentStatus = "draft" | "active" | "completed";
export type MatchFormat = "BO3" | "BO5" | "BO7" | "CUSTOM";
export type MatchStatus = "scheduled" | "live" | "completed" | "cancelled";
export type TeamStatus = "active" | "inactive" | "banned";
export type StreamMode = "youtube" | "mediamtx" | "offline";

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
  /** Mesin status siaran (Live Control). */
  live?: BroadcastLiveState;
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
