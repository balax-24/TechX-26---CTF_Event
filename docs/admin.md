# TechX CTF 2026 — Admin & Competition Control Plane Architecture

## 1. Overview & Flow

Stage 6 implements the authoritative backend control plane for contest administrators, challenge coordinators, and event operations.

```text
Admin API (/api/v1/admin/*)
   │
   ├─► Authentication (JWT / HttpOnly Cookie)
   │
   ├─► RBAC Guard (Admin / Superadmin hierarchy)
   │
   ├─► CSRF Protection (Custom header validation on cookie mutations)
   │
   ├─► Rate Limiter (Dual-tier sliding-window mutation limit: 60 ops/min)
   │
   ├─► Domain Validation (Zod schemas, state machine transition checks, timeline invariants)
   │
   └─► PostgreSQL Atomic Transaction (READ COMMITTED / Pessimistic Row Locks)
         │
         ├─► State Mutation (competition_state, challenges, teams, users)
         │
         ├─► Immutable Score Ledger (score_events: event_type = 'admin_adjustment')
         │
         ├─► Append-Only Audit Log (audit_logs: actor, IP, diffs, redacted secrets)
         │
         └─► Transactional Outbox (score_event_outbox: monotonic leaderboard_version)
                 │
                 ▼ (Instant trigger / outbox worker)
             Redis Pub/Sub ('techx:leaderboard:events')
                 │
                 ▼
             SSE Connection Manager
                 │
                 ▼
             Real-Time Participant Browsers
```

---

## 2. Competition Lifecycle State Machine

The competition state is authoritative and enforced across all participant-facing endpoints (flag submissions, checkpoint validations, and hint unlocks).

### Lifecycle States

1. **`DRAFT`**: Initial configuration phase. Challenge and checkpoint authoring. All participant scoring operations are blocked (`COMPETITION_NOT_ACTIVE`).
2. **`SCHEDULED`**: Competition scheduled with timeline. Participants can view announcements but cannot submit flags.
3. **`REGISTRATION_OPEN`**: Team creation and membership operations enabled. Challenge solving disabled.
4. **`LIVE`**: Normal competition operations enabled. Flag submissions, checkpoint solves, and hint unlocks active.
5. **`PAUSED`**: Emergency freeze. Participant submissions and hint claims immediately rejected with `COMPETITION_PAUSED` (HTTP 403). Existing committed scores remain intact.
6. **`ENDED`**: Official competition termination. Flag submissions and score updates rejected with `COMPETITION_ENDED` (HTTP 403).
7. **`ARCHIVED`**: Final read-only terminal state. No further operational transitions permitted.

### Transition Matrix

```text
DRAFT
  ├──► SCHEDULED
  └──► REGISTRATION_OPEN

SCHEDULED
  ├──► REGISTRATION_OPEN
  └──► LIVE

REGISTRATION_OPEN
  └──► LIVE

LIVE
  ├──► PAUSED
  └──► ENDED

PAUSED
  ├──► LIVE
  └──► ENDED

ENDED
  └──► ARCHIVED

ARCHIVED (Terminal - No outbound transitions)
```

Arbitrary or backward transitions (e.g. `ARCHIVED -> LIVE`, `ENDED -> LIVE`, `DRAFT -> ENDED`) are strictly prohibited and rejected with `INVALID_STATE_TRANSITION`.

---

## 3. Role-Based Access Control (RBAC) Matrix

| Operation | Participant | Admin | Superadmin |
|---|:---:|:---:|:---:|
| View Public Challenges & Solves | Yes | Yes | Yes |
| Submit Flags / Checkpoints | Yes | **No\*** | **No\*** |
| View Admin Competition State | No | Yes | Yes |
| Transition Competition Lifecycle | No | Yes | Yes |
| Emergency Pause / Resume | No | Yes | Yes |
| Update Competition Config / Timeline | No | Yes | Yes |
| Create / Update Challenges | No | Yes | Yes |
| Add Checkpoints / Hints | No | Yes | Yes |
| View All Teams & Member Details | No | Yes | Yes |
| Set Team Status (Active/Disabled/Disqualified) | No | Yes | Yes |
| Rename Team | No | Yes | Yes |
| Administrative Score Adjustment | No | Yes | Yes |
| Deactivate / Reactivate User | No | Yes | Yes |
| Change User Role (Promote/Demote) | No | **No** | **Yes** |
| View Audit Logs | No | Yes | Yes |
| Edit or Delete Audit Logs | **No** | **No** | **No** |

`*` **Admin Participation Guard**: To prevent privilege confusion or accidental score tampering, administrative accounts (`admin`, `superadmin`) are rejected with `ADMIN_PARTICIPATION_FORBIDDEN` (HTTP 403) on participant flag submission and checkpoint validation routes.

---

## 4. Challenge Administration & Immutability Rules

To guarantee competitive fairness:

1. **Scoring Component Cap Invariant**:
   $$\sum \text{checkpoint.pointValue} \le \text{challenges.points}$$
   Enforced at authoring time. Adding or editing a checkpoint whose points would breach the challenge cap fails with `POINTS_EXCEED_CHALLENGE_CAP`.
2. **First-Solve Immutability Locking**:
   - Before any solves (`solveCount === 0` and `scoreEvents.count === 0`): Points, flags, checkpoints, and metadata may be modified subject to schema validation.
   - After the first team solves the challenge (`solveCount > 0` or historical score events exist):
     - Modifying `points` throws `CHALLENGE_LOCKED_FOR_SCORING`.
     - Modifying `flag` throws `CHALLENGE_LOCKED_FOR_SCORING`.
     - Adding checkpoints throws `CHALLENGE_LOCKED_FOR_SCORING`.
     - Non-scoring metadata (title, story, description, author, connection info) remains editable with full audit trail.
