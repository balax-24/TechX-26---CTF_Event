export interface User {
  id: string;
  username: string;
  email: string;
  role: 'participant' | 'admin' | 'superadmin';
  createdAt?: string;
  mustChangePassword?: boolean;
}

export interface OverviewTelemetry {
  eventStatus: string;
  activeTeams: number;
  activeParticipants: number;
  totalSolves: number;
  totalSubmissions: number;
  hintsUsed: number;
  currentLeaderboardVersion: number;
  sseConnections: number;
  dynamicInstances: number;
  health: {
    server: 'HEALTHY' | 'DEGRADED' | 'DOWN';
    database: 'HEALTHY' | 'DEGRADED' | 'DOWN';
    redis: 'HEALTHY' | 'DEGRADED' | 'DOWN';
    gateway: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  };
  recentSolves: Array<{
    id: string;
    teamId: string;
    teamName: string;
    challengeId: string;
    challengeTitle: string;
    solvedAt: string;
  }>;
  recentFailedSubmissions: Array<{
    id: string;
    teamName: string;
    username: string;
    challengeTitle: string;
    createdAt: string;
  }>;
  recentTeamChanges: Array<{
    id: string;
    action: string;
    entityId: string;
    reason: string;
    createdAt: string;
  }>;
  recentAdminActions: Array<{
    id: string;
    actorRole: string;
    action: string;
    entityType: string;
    entityId: string;
    reason: string;
    createdAt: string;
  }>;
  recentSecurityEvents: Array<{
    id: string;
    action: string;
    actorIp: string;
    reason: string;
    createdAt: string;
  }>;
}

export interface Team {
  id: string;
  name: string;
  score: number;
  lastScoreAt: string;
  status: 'active' | 'disabled' | 'disqualified';
  isBanned: boolean;
  createdAt: string;
  members?: Array<{
    userId: string;
    username: string;
    email: string;
    role: 'captain' | 'member';
  }>;
}

export interface Participant {
  id: string;
  username: string;
  email: string;
  role: 'participant' | 'admin' | 'superadmin';
  isActive: boolean;
  createdAt: string;
  teamId?: string | null;
  teamName?: string | null;
}

export interface Challenge {
  id: string;
  slug: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'expert';
  points: number;
  status: 'draft' | 'published' | 'hidden' | 'archived';
  category?: string;
  author: string;
  solveCount: number;
  connectionInfo?: string;
  isDynamicHmac?: boolean;
}

export interface Checkpoint {
  id: string;
  challengeId: string;
  challengeTitle: string;
  challengeSlug: string;
  stepNumber: number;
  title: string;
  description: string;
  pointValue: number;
  validationType: string;
  completionCount: number;
  createdAt: string;
}

export interface Hint {
  id: string;
  challengeId: string;
  challengeTitle: string;
  challengeSlug: string;
  orderNumber: number;
  content: string;
  penaltyPoints: number;
  unlockedCount: number;
  createdAt: string;
}

export interface Submission {
  id: string;
  teamId: string;
  teamName: string;
  userId: string;
  username: string;
  challengeId: string;
  challengeTitle: string;
  isCorrect: boolean;
  ipAddress: string;
  userAgent?: string | null;
  createdAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  teamId: string;
  teamName: string;
  score: number;
  lastScoreAt: string;
}

export interface DynamicInstance {
  id: string;
  challengeId: string;
  challengeTitle: string;
  teamId: string;
  teamName: string;
  status: string;
  containerId?: string;
  containerName: string;
  internalIp?: string;
  internalPort: number;
  createdAt: string;
  expiresAt: string;
  failureReason?: string;
}

export interface ScoreLedgerEntry {
  id: string;
  teamId: string;
  teamName: string;
  challengeId?: string;
  challengeTitle?: string;
  eventType: string;
  points: number;
  runningTeamScore: number;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId?: string;
  actorRole: string;
  actorIp: string;
  action: string;
  entityType: string;
  entityId?: string;
  reason?: string;
  createdAt: string;
  detailsJson?: any;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  authorUsername?: string;
}

export interface BackupItem {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}
