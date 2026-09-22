/**
 * Centralized Real-Time & Outbox Constants for TechX CTF 2026.
 */

// Redis Channels
export const REDIS_LEADERBOARD_CHANNEL = 'techx:leaderboard:events';

// SSE Event Identifiers
export const SSE_EVENT_LEADERBOARD_UPDATE = 'leaderboard_update';
export const SSE_EVENT_LEADERBOARD_SNAPSHOT = 'leaderboard_snapshot';

// Outbox Worker Configuration
export const OUTBOX_MAX_ATTEMPTS = 5;
export const OUTBOX_BATCH_SIZE = 50;
export const OUTBOX_POLL_INTERVAL_MS = 1000;
export const OUTBOX_BASE_BACKOFF_MS = 500;

// SSE Connection & Heartbeat Configuration
export const SSE_HEARTBEAT_INTERVAL_MS = 25000; // 25s keepalive
