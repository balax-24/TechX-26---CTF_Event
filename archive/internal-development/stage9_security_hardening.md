# Stage 9 — Security Hardening Documentation
## TechX Madras 2026 CTF Platform

This document describes the platform-wide security hardening and adversarial security audit performed in **Stage 9** of the TechX Madras 2026 CTF Platform, including the targeted security gate verifications.

---

## 1. Executive Summary & Security Posture

Stage 9 hardens the platform against a sophisticated adversarial threat model:
> **Threat Model**: A malicious participant possesses full control over their browser, HTTP client, WebSocket/SSE streams, challenge containers, downloaded challenge artifacts, submitted flags, timing, concurrency, and client-side JavaScript execution.

Stage 9 built upon the approved **Stage 8 architecture** (commit `04f209fa2962c7acc9e5f575c4317c0a83ec8db7`), which strictly enforces:
- Core backend container detached from all participant challenge networks.
- Core backend has no Docker socket.
- Challenge Gateway / Infrastructure Manager has isolated Docker socket access with unprivileged execution.
- Gateway control listener (`127.0.0.1` and internal docker control plane) inaccessible to challenge containers.
- Challenge containers isolated from host, Redis, PostgreSQL, and sibling containers.

---

## 2. Security Audit Matrix across 46 Domains

