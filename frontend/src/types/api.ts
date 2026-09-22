export type UserRole = 'participant' | 'admin' | 'superadmin';
export type TeamStatus = 'ACTIVE' | 'DISABLED' | 'DISQUALIFIED';
export type CompetitionState =
  | 'draft'
  | 'scheduled'
  | 'registration_open'
  | 'live'
  | 'paused'
  | 'ended'
  | 'archived';

export type ChallengeDifficulty = 'beginner' | 'intermediate' | 'expert';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  teamId?: string | null;
  teamRole?: 'captain' | 'member' | null;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  username: string;
  role: 'captain' | 'member';
  joinedAt: string;
}

export interface TeamSolve {
  challengeId: string;
  challengeTitle: string;
  category: string;
  points: number;
  solvedAt: string;
}

export interface Team {
  id: string;
  name: string;
  score: number;
  status: TeamStatus;
  isBanned?: boolean;
  inviteCode?: string;
  members: TeamMember[];
  solves?: TeamSolve[];
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface ChallengeFile {
  id: string;
  filename: string;
  fileSize?: number;
}

export interface Checkpoint {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  points: number;
  isSolved?: boolean;
  solvedAt?: string | null;
  prerequisiteId?: string | null;
}

export interface Hint {
  id: string;
  hintNumber: number;
  penaltyPoints: number;
  isUnlocked: boolean;
  content: string | null;
}

export interface Challenge {
  id: string;
  slug: string;
  title: string;
  category: string;
  difficulty: ChallengeDifficulty;
  points: number;
  solveCount: number;
  isSolved?: boolean;
}

export interface ChallengeDetail extends Challenge {
  description: string;
  connectionInfo?: string | null;
  author?: string | null;
  files: ChallengeFile[];
  hints: Hint[];
  checkpoints: Checkpoint[];
}

export interface LeaderboardEntry {
  rank: number;
  teamId: string;
  teamName: string;
  score: number;
  lastScoreAt: string;
}

export interface LeaderboardSnapshot {
  leaderboardVersion: number;
  updatedAt: string;
  totalTeams: number;
  entries: LeaderboardEntry[];
}

export interface LeaderboardUpdateEvent {
  eventId: string;
  eventType: 'final_solve' | 'checkpoint_solve' | 'hint_penalty' | 'admin_adjustment';
  teamId: string;
  teamName: string;
  score: number;
  pointsDelta: number;
  leaderboardVersion: number;
  challengeTitle?: string;
  timestamp: string;
}

export interface CompetitionInfo {
  name: string;
  state: CompetitionState;
  startTime: string | null;
  endTime: string | null;
  registrationStartTime: string | null;
  registrationEndTime: string | null;
  timezone: string;
  isSubmissionEnabled: boolean;
}

export interface FlagSubmissionResult {
  success: boolean;
  status: 'correct' | 'incorrect' | 'already_solved';
  pointsAwarded: number;
  newScore: number;
  message?: string;
}

export interface CheckpointValidationResult {
  success: boolean;
  status: 'passed' | 'failed' | 'already_completed';
  pointsAwarded: number;
  newScore: number;
  message?: string;
}
