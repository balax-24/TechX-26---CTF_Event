# Contributing to TechX CTF Platform

Thank you for your interest in contributing to the TechX CTF platform! This project is an enterprise-grade, high-concurrency Capture The Flag competition platform designed for academic, corporate, and competitive cybersecurity tournaments.

We welcome contributions ranging from bug fixes, security hardening, documentation enhancements, performance optimizations, and new challenge modules.

---

## Code of Conduct & Principles

1. **Security First**: This platform hosts intentionally vulnerable applications. Dynamic challenge sandboxes must maintain strict isolation boundaries so vulnerabilities never escape into core services.
2. **Zero Plaintext Secrets**: Never commit real database passwords, JWT secrets, participant credentials, or production certificates.
3. **Deterministic & Concurrency-Safe**: All scoring logic must use atomic PostgreSQL transactions, immutable ledger events, and monotonic sequence numbers.

---

## Development Environment Setup

### Prerequisites
- **Node.js**: v20.x or higher LTS
- **Docker Engine & Docker Compose**: Compose v2.20+
- **PostgreSQL**: v16 (or via Docker)
- **Redis**: v7 (or via Docker)

### Local Setup Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/balax-24/TechX-26---CTF_Event.git
   cd TechX-26---CTF_Event
   ```

2. **Configure your local development environment:**
   ```bash
   cp .env.example .env
   # In Windows PowerShell:
   # Copy-Item .env.example .env
   ```

3. **Install dependencies across components:**
   ```bash
   # Core Backend
   cd backend && npm install
   
   # Participant Web Interface
   cd ../frontend && npm install

   # Administrative Operations Portal
   cd ../admin-frontend && npm install
   
   cd ..
   ```

4. **Start the local database and redis containers:**
   ```bash
   docker compose up -d postgres redis
   ```

5. **Apply database schema and migrations:**
   ```bash
   cd backend
   npm run db:migrate:dev
   ```

6. **Seed default challenge catalog:**
   ```bash
   npx tsx src/scripts/seed_staging_event.ts
   ```

---

## Running Applications Locally

### Development Servers
- **Backend API (Port 4000):**
  ```bash
  cd backend && npm run dev
  ```
- **Participant Frontend (Port 5173 / 5174):**
  ```bash
  cd frontend && npm run dev
  ```
- **Admin Control Portal (Port 5175):**
  ```bash
  cd admin-frontend && npm run dev
  ```

### Full Containerized Stack
- **Local LAN / Standalone Mode:**
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build
  ```

---

## Running Tests

All pull requests must pass the automated test suites before being merged:

```bash
# Run complete unit test suite (379 tests)
cd backend && npm test -- tests/unit/

# Run specific test file
cd backend && npm test -- tests/unit/scoring.test.ts

# Run frontend tests
cd ../frontend && npm test
```

---

## Contributing New Challenges

We welcome novel challenges across **Web Exploitation**, **Cryptography**, **Reverse Engineering**, **Forensics**, and **Network Security**.

### Challenge Requirements:
1. **Container Isolation (for dynamic challenges):**
   - Dynamic targets must have their Dockerfiles placed in `docker/challenges/<slug>/`.
   - Must drop all Linux capabilities (`cap_drop: ALL`).
   - Must run with a read-only root filesystem (`read_only: true`).
   - Must be assigned non-root user IDs (`user: "1000:1000"`).
   - Must enforce memory limits (max 128MB–256MB) and PID limits (max 64).
   - Must connect **strictly** to `ctf_challenges_net` and never to `ctf_core_net`.

2. **Sanitized Challenge Assets:**
   - Static downloadable files (pcaps, binaries, logs) go in `data/challenges/static/`.
   - Never commit private solution guides or answer keys to public paths. Solution documentation must be submitted through private review channels or organizer vaults.

---

## Pull Request Guidelines

1. **Branch Naming**:
   - `feat/feature-name`
   - `fix/bug-fix-description`
   - `security/vulnerability-fix`
   - `docs/documentation-update`

2. **Commit Messages**:
   Follow conventional commits:
   - `feat(scoring): add dynamic first-blood bonus multiplier`
   - `fix(auth): prevent session timeout race condition during reconnect`
   - `sec(gateway): enforce strictly bounded container lifetime`

3. **Verification Checklist**:
   - [ ] All TypeScript builds pass (`npm run build`).
   - [ ] Unit tests pass with 0 failures (`npm test`).
   - [ ] No `.env`, secrets, or private flags are committed.
   - [ ] Documentation updated to reflect changes.
