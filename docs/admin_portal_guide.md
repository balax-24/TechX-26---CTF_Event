# TechX CTF 2026 — Master Admin Control Portal Guide

This document is the authoritative operations manual for the **TechX CTF 2026 Dedicated Admin Control Portal**.

---

## 1. ARCHITECTURAL TOPOLOGY & NETWORK ISOLATION

The TechX CTF 2026 administrative control plane runs as a completely decoupled web application operating simultaneously alongside the participant platform:

```
                                  [ LAN / INGRESS ]
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   │                                           │
          PORT 80 (HTTP)                             PORT 8080 (HTTP)
    Participant Experience                       Operations Control Portal
  ┌─────────────────────────┐                   ┌─────────────────────────┐
  │  Vite/React TypeScript  │                   │  Vite/React TypeScript  │
  │    (frontend/ codebase) │                   │ (admin-frontend/ code)  │
  │  /usr/share/nginx/html  │                   │/usr/share/nginx/admin-  │
  └────────────┬────────────┘                   │          html           │
               │                                └────────────┬────────────┘
               │                                             │
               └──────────────────────┬──────────────────────┘
                                      ▼
                        NGINX Reverse Proxy Container
                                      │
                                      ▼
                     Fastify Backend Core (Port 4000)
                     ├── /api/v1/auth/*
                     ├── /api/v1/admin/* (RBAC + CSRF + Password Gate)
                     └── /api/v1/challenges/*
                                      │
                  ┌───────────────────┴───────────────────┐
                  ▼                                       ▼
       PostgreSQL 16 (Port 5432)               Redis 7 (Port 6379)
     Authoritative State of Record         Pub/Sub, SSE, Dynamic Gates
```

### Key Isolation Characteristics:
1. **Dedicated Port (8080):** Organizers and staff access the portal at `http://<SERVER_IP>:8080/`. The participant interface on port 80 contains zero administrative routes or UI assets.
2. **Dedicated Codebase:** `admin-frontend/` is an independent Vite/React project with its own dependencies, styling system, build pipeline, and bundle.
3. **Dedicated NGINX Location Block:** Static assets are served from `/usr/share/nginx/admin-html`, completely separate from `/usr/share/nginx/html`.

---

## 2. CREDENTIAL LIFECYCLE & SECURITY POSTURE

### 2.1 Superadmin Identity
- **Superadmin Identifier:** Configured via `ADMIN_EMAIL` / `ADMIN_BOOTSTRAP_EMAIL` (default: `admin@techxmadras.org` or `techx_admin`)
- **Initial State:** Bootstrapped with an operator-supplied password and flagged in Redis:
  `user:must_change_password:<USER_ID> = "1"`

### 2.2 Forced Password Change Security Gate
- Until the administrator successfully completes the forced password change, **all administrative API mutations and data views on `/api/v1/admin/*` are strictly blocked** with HTTP 403 `FORCE_PASSWORD_CHANGE`.
- The admin interface displays a modal preventing access to telemetry and controls.
- The password change endpoint (`POST /api/v1/auth/change-password`) enforces:
  - Verification of the current temporary password.
  - New password minimum length >= 10 characters.
  - Argon2id password hashing.
  - Clearing the Redis flag upon completion.
  - Invalidation and re-issuance of session cookies.

### 2.3 Strict Plaintext Flag Protection
- Flag secrets are strictly redacted across all standard admin views, submissions tables, and CSV exports.
- Isolated flag inspection is restricted to `POST /api/v1/admin/submissions/:id/inspect-flag`:
  - Enforces `superadmin` role check.
  - Writes an explicit `FLAG_INSPECTION` event to the immutable audit trail with actor IP, timestamp, and challenge ID.

---

## 3. OPERATIONS DIRECTORY (19 SECTIONS + DATA EXPORT)