3. **Secret Masking**:
   Admin API endpoints never return `flagHash`, raw flag secrets, or internal credential hashes in responses.

---

## 5. Team Moderation Semantics

Teams transition between three operational states:
- `ACTIVE`: Normal competition status.
- `DISABLED`: Temporarily frozen under investigation. `isBanned = true`. Submissions blocked (`TEAM_DISABLED`).
- `DISQUALIFIED`: Permanently disqualified for rules violations. `isBanned = true`. Submissions blocked (`TEAM_DISQUALIFIED`).

### Preservation of Historical Identity
- Teams with historical scores or solves are **never destructively deleted**.
- All ledger events, checkpoint progress, and submission records are permanently preserved.
- Audit records capture the moderator's identity, timestamp, before/after status, and mandatory reason string ($\ge 3$ characters).

---

## 6. Administrative Score Adjustments

Under no circumstances does the system expose `UPDATE score_events` or `DELETE FROM score_events`.

### Implementation
1. **Immutable Ledger Append**:
   Every adjustment inserts a new row into `score_events` with `eventType: 'admin_adjustment'` and `points: delta` (positive for bonuses/compensation, negative for penalties).
2. **Bounds & Floor Invariants**:
   - Delta must be a non-zero integer bounded within $[-100,000, +100,000]$.
   - Resulting score cannot drop below zero (`newScore >= 0`); throws `SCORE_UNDERFLOW_PROHIBITED` if underflow is attempted.
   - Resulting score cannot exceed 32-bit integer bounds (`newScore <= 2147483647`).
3. **Stage 4 Reconciliation Guarantee**:
   $$\text{teams.score} = \sum_{\text{events}} \text{score\_events.points}$$
   Because adjustments are ledger deltas, the Stage 4 mathematical invariant holds perpetually.
4. **Database-Level Idempotency Protection**:
   When an `idempotencyKey` is provided (via payload or `Idempotency-Key` header), concurrent requests serialize across API instances using `pg_advisory_xact_lock(hashtext(key))`. The result is cached in `admin_idempotency_keys` (`PRIMARY KEY (key)`). Concurrent racing requests and replayed requests receive the cached authoritative result with `isIdempotentReplay: true` without duplicating ledger rows, outbox events, audit records, or leaderboard versions.
5. **Outbox & Leaderboard Integration**:
   Every adjustment obtains the next monotonic version from `leaderboard_version_seq`, inserts a record into `score_event_outbox`, triggers the outbox worker, and updates the real-time SSE stream.

---

## 7. Append-Only Audit Logging

Every administrative mutation records an entry in `audit_logs` within the mutation's database transaction:
- `actorId`, `actorRole`, `actorIp` (derived strictly from server-side JWT session, never client payload).
- `action` (e.g. `ADMIN_SCORE_ADJUSTMENT`, `COMPETITION_PAUSE`, `CHALLENGE_CREATE`).
- `entityType`, `entityId`.
- `previousState`, `newState` (diff snapshots).
- `reason` (mandatory human-readable rationale).
- `requestId`.

### Cryptographic Secret Redaction
`sanitizeAuditData` recursively redacts sensitive credentials (passwords, password hashes, raw flags, submitted flags, secret proofs, tokens, HMAC keys, invite codes) with `[REDACTED]`. Legitimate non-secret operational metadata (e.g. `flagCount`, `flagFormat`, `hashAlgorithm`, `commitHash`, `points`, `status`) is preserved for forensic reconstruction.

No endpoints exist to update or delete audit logs. The audit log is strictly append-only.

---

## 8. CSRF & Concurrency Protections

1. **CSRF Defense-in-Depth Model**:
   - Safe HTTP methods (`GET`, `HEAD`, `OPTIONS`) bypass CSRF checks.
   - Non-ambient Bearer token requests (used by CLI, test suites, programmatic API clients) bypass CSRF checks.
   - Ambient HttpOnly cookie-authenticated mutations (`POST`, `PUT`, `PATCH`, `DELETE`) enforce a 4-layer defense:
     1. **Session Authentication**: Caller must possess a valid, server-verified JWT in `access_token` cookie.
     2. **Origin & Referer Verification**: Origin must match allowed `CORS_ORIGIN` entries; cross-origin requests are blocked with `403 ORIGIN_NOT_ALLOWED`.
     3. **Session-Bound Cryptographic CSRF Token**: Client must provide `X-CSRF-Token` header containing `<16-byte-nonce>.<hmac-sha256(nonce:userId, COOKIE_SECRET)>`. The server verifies cryptographic integrity and constant-time user binding.
     4. **Double-Submit Cookie Match**: If `csrf_token` cookie is present, it must match the header token.
2. **Concurrency Protections**:
   - `SELECT ... FOR UPDATE` row-level locks on `teams` and `competition_state`.
   - Authoritative challenge & checkpoint immutability checking persisted database tables (`teamSolves`, `scoreEvents`, `checkpointProgress`, `challenges.solveCount`).
   - Checkpoint point invariant `sum(checkpoints) <= challenge.points` enforced on create and update.
   - Checkpoint deletion and scoring-critical mutations locked once historical activity exists (`CHALLENGE_LOCKED_FOR_SCORING`).
   - Team status is the single source of truth (`team.status`), with `isBanned` synchronized strictly for backward compatibility.
   - Bounded pagination (`limit` capped at 100, deterministic tie-breaking sorting) on all admin listing endpoints.
