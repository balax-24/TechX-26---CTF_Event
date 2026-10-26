# Changelog

All notable changes to the TechX CTF platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-10-26

### Added
- **Core Fastify API Engine**: Production-grade Fastify 4 backend with TypeScript, Zod schema validation, and Pino structured logging with automatic secret redaction.
- **Participant Web Application**: High-performance React 18 Vite Single Page Application (SPA) with responsive layout, real-time solve ticker, countdown timer, challenge cards, and instant feedback toasts.
- **Decoupled Operations Admin Portal**: Dedicated Vite/React administrator control portal isolated on port 8080 featuring live competition state controls (Start, Pause, Delay, Resume, End), challenge catalog editor, team provisioning, score adjustment audits, and CSV data export.
- **Financial-Style Immutable Scoring Ledger**: Server-authoritative scoring pipeline backed by PostgreSQL 16 transactions (`SELECT ... FOR UPDATE`), `UNIQUE(team_id, challenge_id)` constraints, append-only score events ledger, and tie-breaking by last solve timestamp.
- **Real-Time Event Broadcast**: Transactional outbox pattern with Redis 7 Pub/Sub worker delivering real-time solve and leaderboard events via Server-Sent Events (SSE) with automatic browser reconnection (`Last-Event-ID`).
- **Dynamic Container Sandboxing**: Isolated Challenge Gateway service managing ephemeral challenge containers with CPU limits (0.5 CPU), memory caps (256MB), read-only root filesystems, capability dropping (`cap_drop: ALL`), and network isolation from internal databases.
- **Dual-Mode Deployment Architecture**:
  - **Offline College LAN Mode (`docker-compose.lan.yml`)**: Self-hosted fonts and assets with zero external CDN dependencies, designed to run entirely offline on a venue Ethernet switch.
  - **Cloud Production Mode (`docker-compose.prod.yml`)**: Hardened reverse proxy with SSL termination and strict ingress rules.
- **Authentication & Security Posture**:
  - Argon2id password hashing (`m=19456, t=2, p=1`).
  - Cryptographic sliding-window rate limiting backed by Redis sorted sets.
  - Defense-in-depth CSRF protection on mutation endpoints with custom header verification.
  - Strict Role-Based Access Control (RBAC) separating `participant`, `admin`, and `superadmin`.
  - Constant-time string comparisons for flag verification.
- **Automated Verification**:
  - 46 automated unit test suites covering 379 tests with 100% pass rate.
  - Integration load benchmark validating sustained throughput for 400 concurrent simulated users.
- **Operations & Disaster Recovery**:
  - One-click safe startup (`START_LAN.bat`, `START_PUBLIC.bat`).
  - One-click safe shutdown (`SAFE_SHUTDOWN.bat`) with automated safety database backups.
  - Automated PostgreSQL snapshot utility (`BACKUP_DATABASE.bat`).