| # | Section | URL Path / Tab | Description |
|---|---|---|---|
| **01** | **Overview** | `/` (`overview`) | High-density telemetry dashboard: live event status, active teams/participants, health tiles, solve feed, and quick stats. |
| **02** | **Event Control** | `event-control` | Competition phase transitions (`draft` → `registration` → `live` → `paused` → `ended`), timer controls, scoreboard freeze toggle. |
| **03** | **Teams** | `teams` | Team roster, membership inspection, team provisioning, renaming, status toggle, member removal. |
| **04** | **Participants** | `participants` | Participant accounts, email lookup, role escalation (superadmin only), password reset, suspension. |
| **05** | **Challenges** | `challenges` | Authoritative challenge catalogue, point values, difficulty, descriptions, connection info, status toggles. |
| **06** | **Challenge Files** | `files` | Static challenge artifact downloads, file verification, protected storage routing. |
| **07** | **Checkpoints** | `checkpoints` | Multi-step challenge progression, step point values, completion rates. |
| **08** | **Hints** | `hints` | Challenge hints management, cost penalties, release schedule, hint unlocks counter. |
| **09** | **Submissions** | `submissions` | Live forensic submission feed with filters (result, challenge, team), IP tracking, sanitized flags. |
| **10** | **Leaderboard** | `leaderboard` | Authoritative PostgreSQL leaderboard snapshot, deterministic tiebreakers, manual reconciliation broadcast. |
| **11** | **Dynamic Challenges** | `dynamic-challenges` | Live container instances, port allocations, container lifecycles, expired container pruning. |
| **12** | **Scoring Ledger** | `scoring` | Append-only score events ledger, manual score adjustments with mandatory audit reasons. |
| **13** | **Moderation** | `moderation` | Centralized account suspensions and team disqualifications with confirmation guards. |
| **14** | **Audit Logs** | `audit-logs` | Immutable forensic log viewer with JSON payload inspection, actor role, IP, and reason tracking. |
| **15** | **System Health** | `system-health` | Deep diagnostic probes: PostgreSQL latency, Redis ping latency, Challenge Gateway, memory, outbox queue. |
| **16** | **Backups** | `backups` | Database snapshot list, on-demand tar/sql dump creation, dual-authorized database restore. |
| **17** | **Announcements** | `announcements` | Real-time broadcast messages, feed pinning, announcement deletion. |
| **18** | **Settings** | `settings` | Operator session details, self-service password rotation, network topology overview. |
| **19** | **Security Center** | `security` | Security incident stream: failed logins, rate limit triggers, CSRF violations, suspicious requests. |
| **20** | **Emergency Controls** | `emergency` | Air-gapped emergency directives: Pause, Resume, Disable Submissions, Enable Submissions, Maintenance. |
| **EX** | **Data Export (CSV)** | `export` | Clean CSV exports: Teams, Participants, Leaderboard, Submissions (sanitized), Audit Trail. |

---

## 4. HIGH-IMPACT CONFIRMATION SAFETY GATES

To prevent accidental disruptions during live competition, destructive and high-impact actions require typed-phrase confirmations:

| Action | Safety Modal Phrase | Required Role | Impact |
|---|---|---|---|
| **Pause Competition** | `PAUSE EVENT` | Admin / Superadmin | Freezes competition timer and halts all flag verification globally. |
| **Resume Competition** | `RESUME EVENT` | Admin / Superadmin | Restores live scoring and submissions. |
| **Disable Submissions** | `DISABLE SUBMISSIONS` | Admin / Superadmin | Rejects all submissions while allowing challenge browsing. |
| **Enable Submissions** | `ENABLE SUBMISSIONS` | Admin / Superadmin | Opens submission gate. |
| **Disqualify Team** | `DISQUALIFY` | Admin / Superadmin | Strips team from rankings and bans team members. |
| **Suspend Participant** | `BAN` | Admin / Superadmin | Revokes active login sessions immediately. |
| **Restore Database** | `RESTORE` | Superadmin Only | Overwrites active PostgreSQL database with chosen backup archive. |
| **Prune Dynamic Containers**| `PRUNE` | Admin / Superadmin | Stops and terminates expired Docker instances. |
| **Manual Score Adjustment**| `ADJUST` / `PENALTY` | Admin / Superadmin | Appends manual score delta to ledger. |

---

## 5. EMERGENCY PROCEDURES & TROUBLESHOOTING

### 5.1 Competition Emergency Halt
1. Navigate to **Emergency Controls** (`http://<SERVER_IP>:8080/` → section 20).
2. Enter a mandatory operational reason (e.g. `Main auditorium network disconnect`).
3. Click **Pause Entire Competition**.
4. Type `PAUSE EVENT` into the confirmation modal and click **Authorize Directive**.
5. All participant submissions are immediately rejected with HTTP 400 `COMPETITION_PAUSED`.

### 5.2 Database Disaster Restoration
1. Navigate to **Backups** (section 16).
2. Click **+ Generate Immediate Snapshot** to capture current state before restoring.
3. Locate the target verified snapshot in the archive table.
4. Click **Restore Snapshot**.
5. Type `RESTORE` into the confirmation modal and authorize.
6. Check **System Health** (section 15) to confirm database connectivity and query latency.
