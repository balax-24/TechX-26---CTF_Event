import { EventEmitter } from 'events';

export interface ScoreEventPayload {
  teamId: string;
  teamName: string;
  challengeId?: string | null;
  challengeTitle?: string | null;
  checkpointId?: string | null;
  checkpointNumber?: number | null;
  eventType: 'final_solve' | 'checkpoint_solve' | 'hint_penalty' | 'admin_adjustment';
  pointsAwarded: number;
  newTeamScore: number;
  timestamp: Date;
}

class ScoringEventBus extends EventEmitter {
  emitScoreEvent(payload: ScoreEventPayload): boolean {
    return this.emit('score_event', payload);
  }

  onScoreEvent(listener: (payload: ScoreEventPayload) => void): this {
    return this.on('score_event', listener);
  }
}

export const scoringEventBus = new ScoringEventBus();