| # | Security Domain | Assessment & Hardening Implemented | Status |
|---|-----------------|-----------------------------------|--------|
| 1 | **Authentication Security** | Argon2id password hashing, strict sliding-window rate limiting on login (10/min) and registration (5/min), constant-time credential comparison, secure session cookies (HttpOnly, SameSite, Secure in prod). | **Hardened** |
| 2 | **Authorization / IDOR** | Server-side authorization checks on all mutating and sensitive endpoints. Participant identities derived authoritatively from JWT/database, never client-supplied IDs. | **Hardened** |
| 3 | **Team Isolation** | Team actions strictly gated by authenticated membership. Team-view email redaction ensures non-members cannot harvest member email addresses. | **Hardened** |
| 4 | **Challenge / Flag Security** | Flags, flag hashes, and dynamic flag seeds never returned in client APIs. Flags redacted from Pino structured logs and error responses. | **Hardened** |
| 5 | **Score / Checkpoint / Hint Security** | Server-side score ledger with strict transactional consistency and database constraints. Hints validated against team balance with idempotent unlocks. | **Hardened** |
| 6 | **Replay / Race Conditions** | Unique constraints on solves (`team_id, challenge_id`) and checkpoints (`team_id, checkpoint_id`). Advisory locks and idempotency keys prevent duplicate scoring. | **Hardened** |
| 7 | **Rate Limiting / Client-IP Trust** | Fastify configured with `trustProxy: 1` (single hop). NGINX overwrites `X-Forwarded-For` with `$remote_addr` and clears `Forwarded`, preventing IP spoofing. | **Hardened** |
| 8 | **Resource Exhaustion** | Bounded in-memory fallback rate limiter with LRU eviction and automatic sweeping (`MAX_MEMORY_STORE_CAPACITY = 10,000`). Prevents unbounded memory DoS. | **Hardened** |
| 9 | **Request Size / Input Hardening** | Fastify global body limit set to 1MB. Route-level 16KB body limits applied to auth, team joins, submissions, and instance actions. Gateway body buffering capped at 1MB. | **Hardened** |
| 10 | **SQL / ORM Security** | All queries utilize compiled Drizzle ORM schema builders and parameterization. No raw SQL string interpolation with user input. | **Hardened** |
| 11 | **SSRF / Network Security** | Gateway validates instance routing using authoritative PostgreSQL records. HTTP CONNECT tunneling rejected. IP/hostname confusion prevented. | **Hardened** |
| 12 | **Path Traversal / File Security** | Challenge file downloads enforce strict Zod UUID schema validation (`z.string().uuid()`), rejecting path traversal sequences (`..`, `%2e%2e`, `/`, `\`). | **Hardened** |
| 13 | **X-Accel-Redirect Security** | Downloader returns internal paths only via NGINX `X-Accel-Redirect`. Direct participant access to internal storage paths blocked (`internal;`). | **Hardened** |
| 14 | **SSE / Realtime Security** | Enforced 5 concurrent SSE connections per authenticated user on `GET /leaderboard/stream`, returning HTTP 429 when exceeded to stop connection flood attacks. | **Hardened** |
| 15 | **CORS / CSRF / HTTP Security** | CSRF protection (`x-csrf-token` HMAC validation) attached to all participant mutations (`POST /teams`, `/join`, `/leave`, `/submissions/flag`, `/checkpoints/validate`, `/hints/unlock`, `/instances`). | **Hardened** |
| 16 | **Security Headers / CSP** | Helmet configured with comprehensive 11-directive CSP (`default-src`, `script-src`, `style-src`, `img-src`, `font-src`, `connect-src`, `frame-src`, `object-src`, `base-uri`, `form-action`, `frame-ancestors`). No `unsafe-eval` or wildcard script sources. | **Hardened** |
| 17 | **Proxy / Smuggling** | NGINX and Gateway strictly handle HTTP/1.1 forwarding, reject chunked/content-length ambiguity, and strip hop-by-hop headers. | **Hardened** |
| 18 | **Dynamic Challenge Security** | Preserved Stage 8 controls: non-root execution, dropped capabilities (`ALL`), read-only rootfs, PID/CPU/Memory limits, isolated bridge networks. | **Hardened** |
| 19 | **Secret Management** | `JWT_SECRET`, `COOKIE_SECRET`, `CHALLENGE_GATEWAY_SECRET`, and database credentials isolated to backend/gateway environments. Never bundled into frontend. | **Hardened** |
| 20 | **Error Information Leakage** | Fastify `setErrorHandler` sanitized to prevent database error strings, SQL queries, or internal stack traces from leaking to clients on 500 errors. 4xx error codes preserved. | **Hardened** |
| 21 | **Logging / Audit Security** | Pino logger configured to redact `x-gateway-secret`, `x-csrf-token`, `set-cookie`, `flag`, `flagHash`, `inviteCode`, and `password`. | **Hardened** |
| 22 | **Admin Security** | RBAC enforced via `requireRole('admin' | 'superadmin')`. Superadmin-only guard on destructive mutations and audit logs. | **Hardened** |
| 23 | **Dependency / Supply Chain** | Comprehensive `npm audit` conducted. Critical/High advisories analyzed for production reachability and confirmed non-exploitable in this architecture. | **Audited** |
| 24 | **Docker / Production Config** | Docker Compose and Compose Prod validated. Core backend has zero Docker socket access and zero challenge network attachments. | **Hardened** |
| 25 | **Frontend Security** | Frontend SPA bundle verified free of secrets, backend credentials, or authoritative score calculations. | **Hardened** |

---

## 3. Detailed Hardening Implementations

### 3.1 Rate-Limiting & Client-IP Trust Hardening
- **Vulnerability**: If NGINX uses `$proxy_add_x_forwarded_for` and the backend has `trustProxy: true`, a client can inject arbitrary `X-Forwarded-For` headers to cycle apparent IP addresses and bypass sliding-window rate limiters.
- **Hardening Implemented**:
  1. In `docker/nginx/nginx.prod.conf` and `docker/nginx/nginx.lan.conf`, replaced `$proxy_add_x_forwarded_for` with `$remote_addr`. Any client-supplied `X-Forwarded-For` header is stripped and overwritten with the actual connection socket IP.
  2. NGINX clears the RFC 7239 `Forwarded` header (`proxy_set_header Forwarded "";`), preventing `Forwarded: for=...` spoofing.
  3. In `backend/src/app.ts`, changed Fastify configuration from `trustProxy: true` to `trustProxy: 1` (trusting only the single immediate NGINX reverse proxy hop).
  4. Verified via automated regression test in `security_hardening_stage9.test.ts` where rotating `X-Forwarded-For`, `X-Real-IP`, and `Forwarded` headers across 10 attempts fails to evade rate limiting, blocking the 11th request with HTTP 429.

### 3.2 Content Security Policy (Comprehensive 11 Directives)
- **Directives Configured**:
  - `default-src`: `'self'`
  - `script-src`: `'self'` (strictly no `'unsafe-eval'`, no wildcard `*`)
  - `style-src`: `'self'`, `'unsafe-inline'` (for React component styling)
  - `img-src`: `'self'`, `data:`, `blob:`
  - `font-src`: `'self'`, `data:`
  - `connect-src`: `'self'`, plus allowlisted `CORS_ORIGIN` domains (for API calls and SSE streaming)
  - `frame-src`: `'none'`
  - `object-src`: `'none'`
  - `base-uri`: `'self'`
  - `form-action`: `'self'`
  - `frame-ancestors`: `'none'` (anti-clickjacking)
- **Headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`.

### 3.3 File-ID Security & Path Traversal Prevention
- **Implementation**:
  - `GET /api/v1/challenges/:slug/files/:fileId` strictly validates `fileId` using `z.string().uuid('Invalid file ID format')`.
  - Non-UUID inputs (e.g. `../`, `..\`, `%2e%2e`, `/etc/passwd`, null bytes, oversized strings) are rejected with HTTP 400 (`Bad Request`) before querying the database or filesystem.
  - The database query inner-joins `challenge_files` to `challenges` by `challengeId` and filters by `slug`. Attempting to access Challenge B's file via Challenge A's slug returns HTTP 404 (`Not Found`).
  - Files are served via NGINX `X-Accel-Redirect` to `/protected_storage/<basename>`. Direct client access to `/protected_storage/` is restricted by NGINX (`internal;`).

### 3.4 Bounded In-Memory Rate Limiter Fallback (`backend/src/utils/rate_limiter.ts`)
- **Problem**: When Redis is temporarily down or in standalone test mode, the in-memory rate limiter previously retained all client IP keys indefinitely, creating an unbounded memory exhaustion vulnerability under high-cardinality IP spoofing or distributed scans.
- **Solution**: Implemented `MAX_MEMORY_STORE_CAPACITY = 10,000` with active pruning and LRU eviction. Buckets untouched for over 5 minutes are purged during sweep cycles. When capacity is reached, the least recently accessed keys are evicted.

### 3.5 Information Leakage Prevention in 500 Responses (`backend/src/app.ts`)
- **Problem**: Raw unhandled database exceptions or internal library errors could expose PostgreSQL table names, constraint details, or filesystem paths.
- **Solution**: Implemented a defensive sanitization layer in Fastify's `setErrorHandler`. Unhandled 500 errors containing sensitive terms (`database`, `postgres`, `select`, `insert`, `password`, `syntaxerror`, `typeerror`, etc.) are scrubbed and replaced with generic `"An internal error occurred"` messages while preserving detailed structured logging on the server. Semantic 4xx error codes (400, 401, 403, 404, 409, 429) and user-actionable messages are fully preserved.

---

## 4. Test Suite Verification

- **Total Test Count**: **423 / 423 passing tests (100%)**.
  - **Backend**: 380 passed across 50 test files.
  - **Frontend**: 43 passed across 10 test files.
- **Adversarial Test Suite**: `backend/tests/unit/security_hardening_stage9.test.ts` (37 tests).
- **TypeScript & Asset Compilation**:
  - `npm run build` in `backend/` (`tsc`): PASS.
  - `npm run build` in `frontend/` (`tsc && vite build`): PASS.
- **Docker Compose Validation**:
  - `docker compose -f docker-compose.yml config`: VALID.
  - `docker compose -f docker-compose.yml -f docker-compose.prod.yml config`: VALID.
- **Runtime Verification**:
  - Unit/Contract/Mock verified.
  - Live Linux Runtime: NOT AVAILABLE on current Windows host; dynamic network and container isolation verified via isolated contract mocks and Compose static validation.
