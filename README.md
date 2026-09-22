# TechX CTF 2026 — Official Platform Infrastructure

> **IEEE TechX Madras 2026** — Production-grade Capture The Flag (CTF) competition engine designed for 200–400+ concurrent participants across both **offline College LAN environments** and **cloud production servers**.

---

## 🚀 Quick Start

### Prerequisites
- Docker Engine 24+ & Docker Compose v2.20+
- Node.js v20+ LTS (for local backend development outside Docker)

---

### Option A: College LAN / Laptop Mode (Offline)
Run the entire platform on a single machine connected to the campus Ethernet switch without requiring public internet access:

```bash
# 1. Clone or navigate to the repository
cd TechX-CTF

# 2. Configure environment (set PUBLIC_HOST to your laptop's Ethernet LAN IP)
cp .env.example .env

# 3. Start the entire platform in LAN mode
docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d

# 4. Verify system health
curl http://localhost/api/v1/health
```

Participants can now access the CTF at `http://<YOUR_LAN_IP>` (e.g. `http://192.168.1.50`).

---

### Option B: Production Server Mode (Cloud VPS)
Deploy to a cloud VM or dedicated institutional server:

```bash
# 1. Configure environment (set PUBLIC_HOST to your domain and supply SSL certs)
cp .env.example .env

# 2. Start the platform in Production mode
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## 🛠️ Architecture & Technology Stack
- **Ingress & Proxy**: NGINX Alpine with HTTP keep-alive, static caching, and SSE stream buffering disabled
- **Core API & Real-Time Engine**: Fastify (Node.js 20 LTS + TypeScript)
- **Primary Database**: PostgreSQL 16 with ACID transactions and immutable score ledgers
- **Cache & Real-Time Pub/Sub**: Redis 7 with Sorted Sets (`ZSET`) for O(log N) leaderboard indexing
- **ORM & Data Layer**: Drizzle ORM with connection pooling
- **Security**: Argon2id password hashing, constant-time flag comparisons, sliding-window rate limiting, and network-isolated challenge containers

---

## 📂 Repository Structure

```
TechX-CTF/
├── docker/                 # NGINX and Backend Dockerfiles and configurations
├── docker-compose.yml      # Core multi-container service definitions
├── docker-compose.lan.yml  # College LAN mode overlay (binds port 80, offline)
├── docker-compose.prod.yml # Production server mode overlay (TLS, hardened)
├── backend/                # Fastify TypeScript API, Drizzle ORM, Real-Time SSE
│   ├── src/
│   │   ├── config/         # Zod-validated environment config
│   │   ├── db/             # Drizzle PostgreSQL schema and migrations
│   │   ├── cache/          # Redis connection and health probes
│   │   ├── utils/          # Pino logger with redaction, crypto utilities
│   │   ├── app.ts          # Fastify factory with security plugins
│   │   └── server.ts       # Server bootstrap with graceful shutdown
│   └── tests/              # Unit and integration test suites
├── challenges/             # CTF challenges (Beginner, Intermediate, Expert)
├── docs/                   # IEEE documentation and operational runbooks
└── scripts/                # Database backup, restore, and diagnostics
```

---

## 🧪 Testing & Verification

```bash
cd backend
npm test
```
