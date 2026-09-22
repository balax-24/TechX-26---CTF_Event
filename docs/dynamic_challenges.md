# TechX CTF 2026 — Dynamic Challenge Operations & API Guide

---

## 1. Overview

The TechX CTF 2026 platform provides on-demand, isolated dynamic challenge container environments. Rather than sharing a monolithic target or downloading static binary archives, participants trigger isolated instances for hands-on exploitation (e.g. SQL injection sandboxes, binary exploit targets, command injection services).

Each team receives an isolated runtime with dedicated process, memory, network, and storage boundaries.

---

## 2. Dynamic Challenge API Reference

All dynamic challenge endpoints require session authentication via HttpOnly cookie or `Authorization: Bearer <jwt>` and an active team membership.

### 2.1 Start Challenge Instance
**`POST /api/v1/challenges/:slug/instance`**

Idempotently spins up an isolated dynamic challenge container or returns the current active instance.

- **Headers**: `Content-Type: application/json`
- **Rate Limit**: 5 requests per minute per team.
- **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "instance": {
      "id": "8f3b2029-7984-486a-8b83-a7199c0bca82",
      "challengeId": "c1111111-1111-4111-8111-111111111111",
      "challengeSlug": "intro-sqli-sandbox",
      "status": "RUNNING",
      "connectionUrl": "/api/v1/challenges/intro-sqli-sandbox/instance/proxy/",
      "createdAt": "2026-09-22T12:00:00.000Z",
      "expiresAt": "2026-09-22T12:30:00.000Z",
      "remainingTtlSeconds": 1799
    }
  }
  ```
- **Error Codes**:
  - `401 Unauthorized`: Not logged in.
  - `403 Forbidden`: `TEAM_REQUIRED`, `TEAM_DISQUALIFIED`, `TEAM_DISABLED`, `COMPETITION_PAUSED`, `COMPETITION_ENDED`, `ADMIN_PARTICIPATION_FORBIDDEN`.
  - `404 Not Found`: `CHALLENGE_NOT_FOUND`, `CHALLENGE_NOT_RELEASED`.
  - `400 Bad Request`: `CHALLENGE_NOT_DYNAMIC`.
  - `429 Too Many Requests`: `TEAM_INSTANCE_LIMIT_EXCEEDED` (max 2 active instances per team).
  - `503 Service Unavailable`: `CHALLENGE_CAPACITY_EXCEEDED` (global platform container limit reached).

### 2.2 Get Instance Status
**`GET /api/v1/challenges/:slug/instance`**

Returns current status and remaining TTL for the caller's team instance.

- **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "instance": {
      "id": "8f3b2029-7984-486a-8b83-a7199c0bca82",
      "challengeSlug": "intro-sqli-sandbox",
      "status": "RUNNING",
      "connectionUrl": "/api/v1/challenges/intro-sqli-sandbox/instance/proxy/",
      "remainingTtlSeconds": 1420
    }
  }
  ```
  If no active instance exists or instance expired, returns `{ "success": true, "instance": null }`.

### 2.3 Stop Instance
**`DELETE /api/v1/challenges/:slug/instance`**

Terminates and destroys the running container and associated network resources.

- **Success Response (HTTP 200)**:
  ```json
  {
    "success": true,
    "message": "Instance stopped successfully"
  }
  ```

### 2.4 Reset Instance
**`POST /api/v1/challenges/:slug/instance/reset`**

Performs an atomic reset: stops and purges the old container, clears any ephemeral filesystem modifications, and spins up a fresh container with renewed TTL.

- **Rate Limit**: 3 requests per minute per team.
- **Success Response (HTTP 200)**: Fresh `InstanceSummary` object.

### 2.5 Inbound Reverse Proxy Gateway
**`ALL /api/v1/challenges/:slug/instance/proxy/*`**

Routes participant HTTP requests directly to their isolated challenge container.

- **Security Properties**:
  - Validates authentication and active team membership on every single HTTP request.
  - Upstream IP and port are resolved **strictly** from the database record for the requesting team's active instance.
  - Zero arbitrary target parameters (`target=`, `url=`, `host=`) are accepted (Immune to SSRF).
  - Hop-by-hop headers are stripped.

---

## 3. Operations & Maintenance

### 3.1 TTL Background Cleanup Worker
- Runs every 15 seconds.
- Queries `challenge_instances` where `expires_at <= NOW()` and status is `RUNNING` or `CREATING`.
- Transitions state to `STOPPING`, destroys the container, and updates status to `EXPIRED`.
- Records audit log `challenge_instance_expired`.

### 3.2 Orphan Reaper & Crash Reconciliation
- The worker cross-references Docker containers possessing `techx.managed=true` with active database records:
  - **Orphan Container Detected**: Docker container exists, but no corresponding active record exists in DB $\to$ Container is immediately stopped and purged.
  - **Crashed Container Detected**: DB record is marked `RUNNING`, but Docker inspect returns exited or null $\to$ DB record transitions to `FAILED` with `failureReason: 'CONTAINER_TERMINATED_EXTERNALLY'`.

### 3.3 Server Startup Recovery
On backend startup, `instanceCleanupWorker.reconcile()` runs immediately to clean up stale or abandoned containers from previous ungraceful server terminations or crashes.
