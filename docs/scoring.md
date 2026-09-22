# TechX CTF 2026 — Scoring Engine Specification (Stage 4)

## 1. Executive Summary & Principles

The TechX CTF 2026 scoring engine acts as a **financial accounting ledger** for competitive points.
- **Server Authority**: The client is never authoritative. Points, scores, solve status, and ranks are calculated exclusively by the backend inside atomic PostgreSQL transactions.
- **Strict Immutability**: All point adjustments are append-only rows in `score_events`. Past ledger rows are never deleted or mutated.
- **Double-Entry Consistency**: `teams.score` acts as a materialized cache that must always reconcile with `SUM(score_events.points)`.

---

## 2. The Capped Component Scoring Model

To support multi-step challenges without inflating the maximum obtainable points, TechX CTF 2026 employs a **Capped Component Scoring Model**:

$$ \text{Total Challenge Points} = \text{challenges.points} $$

1. **Checkpoints**: Partial milestone steps award partial points ($P_{\text{cp}}$) when validated.
2. **Final Solve**: When the final flag is submitted, the solve reward is dynamically calculated as:
   $$ P_{\text{final}} = \max(0, \text{challenges.points} - \sum P_{\text{cp\_awarded}}) $$
3. **Scoring Invariant**: For any team and challenge:
   $$ \sum P_{\text{cp\_awarded}} + P_{\text{final}} - \sum P_{\text{hints}} = \text{Actual Ledger Contribution} $$

### Example:
- Challenge Points: `500`
- Checkpoint 1: `50` points
- Checkpoint 2: `100` points
- Final Flag Solve: `350` points ($500 - 150 = 350$)
- Hint 1 Unlocked: `-25` points
- **Net Team Contribution**: `475` points

If a team solves the final flag directly without submitting checkpoints, they receive the full `500` points. Submitting checkpoints later will yield `0` additional points (`already_solved`).

---

## 3. Atomic Transaction Pipeline

Every score mutation executes within a PostgreSQL transaction with pessimistic row-level locking:

```text
BEGIN TRANSACTION;

1. SELECT * FROM team_solves WHERE team_id = $1 AND challenge_id = $2 FOR UPDATE;
   -> If exists: return { status: 'already_solved', pointsAwarded: 0 }

2. SELECT * FROM teams WHERE id = $1 FOR UPDATE;
   -> Locks team row to prevent concurrent score race conditions.

3. Calculate remaining points:
   pointsToAward = max(0, challenge.points - awardedCheckpointPoints)
   newScore = team.score + pointsToAward

4. INSERT INTO team_solves (team_id, challenge_id, solved_by_user_id) VALUES (...);
   -> Enforced by hard UNIQUE(team_id, challenge_id) index.

5. INSERT INTO score_events (team_id, challenge_id, event_type, points, running_team_score)
   VALUES (..., 'final_solve', pointsToAward, newScore);

6. UPDATE teams SET score = newScore, last_score_at = NOW() WHERE id = $1;

7. UPDATE challenges SET solve_count = solve_count + 1 WHERE id = $2;

8. INSERT INTO submissions (audit attempt);

COMMIT;
```

---

## 4. Concurrency & Idempotency Guarantees

### Dual-Member Race Condition Mitigation:
When two team members submit the correct flag at the exact same millisecond:
1. Both enter the transaction.
2. The first acquires the lock, inserts the `team_solves` row, appends to `score_events`, updates `teams.score`, and commits.
3. The second transaction unblocks. It sees the newly inserted `team_solves` row (or trips the database `UNIQUE(team_id, challenge_id)` index), logs the attempt in `submissions`, and safely returns:
   ```json
   {
     "status": "already_solved",
     "pointsAwarded": 0,
     "challengeSolved": true
   }
   ```
4. Exactly **1** solve event and **1** score reward are granted.

---

## 5. Hint Penalty Integration & Score Floor

- Hints have configurable penalty points (`hints.penalty_points`).
- When a hint is unlocked:
  1. Idempotency is enforced by `UNIQUE(team_id, hint_id)` in `team_hints`.
  2. The team row is locked (`SELECT ... FOR UPDATE`).
  3. A **Score Floor of 0** is strictly enforced:
     $$ \text{newScore} = \max(0, \text{team.score} - \text{hint.penalty\_points}) $$
     $$ \text{netDeduction} = \text{team.score} - \text{newScore} $$
  4. If `netDeduction > 0`, an append-only negative ledger event (`hint_penalty`, `points: -netDeduction`) is recorded in `score_events`.

---

## 6. Deterministic Tie-Breaking

Leaderboard tie-breaking is strictly deterministic across all queries:
```sql
ORDER BY
  teams.score DESC,
  teams.last_score_at ASC
```
- Higher total score always ranks higher.
- In the event of a point tie, the team that reached their current score **earlier in time** (`last_score_at ASC`) ranks higher (FIFO principle).

---

## 7. Score Reconciliation Utility

The platform exposes an internal diagnostic function `scoringService.reconcileTeamScore(teamId)`:
```typescript
const result = await scoringService.reconcileTeamScore(teamId);
// Returns: { teamScore: number, ledgerSum: number, isConsistent: boolean }
```
If `teamScore !== ledgerSum`, an audit alert is triggered, allowing staff to immediately detect any database divergence.
