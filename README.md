# TechX CTF Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.28+-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![React](https://img.shields.io/badge/React-18.3+-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose_v2-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

A production-grade, modular Capture The Flag (CTF) competition infrastructure engineered for both **offline campus LAN deployments** and **high-availability cloud hosting**.

Originally built and field-tested for the **IEEE TechX Madras 2026** cybersecurity competition, this platform has been decoupled and prepared as an extensible, self-contained open-source engine capable of running high-concurrency competitive tournaments with hundreds of concurrent participants.

---

## Table of Contents

- [Key Capabilities](#key-capabilities)
- [Architecture & Tech Stack](#architecture--tech-stack)
  - [Service Topology](#service-topology)
  - [Security & Isolation Model](#security--isolation-model)
- [Interfaces](#interfaces)
  - [Participant Web Experience](#participant-web-experience)
  - [Dedicated Admin Operations Portal](#dedicated-admin-operations-portal)
- [Challenge Engine & Scoring](#challenge-engine--scoring)
  - [Dynamic Scoring Algorithm](#dynamic-scoring-algorithm)
  - [Checkpoint Progression](#checkpoint-progression)
  - [Dynamic Challenge Gateway](#dynamic-challenge-gateway)
- [Directory Structure](#directory-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [1. Clone & Configure Secrets](#1-clone--configure-secrets)
  - [2. Deploy Container Stack](#2-deploy-container-stack)
  - [3. Apply Database Migrations](#3-apply-database-migrations)
  - [4. Seed Challenge Catalog](#4-seed-challenge-catalog)
  - [5. Provision Superadmin Account](#5-provision-superadmin-account)
- [Deployment Topologies](#deployment-topologies)
  - [College LAN / Air-Gapped Mode](#college-lan--air-gapped-mode)
  - [Cloud Production (VPS / HTTPS)](#cloud-production-vps--https)
  - [Remote Access via Secure Quick Tunnel](#remote-access-via-secure-quick-tunnel)
- [Developer Workflow & Testing](#developer-workflow--testing)
  - [Running Unit & Integration Tests](#running-unit--integration-tests)
  - [Building Frontends](#building-frontends)
- [Adding & Authoring Challenges](#adding--authoring-challenges)
  - [Static Challenges](#static-challenges)
  - [Dynamic Sandboxed Containers](#dynamic-sandboxed-containers)
- [Backup, Disaster Recovery & Reset](#backup-disaster-recovery--reset)
- [Security Architecture & Controls](#security-architecture--controls)
- [License & Open Source Status](#license--open-source-status)

---

## Key Capabilities

- **Zero-Polling Real-Time Updates**: Live scoreboard, solve announcements, first-blood alerts, and broadcast notifications stream instantly via Server-Sent Events (SSE) backed by Redis Pub/Sub.
- **Dynamic Challenge Provisioning**: On-demand Docker challenge sandbox containers spun up per-team via an isolated Gateway daemon with automated port mapping, resource ceilings, and background lifecycle cleanup.
- **Cheating & Abuse Mitigation**:
  - Constant-time cryptographic flag comparisons (`crypto.timingSafeEqual`) preventing timing side-channel attacks.
  - Salted SHA-256 flag storage (raw flags never touch the database).
  - Multi-tier sliding window rate-limiting on flag submission endpoints.
  - Multi-checkpoint challenge progression (prevents brute-forcing final solutions).
- **Dual Independent Portals**:
  - Fast, responsive participant frontend with category filters, instance controls, countdown clock, and live feed.
  - Dedicated operations admin console (`:8080`) with real-time audit logs, team provisioning, challenge toggles, timer controls, and score freezes.
- **Fail-Fast Operational Safety**:
  - Automated pre-flight configuration validation powered by Zod schemas.
  - Mandatory 32-byte cryptographic secret generation scripts (`.sh` & `.ps1`).
  - Production mode refuses start if default or placeholder credentials exist.

---

## Architecture & Tech Stack

```
                                      [ Participant / Admin Traffic ]
                                                     │
                                                     ▼
                                            ┌─────────────────┐
                                            │   NGINX Ingress │ (Reverse Proxy / Rate Limit / Static Cache)
                                            └────────┬────────┘
                                                     │
                             ┌───────────────────────┴───────────────────────┐
                             ▼                                               ▼
                    ┌─────────────────┐                             ┌─────────────────┐
                    │  Participant UI │ (Port 80)                   │ Admin Dashboard │ (Port 8080)
                    │  (Vite + React) │                             │ (Vite + React)  │
                    └─────────────────┘                             └─────────────────┘
                                                     │
                                                     ▼
                                            ┌─────────────────┐
                                            │ Fastify Backend │ (Node.js 20 LTS, TypeScript, Drizzle ORM)
                                            └────────┬────────┘
                                                     │
                             ┌───────────────────────┼───────────────────────┐
                             ▼                       ▼                       ▼
                    ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
                    │  PostgreSQL 16  │     │     Redis 7     │     │ Challenge GW    │
                    │ (ACID & Ledger) │     │ (ZSET Leaderbd) │     │ (Isolated Daemon│
                    └─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                                             │ Docker Socket
                                                                             ▼
                                                                    ┌─────────────────┐
                                                                    │ Ephemeral Team  │
                                                                    │   Containers    │
                                                                    └─────────────────┘
```

### Service Topology

| Component | Technology | Role & Boundary |
|---|---|---|
| **NGINX Ingress** | NGINX Alpine | Terminates HTTP/TLS, buffers static frontend assets, enforces connection burst limits, routes SSE with `X-Accel-Buffering: off`. |
| **Backend Core** | Fastify 4, Node.js 20, TypeScript | Core business logic, authentication, challenge evaluation, audit trails, and SSE event streaming. Has **no access to Docker socket**. |
| **Participant UI** | React 18, Vite, TailwindCSS | High-performance participant interface with category views, terminal-like themes, countdown timer, and instance launchers. |
| **Admin Portal** | React 18, Vite | Isolated operational cockpit for game masters: real-time scoreboard controls, audit inspection, team provisioning, challenge publishing. |
| **Database** | PostgreSQL 16 | ACID-compliant relational storage for teams, submissions, solved flags, immutable score ledgers, and audit logs. |
| **Cache & Realtime** | Redis 7 | High-performance O(log N) leaderboard indexing via Sorted Sets (`ZSET`), Pub/Sub message broadcast, and rate-limiting counters. |
| **Challenge Gateway** | Node.js 20, Dockerode | Standalone microservice with exclusive access to the Docker socket. Manages dynamic challenge containers on an isolated bridge network. |

### Security & Isolation Model

1. **Backend Isolation**: The backend container does **not** mount `/var/run/docker.sock`. All container orchestration is delegated to the `challenge_gateway` over an authenticated internal HTTP interface requiring a pre-shared 256-bit token (`CHALLENGE_GATEWAY_SECRET`).
2. **Challenge Network Boundary**: Dynamic containers run on an isolated bridge network (`techx_isolated_net`) with no access to PostgreSQL, Redis, backend, or admin services.
3. **Hard Resource Limits**: Every spawned sandbox container has strict cgroup constraints (default: 0.5 vCPU, 256MB RAM, 64 PIDs, read-only root where feasible).
4. **Lifecycle Reaper**: Background worker actively terminates expired instances (default lifespan: 20 minutes) and cleans up orphaned network interfaces.

---

## Interfaces

### Participant Web Experience

- **Challenge Grid**: Real-time challenge cards grouped by category (`Web`, `Crypto`, `Forensics`, `Network`, `Reverse Engineering`, `Cloud/Misc`) with point badges, solve counts, and difficulty levels.
- **Dynamic Sandbox Manager**: Interactive modal allowing participants to launch, view assigned ports, access target instances, and terminate environments.
- **Interactive Flag Submitter**: Instant feedback on submission with specific cooldown visual indicators when rate limits trigger.
- **Live Leaderboard**: Ranked scoreboard showing team standings, solve timestamps, first-blood stars, and real-time score updates.
- **Rules & Announcements**: Live broadcast banner for organizer bulletins without requiring browser refresh.

### Dedicated Admin Operations Portal

The Admin Operations Portal runs as a separate application accessible on port **8080** (or via `/admin` reverse proxy):

- **Event State Controls**: One-click toggles to transition competition state: `Draft` -> `Live` -> `Paused` -> `Ended`.
- **Timer Management**: Dynamically extend, pause, or reschedule the global countdown timer.
- **Score Freeze**: Freeze public scoreboard display while maintaining real-time background score computation for dramatic award ceremonies.
- **Team Provisioning**: Generate cryptographically secure team accounts, reset passwords, or ban abusive participants.
- **Challenge Visibility**: Hot-toggle visibility (`draft`, `published`, `archived`) of challenges or hints without downtime.
- **Audit Log Inspector**: Full immutable record of all administrative actions, flag submissions, and access events.

For complete administrative operations, see [Admin Portal Operations Guide](docs/admin_portal_guide.md).

---

## Challenge Engine & Scoring

### Dynamic Scoring Algorithm

The platform features a configurable dynamic decay scoring curve. Challenges start at initial points and scale down automatically as more teams solve them:

$$\text{Points} = \left\lfloor \text{MinPoints} + (\text{MaxPoints} - \text{MinPoints}) \times \left( \frac{\max(0, \text{Decay} - \text{Solves})}{\text{Decay}} \right)^2 \right\rfloor$$

- When 0 teams have solved: Challenge awards `MaxPoints` (e.g., 500).
- As solves approach `Decay` count (e.g., 30): Points gradually scale down toward `MinPoints` (e.g., 100).
- Solves beyond `Decay` award `MinPoints`.
- All previous solvers' points automatically recalculate dynamically to ensure equitable ranking.

### Checkpoint Progression

For multi-stage challenges, the platform supports sequential or branching checkpoints:
- Teams must solve Stage 1 to unlock Stage 2's narrative, assets, and flag submission box.
- Prevents skipping straight to end-game payloads and enables multi-layer forensics/web investigations.

### Dynamic Challenge Gateway

Dynamic challenges are packaged as lightweight Docker containers. When a participant clicks **"Launch Instance"**:
1. The backend verifies team eligibility, rate limits, and concurrent instance quota (default: 2 per team).
2. Backend calls Challenge Gateway (`POST /instances/spawn`).
3. Gateway allocates an ephemeral port from the pool (default: `30000-30100`), attaches container to `techx_isolated_net`, and applies cgroup limits.
4. Gateway returns container ID and external connection endpoint (`host:port`).
5. A background sweeper terminates containers after expiration or manual teardown.

---

## Directory Structure

```
├── admin-frontend/         # Dedicated Vite + React Admin Operations Portal (Port 8080)
├── archive/                # Historical engineering logs and internal milestone reports
│   └── internal-development/
├── backend/                # Fastify TypeScript API, Drizzle ORM, Real-Time SSE
│   ├── src/
│   │   ├── config/         # Zod-validated fail-fast environment schema
│   │   ├── db/             # Drizzle PostgreSQL schema & SQL migrations
│   │   ├── modules/        # Domain modules (auth, challenges, scoring, leaderboard, etc.)
│   │   ├── utils/          # Argon2id hashing, constant-time flags, Pino logger
│   │   └── server.ts       # Server lifecycle & graceful signal handlers
│   └── tests/              # Vitest unit and integration test suites
├── challenges/             # Challenge metadata, author notes, and static file sources
├── data/
│   └── challenges/static/  # Downloadable challenge attachments (PCAPs, binaries, ciphers)
├── docker/                 # Service Dockerfiles and NGINX configurations
│   ├── backend/
│   ├── gateway/            # Challenge Gateway daemon Dockerfile
│   ├── nginx/              # Production and LAN NGINX configurations
│   └── challenges/         # Dockerfiles for dynamic sandbox challenges
├── docs/                   # Public architectural, admin, and challenge documentation
│   ├── admin_portal_guide.md
│   ├── challenges_matrix.md
│   └── STAGE11_DEPLOYMENT.md
├── frontend/               # Participant-facing Vite + React SPA (Port 80)
├── scripts/                # Reusable utilities (secret generator, backups, restore, smoke tests)
├── .env.example            # Canonical environment template with configuration guidelines
├── docker-compose.yml      # Base multi-container service definitions
├── docker-compose.lan.yml  # College LAN mode overlay (binds host port 80, offline)
├── docker-compose.prod.yml # Cloud VPS production overlay (hardened, SSL ready)
├── CONTRIBUTING.md         # Guidelines for open-source contributors
├── SECURITY.md             # Security disclosures, isolation architecture, and vulnerability reporting
└── CHANGELOG.md            # Version release notes and architectural history
```

---

## Getting Started

### Prerequisites

- **Docker Desktop** (Windows / macOS) or **Docker Engine 24+ with Compose v2.20+** (Linux).
- **Node.js 20 LTS** and **npm 10+** (only required if building/testing locally outside Docker).
- **Git**.

### 1. Clone & Configure Secrets

```bash
# 1. Clone the repository
git clone https://github.com/balax-24/TechX-26---CTF_Event.git
cd TechX-26---CTF_Event

# 2. Generate cryptographically strong random secrets
# On Linux / macOS / Git Bash:
chmod +x ./scripts/generate_secrets.sh
./scripts/generate_secrets.sh

# Or on Windows PowerShell:
.\scripts\generate_secrets.ps1
```

This automatically generates high-entropy 256-bit keys for `JWT_SECRET`, `COOKIE_SECRET`, `CHALLENGE_GATEWAY_SECRET`, `FLAG_SALT`, `DB_PASSWORD`, and `REDIS_PASSWORD`, populating a local `.env` file from `.env.example`.

### 2. Deploy Container Stack

#### Option A: Local / College LAN Mode (Default)
Binds directly to port 80 of your local machine or LAN Ethernet interface:
```bash
docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build
```

#### Option B: Cloud VPS / Production Server
Hardened configuration for cloud servers:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### 3. Apply Database Migrations

Apply the versioned Drizzle schema migrations to initialize tables, indexes, and constraints:
```bash
docker compose exec -T backend npm run db:migrate
```

### 4. Seed Challenge Catalog

Populate the database with the official challenge catalog (categories, challenge descriptions, hints, points, and attachments):
```bash
docker compose exec -T backend npx tsx src/scripts/seed_staging_event.ts
```
> **Note**: This seeds only challenge specifications and competition settings. It does **not** create dummy participants, fake scores, or modify production records.

### 5. Provision Superadmin Account

Create the initial administrator account using operator-supplied credentials:
```bash
docker compose exec -T \
  -e ADMIN_USERNAME="admin" \
  -e ADMIN_EMAIL="admin@yourdomain.org" \
  -e ADMIN_PASSWORD="YourSuperSecureAdminPassword123!" \
  backend npm run bootstrap:admin
```

You can now log in:
- **Participant Interface**: `http://localhost/` (or your LAN IP)
- **Admin Operations Portal**: `http://localhost:8080/` (or via Admin Login on port 80)

---

## Deployment Topologies

### College LAN / Air-Gapped Mode

Ideal for university hackathons, offline competitions, or student chapter events where internet connectivity is unreliable or restricted:

1. Connect the host server to the campus gigabit switch via Ethernet.
2. Determine your physical LAN IPv4 address (e.g., `192.168.1.50`).
3. Set your LAN IP in `.env`:
   ```ini
   PUBLIC_HOST=192.168.1.50
   PUBLIC_PORT=80
   PUBLIC_PROTOCOL=http
   DEPLOYMENT_MODE=lan
   ```
4. Start the stack: `docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d`
5. Participants connect directly to `http://192.168.1.50/` over local Wi-Fi or Ethernet cables.

### Cloud Production (VPS / HTTPS)

For public tournaments hosted on AWS, DigitalOcean, Hetzner, or bare-metal servers:

1. Provision an Ubuntu 22.04/24.04 LTS server.
2. Place Let's Encrypt or corporate SSL certificates in `docker/nginx/ssl/`:
   - `fullchain.pem`
   - `privkey.pem`
3. Configure `.env`:
   ```ini
   PUBLIC_HOST=ctf.yourdomain.org
   PUBLIC_PORT=443
   PUBLIC_PROTOCOL=https
   DEPLOYMENT_MODE=production
   ```
4. Start production stack: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`

### Remote Access via Secure Quick Tunnel

If hosting from an internal workstation but requiring temporary public internet access for remote participants, the included `START_PUBLIC.bat` (Windows) utility initializes an authenticated Cloudflare Quick Tunnel routing strictly to NGINX port 80.
- PostgreSQL, Redis, Backend API, Gateway, and Docker socket remain strictly unexposed to the internet.

---

## Developer Workflow & Testing

### Running Unit & Integration Tests

The platform includes comprehensive test suites covering authentication, rate-limiting, timing attacks, score ledgers, dynamic challenge quotas, and real-time SSE outbox workers.

```bash
cd backend

# Run all unit tests
npm test -- tests/unit/

# Run complete test suite with coverage
npm test
```

### Building Frontends

To verify compilation and TypeScript types across all frontend projects:

```bash
# Build participant frontend
npm run build:frontend

# Build admin portal
npm run build:admin

# Build all services simultaneously
npm run build
```

---

## Adding & Authoring Challenges

All challenge specifications are defined in `backend/src/scripts/seed_staging_event.ts` or can be provisioned through the Admin Operations Portal.

### Static Challenges

For forensics, crypto, or reverse engineering challenges with downloadable files:
1. Place downloadable artifacts in `data/challenges/static/<category>/<filename>`.
2. Reference the attachment in your challenge definition with its SHA-256 integrity hash.
3. Static files are served via NGINX with strict MIME types and read-only container mounts.

### Dynamic Sandboxed Containers

To create an interactive vulnerable target (e.g., vulnerable web service or pwn binary):
1. Create a subdirectory under `docker/challenges/<challenge_name>/`.
2. Provide a standard `Dockerfile` exposing an unprivileged port (e.g., port 80 or 8080).
3. Register the challenge slug and image tag in `backend/src/modules/dynamic_challenges/dynamic_challenges.registry.ts`.
4. The Challenge Gateway automatically builds/pulls the image, enforces cgroup limits, and binds ephemeral host ports upon request.

---

## Backup, Disaster Recovery & Reset

### Taking a Database Snapshot

A verified database backup can be taken at any time without stopping the event:

```bash
# On Linux / macOS:
./scripts/backup_db.sh ./backups/event_snapshot

# On Windows:
BACKUP_DATABASE.bat
```

### Restoring from Backup

```bash
# Stop backend traffic to prevent write contention
docker compose stop backend

# Restore database from compressed archive
./scripts/restore_db.sh ./backups/techx_ctf_backup_<timestamp>.sql.gz --force

# Restart backend
docker compose start backend
```

### Fresh Database Reset (Development Only)

To clean tournament history on a development or staging machine without deleting Docker volumes:
```bash
# Safety abort will refuse execution if NODE_ENV=production
docker compose exec -e ALLOW_STAGING_SEED=true backend npx tsx src/scripts/seed_staging_event.ts
```

---

## Security Architecture & Controls

| Vector | Platform Mitigation |
|---|---|
| **Flag Brute-Forcing** | Multi-tier sliding window rate limits (default: 5 attempts per 30 seconds per team + global IP limits). |
| **Timing Attacks** | All flag comparisons use Node's `crypto.timingSafeEqual` over pre-computed cryptographic hashes. |
| **Credential Safety** | Argon2id password hashing with custom salt, memory cost (64MB), and time cost (3 iterations). |
| **Database Injection** | 100% parameterization via Drizzle ORM; zero raw string SQL interpolation. |
| **Container Escapes** | Unprivileged container users, isolated bridge network, dropped Linux capabilities, and no Docker socket in the backend. |
| **Audit Trails** | All sensitive actions (admin logins, score freezes, manual overrides, challenge modifications) written to immutable `audit_logs` table. |

For security policies, threat model, and vulnerability reporting procedures, see [SECURITY.md](SECURITY.md).

---

## License & Open Source Status

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

Copyright (c) 2026 TechX Madras.

For guidelines on how to contribute improvements, report bugs, or submit new challenge archetypes, please consult [CONTRIBUTING.md](CONTRIBUTING.md).
