# TechX CTF 2026 — Platform Architecture

## 1. System Overview

TechX CTF 2026 is an IEEE-affiliated, production-grade Capture The Flag platform designed to support 200–400 concurrent participants across two deployment profiles:
1. **Environment A (College LAN / Laptop)**: Single-host Docker Compose stack utilizing local storage and bridge networking.
2. **Environment B (Production / Cloud)**: Multi-host production architecture with TLS termination, isolated database tiers, Redis caching, and NGINX reverse proxying.

---

## 2. Architectural Layers

```text
               +-------------------------------------------+
               |         NGINX Reverse Proxy (Port 80/443) |
               |     SSL / Static UI / Rate Limiting Cache |
               +---------------------+---------------------+
                                     |
                                     v
               +-------------------------------------------+
               |        Fastify Core Backend (Node.js)     |
               |  - Auth & RBAC (Argon2id / Fastify JWT)   |
               |  - Challenge Engine & Visibility Window   |
               |  - Submissions & Flag Verification (HMAC) |
               |  - Checkpoints & Prerequisite Validator   |
               |  - Atomic Scoring Engine (PostgreSQL Tx)  |
               +----------+--------------------+-----------+
                          |                    |
                          v                    v
+-----------------------------+    +-----------------------------+
|    PostgreSQL 16 (Ledger)   |    |       Redis 7 (In-Memory)   |
| - Users, Teams, Challenges  |    | - Sliding-Window Limiter    |
| - Solves, Checkpoints       |    | - Token Blacklists & Cache  |
| - score_events (Ledger)     |    | - Stage 5 Pub/Sub Channel   |
+-----------------------------+    +-----------------------------+
```

---

## 3. Implemented Stages Summary

### Stage 1: Platform Foundation
- Docker Compose topologies (`base`, `lan`, `production`).
- PostgreSQL 16 schema with Drizzle ORM.
- Redis 7 client with health probes and automatic reconnection.
- Pino structured logger with redaction of sensitive credentials.

### Stage 2: Authentication & Team Engine
- Argon2id password hashing with custom salt parameters.
- Fastify JWT session management with HttpOnly cookies and Bearer token support.
- Role-Based Access Control: `participant`, `admin`, `superadmin`.
- Team formation, captain delegation, and hashed invite codes (`TECHX-XXXX-YYYY`).

### Stage 3: Challenge Engine & Flag Subsystem
- Category management (`Web`, `Pwn`, `Crypto`, `Forensics`, `Reverse`, `Misc`).
- Difficulty tiers (`beginner`, `intermediate`, `expert`).
- Automated release scheduler with visibility window guards.
- Cryptographic flag protection: Salted SHA-256 for static flags, HMAC-SHA256 for team-specific dynamic flags.
- Hint unlocking with progressive penalties.
- Protected challenge file downloads via NGINX `X-Accel-Redirect`.

### Stage 4: Checkpoints, Flag Submissions & Scoring Engine
- **Capped Component Scoring Model**: $\text{Final Solve} = \max(0, \text{challenge.points} - \sum \text{checkpointPoints})$. Total challenge contribution strictly equals configured points.
- **Immutable Financial Ledger**: `score_events` table tracks all point events (`final_solve`, `checkpoint_solve`, `hint_penalty`, `admin_adjustment`) with running balance snapshots.
- **Pessimistic Row-Level Locking**: `SELECT ... FOR UPDATE` on `teams` combined with hard unique database constraints (`UNIQUE(team_id, challenge_id)`).
- **Concurrency & Idempotency**: 50 simultaneous submissions by teammates guarantee exactly 1 reward and 49 duplicate responses without double-scoring.
- **Sequential Checkpoint Prerequisites**: Anti-tampering prerequisite chain (Step $N$ requires Step $N-1$).
- **Deterministic Tie-Breaking**: Leaderboard ranking is strictly `score DESC, last_score_at ASC`.
- **Sliding-Window Rate Limiting**: Redis pipeline rate limiter with in-memory fallback protecting flag and checkpoint submission routes.
- **Post-Commit Event Decoupling**: Database transactions commit *before* publishing domain events to `scoringEventBus`, avoiding phantom broadcasts.

---

## 4. Database Constraints & Integrity Matrix

| Table | Constraint | Purpose |
|---|---|---|
| `team_solves` | `UNIQUE(team_id, challenge_id)` | Prevents duplicate challenge solve rewards across concurrent requests |
| `checkpoint_progress` | `UNIQUE(team_id, checkpoint_id)` | Prevents duplicate checkpoint points across concurrent requests |
| `team_hints` | `UNIQUE(team_id, hint_id)` | Prevents duplicate hint purchases or penalties |
| `checkpoints` | `UNIQUE(challenge_id, step_number)` | Enforces unique step numbering within a challenge |
| `teams` | `INDEX(score DESC, last_score_at ASC)` | Optimizes deterministic leaderboard queries |
| `score_events` | `INDEX(team_id, created_at)` | Accelerates score reconciliation and team audit timeline |
