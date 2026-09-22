# TechX CTF 2026 — Leaderboard Engine Specification (Stage 5)

## 1. Executive Summary

The TechX CTF 2026 Leaderboard Engine provides a high-concurrency, server-authoritative scoring pipeline capable of supporting **200–400 participants** and **400–800+ simultaneous browser streams** across both offline LAN environments and production cloud infrastructure.

```text
PostgreSQL is authoritative.
Redis is transport/cache.
SSE is delivery.
The browser is never authoritative.
```

---

## 2. Deterministic Ranking Invariant

To eliminate ranking ambiguity, disputes, and non-deterministic UI jitter, leaderboard ranking strictly follows a deterministic 3-tier sort:

1. **Score (Descending)**: Teams with higher accumulated points rank higher.
2. **Last Score Timestamp (Ascending — FIFO)**: When two or more teams share the exact same score, the team that reached that score *earlier* ranks higher.
3. **Immutable Team UUID (Ascending)**: In the vanishingly rare event that two teams reach identical scores at the exact same microsecond, their immutable database UUID (`teams.id`) serves as the definitive, stable tie-breaker.

### Database Query
```sql
SELECT
  id,
  name,
  score,
  last_score_at,
  RANK() OVER (ORDER BY score DESC, last_score_at ASC, id ASC) AS rank
FROM teams
WHERE is_banned = false
ORDER BY score DESC, last_score_at ASC, id ASC;
```

With the composite index `idx_teams_score_tiebreak (score, last_score_at)`, this query runs in under **2ms** for 400+ teams.

---

## 3. Monotonic Versioning (`leaderboardVersion`)

Every score-affecting mutation (challenge solve, checkpoint reward, or hint penalty) committed to PostgreSQL increments the global ledger sequence.

- The leaderboard snapshot returns:
  ```json
  {
    "leaderboardVersion": 42,
    "updatedAt": "2026-09-22T13:30:00.000Z",
    "totalTeams": 120,
    "entries": [
      {
        "rank": 1,
        "teamId": "f0000000-0000-0000-0000-000000000001",
        "teamName": "CyberKnights",
        "score": 1450,
        "lastScoreAt": "2026-09-22T13:25:10.123Z"
      }
    ]
  }
  ```
- **Gap Detection & Realignment**: If a client reconnects or detects a version gap between its local state and incoming stream events, the client immediately re-fetches `GET /api/v1/leaderboard` to re-align state.

---

## 4. REST API Endpoint

### `GET /api/v1/leaderboard`
- **Access**: Public / Participant
- **Description**: Returns the complete server-calculated leaderboard snapshot.
- **Payload Shape**:
  - `leaderboardVersion` (number)
  - `updatedAt` (ISO timestamp)
  - `totalTeams` (number)
  - `entries` (Array of ranked team summaries)

---

## 5. Security & Privacy Guarantees

Leaderboard events and snapshots strictly exclude:
- User email addresses
- User passwords & argon2 hashes
- Team invite codes & secret hashes
- Flags & dynamic HMAC secrets
- Checkpoint proof hashes
- Internal audit logs
