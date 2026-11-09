// ============================================================
// ZEROID ESPORTS — Tipe data Firestore
// Battle Off Friends (BOF) — SMK TI Bali Global Karangasem
// ============================================================

export type TournamentStatus = "draft" | "active" | "completed";
export type MatchFormat = "BO3" | "BO5" | "BO7" | "CUSTOM";
export type MatchStatus = "scheduled" | "live" | "completed" | "cancelled";
export type TeamStatus = "active" | "inactive" | "banned";
export type StreamMode = "youtube" | "mediamtx" | "offline";
export type AdminRoleName = "superadmin" | "admin" | "operator";
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
  totalPoints: number;
  lastPlacement: number | null;
  rank: number;
  previousRank?: number | null;
  movement: "up" | "down" | "same" | "new";
  needsManualReview?: boolean;
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
