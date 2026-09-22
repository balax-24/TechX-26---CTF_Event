# TechX CTF 2026 — Stage 8 Architecture Specification
## Dynamic Challenge Infrastructure, Container Isolation & Lifecycle Management

---

## 1. Executive Summary & Objective

Stage 8 introduces **Dynamic Challenge Infrastructure** to the TechX Madras 2026 CTF platform. In traditional static CTFs, all participants connect to a shared challenge instance or download static binaries. In contrast, modern cybersecurity competitions require **per-team isolated dynamic challenge environments** (such as intentionally vulnerable web services, pwn binaries, or service exploits) where:
1. Each team receives an independent, ephemeral containerized runtime.
2. Exploitation, denial-of-service, file corruption, or database drops by Team A cannot impact Team B.
3. Every dynamic challenge container is treated as an **untrusted, hostile workload boundary**.
4. The host server, backend core infrastructure (PostgreSQL, Redis, Fastify), Docker daemon, and neighboring containers are completely inaccessible to challenge workloads.

---

## 2. Threat Model & Trust Boundaries

### 2.1 Threat Assumptions
Dynamic challenges host intentionally vulnerable code. Once a participant exploits a challenge, they may obtain an interactive root or unprivileged shell inside the container. We assume an attacker will attempt:
- **Host Escape**: Exploiting container breakout flaws, mounting host storage, interacting with `/var/run/docker.sock`, or abusing Linux kernel capabilities.
- **Resource Denial of Service (DoS)**: Fork bombs, crypto-mining, unbounded memory consumption, disk exhaustion, or CPU monopolization.
- **Lateral Movement & Network Pivoting**: Scanning the local Docker subnet, accessing internal services (PostgreSQL on port 5432, Redis on port 6379, Fastify on port 4000), or attacking another team's challenge container.
- **SSRF & Proxy Abuse**: Manipulating reverse proxy endpoints to route requests to arbitrary internal IP addresses or host loopback interfaces.
- **Secret Extraction**: Inspecting environment variables to steal CTF platform secrets (JWT signing keys, database passwords, session cookie secrets).

### 2.2 Trust Hierarchy
```text
+-----------------------------------------------------------------------+
| ZONE 0: High Trust Core                                               |
| - PostgreSQL 16 (Relational State, Ledger, Invariants)                |
| - Redis 7 (Cache, Pub/Sub, Outbox Distribution)                       |
| - Fastify Core API (Authentication, RBAC, Scoring, Business Logic)   |
| - Docker Socket Access (Restricted exclusively to Backend Core)       |
+-----------------------------------------------------------------------+
                                  |
                                  v
+-----------------------------------------------------------------------+
| ZONE 1: Perimeter / Ingress                                           |
| - NGINX Reverse Proxy (TLS termination, rate limiting, static assets) |
| - Authorized Reverse Proxy Gateway (/challenges/:id/instance/proxy/*) |
+-----------------------------------------------------------------------+
                                  |
               [STRICT NETWORK & AUTHORIZATION BARRIER]
                                  |
                                  v
+-----------------------------------------------------------------------+
| ZONE 2: Untrusted Dynamic Challenge Containers                        |
| - Per-team isolated ephemeral Docker containers                       |
| - Dropped capabilities, no-new-privileges, unprivileged user          |
| - Read-only root filesystem, finite tmpfs, finite memory/CPU/PIDs     |
| - Isolated bridge network (No access to Zone 0 or other Zone 2 containers)
+-----------------------------------------------------------------------+
```

---

## 3. Container Security Baseline

Every container spawned for a dynamic challenge enforces the following non-negotiable security flags:

| Security Control | Parameter | Purpose / Defense |
| :--- | :--- | :--- |
| **No Privilege Escalation** | `SecurityOpt: ["no-new-privileges:true"]` | Prevents setuid/setgid binaries from escalating privileges within the container. |
| **Drop Linux Capabilities** | `CapDrop: ["ALL"]` | Removes all root capabilities (e.g. `CAP_SYS_ADMIN`, `CAP_NET_RAW`, `CAP_DAC_OVERRIDE`). Only allowlisted capabilities can be granted per challenge definition. |
| **Privileged Mode Disabled**| `Privileged: false` | Container has zero direct device access and cannot interact with host hardware or kernel structures. |
| **Host Namespace Isolation**| `NetworkMode != "host"`<br>`PidMode != "host"`<br>`IpcMode != "host"` | Challenges are strictly isolated into private Linux network, PID, and IPC namespaces. |
| **Docker Socket Exclusion** | `/var/run/docker.sock` NOT mounted | Participants can never invoke Docker daemon commands. |
| **Read-Only Filesystem**   | `ReadonlyRootfs: true` | Prevents persistence, rootkit installation, or modification of challenge binaries. |
| **Ephemeral Writable Storage**| `Tmpfs: { "/tmp": "rw,noexec,nosuid,size=32m" }` | Controlled, bounded in-memory storage for necessary temporary files with `noexec` and `nosuid`. |
| **Seccomp Filtering**       | Default / Hardened Seccomp profile | Blocks dangerous system calls (`clone` with new user namespaces, `bpf`, `sys_chroot`, etc.). |
| **Process Limits (PID)**    | `PidsLimit: 64` (default) | Prevents `fork bombs` from exhausting host PID tables. |
| **Memory Limits**           | `Memory: 256MB - 512MB`<br>`MemorySwap: 256MB - 512MB` | Enforces hard OOM boundary without swap exhaustion. |
| **CPU Quotas**              | `NanoCPUs: 500000000` (0.5 vCPU) | Throttles CPU consumption to prevent starving core services. |
| **Secret Isolation**        | Explicit allowlist of environment variables | Platform secrets (`JWT_SECRET`, `DATABASE_URL`, `REDIS_PASSWORD`) are never passed to challenge containers. |

---

## 4. Network Topology & Isolation Model

### 4.1 Topology Diagram
```text
                         [Participant Browser / CLI]
                                      |
                                      v
                             [NGINX Reverse Proxy]
                               (Port 80 / 443)
                                      |
                           [Fastify Backend API]
                               (Port 4000)
                              /           \
                             /             \
                   [ctf_core_net]       [ctf_challenges_net]
                    /          \                 |
                   v            v                v
             [PostgreSQL]    [Redis]   [Challenge Proxy Gateway]
             (Port 5432)   (Port 6379)           |
             (Isolated)    (Isolated)            |
                                      +----------+----------+
                                      |                     |
                                      v                     v
                               [Per-Team Net A]      [Per-Team Net B]
                                      |                     |
                                      v                     v
                                [Container A]         [Container B]
                                 (Team A Only)         (Team B Only)
```

### 4.2 Network Isolation Invariants
1. **Zero Access to Core Data Stores**:
   `PostgreSQL` and `Redis` containers reside exclusively on `ctf_core_net`. They have no IP or routing interface on `ctf_challenges_net` or any challenge network.
2. **Container-to-Container Segregation**:
   Each dynamic challenge instance is connected to an isolated per-instance bridge network (`techx-net-<instanceId>`) or attached with network filtering. Team A cannot discover, ping, ARP, or connect to Team B's container.
3. **Controlled Upstream Proxy (Zero SSRF)**:
   Participants cannot access challenge container IP addresses directly. All participant HTTP/Web challenge traffic is routed through Fastify's `/api/v1/challenges/:slug/instance/proxy/*` gateway. The upstream target is resolved **strictly from the authenticated team's active database instance record** (`http://${instance.internalIp}:${instance.internalPort}/`). No user-supplied target IP, host, or URL is ever permitted.

---

## 5. Server-Controlled Challenge Manifest & Registry

Participants can never select an image, specify a tag, supply command line arguments, or alter resource limits. All dynamic challenge metadata is declared in a **Server-Authoritative Registry**:

```typescript
export interface DynamicChallengeDefinition {
  challengeId: string;
  slug: string;
  image: string;
  internalPort: number;
  memoryLimitBytes: number; // e.g. 256MB
  cpuLimitNano: number;     // e.g. 0.5 vCPU (500_000_000)
  pidsLimit: number;        // e.g. 64
  readOnlyRootfs: boolean;  // true by default
  tmpfsMounts: Record<string, string>; // e.g. { '/tmp': 'rw,noexec,nosuid,size=32m' }
  ttlSeconds: number;       // default 1800s (30m), max 3600s (60m)
  envAllowlist?: Record<string, string>;
  healthCheckPath?: string; // e.g. '/health' or '/'
}
```

### Startup Validation
At server startup, the registry is validated against strict security rules:
- Reject any definition specifying `privileged: true`.
- Reject images outside trusted repositories/tags.
- Reject CPU limits $> 2.0$ vCPUs or Memory $> 1024$MB.
- Reject TTL $> 7200$ seconds.
- Reject definitions without port or resource limits.

---

## 6. Database State Machine & Concurrency Invariants

### 6.1 State Machine
```text
                 +-------------------+
                 |       NONE        |
                 +-------------------+
                           |
                     (POST start)
                           |
                           v
                 +-------------------+
         +-----> |     CREATING      |
         |       +-------------------+
         |            /         \
         |     (docker fail)   (container started & healthy)
         |          /             \
         |         v               v
         |   +----------+    +-----------+
(reset)  |   |  FAILED  |    |  RUNNING  | <---+ (GET status / keep-alive)
         |   +----------+    +-----------+     |
         |         |               |           |
         |         |         (DELETE stop /    |
         |         |          TTL expired)     |
         |         |               |           |
         |         v               v           |
         |   +---------------------------+     |
         +-- |     STOPPING -> STOPPED   | ----+
             +---------------------------+
                           |
                      (reaped)
                           |
                           v
                 +-------------------+
                 |      EXPIRED      |
                 +-------------------+
```

### 6.2 Database Table: `challenge_instances`
```sql
CREATE TABLE challenge_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'CREATING',
    container_id VARCHAR(64),
    container_name VARCHAR(128) NOT NULL,
    internal_ip VARCHAR(45),
    internal_port INTEGER NOT NULL,
    access_token VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    stopped_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    instance_metadata JSONB DEFAULT '{}'::jsonb
);

-- Invariant: Maximum ONE active instance per team per challenge
CREATE UNIQUE INDEX idx_challenge_instances_team_chal_active 
ON challenge_instances (team_id, challenge_id) 
WHERE status IN ('CREATING', 'RUNNING', 'STOPPING');

-- Fast lookup by team and container ID for reaper and proxies
CREATE INDEX idx_challenge_instances_team_id ON challenge_instances (team_id);
CREATE INDEX idx_challenge_instances_container_id ON challenge_instances (container_id);
CREATE INDEX idx_challenge_instances_expires_status ON challenge_instances (expires_at, status);
```

### 6.3 Concurrency Control & Idempotency
- **Concurrent `POST /instance` requests**:
  Wrapped in a PostgreSQL transaction with row-level locking or relying on the partial unique index `idx_challenge_instances_team_chal_active`. If a second request arrives while status is `CREATING` or `RUNNING`, the API detects the active instance and returns `409 CONFLICT` or the existing instance details, preventing duplicate container launches.
- **Global Team Concurrency Guard**:
  A single team is limited to a maximum of 2 concurrent dynamic challenge instances across the entire competition to prevent resource starvation.

---

## 7. API Authorization & Competition Integration

### 7.1 Endpoints
All dynamic challenge endpoints require authentication and active team membership:
- `POST /api/v1/challenges/:slug/instance`: Spawn or return current active instance.
- `GET /api/v1/challenges/:slug/instance`: Retrieve status, connection URL, remaining TTL.
- `POST /api/v1/challenges/:slug/instance/reset`: Safely tear down existing container and spin up a pristine replacement.
- `DELETE /api/v1/challenges/:slug/instance`: Stop and remove container immediately.
- `ALL /api/v1/challenges/:slug/instance/proxy/*`: Authenticated HTTP proxy to the running container.

### 7.2 Gate Checks
Before performing any instance lifecycle mutation or proxy routing, the backend enforces:
1. **Authentication & Team Membership**: User must have a valid JWT session and belong to an active team (`req.user.teamId`).
2. **Team Status**: If `team.status === 'disqualified'` $\to$ `403 TEAM_DISQUALIFIED`. If `team.status === 'disabled'` $\to$ `403 TEAM_DISABLED`.
3. **Competition State**:
   - `competition_state.state === 'live'` and `is_submission_enabled === true`.
   - If `paused` $\to$ `403 COMPETITION_PAUSED`.
   - If `ended` or `archived` $\to$ `403 COMPETITION_ENDED`.
4. **Challenge Visibility & Release**:
   - Challenge must be `status === 'published'`.
   - If `release_time` is set and in the future, participants receive `404 NOT FOUND`.

---

## 8. Lifecycle Management, Cleanup Worker & Orphan Reaper

### 8.1 Periodic TTL Cleanup Worker
A background worker runs every 15 seconds:
1. Queries instances where `expires_at <= NOW()` and `status IN ('CREATING', 'RUNNING')`.
2. Atomically marks status to `STOPPING`.
3. Invokes the Docker manager to stop and remove the container and associated network.
4. Updates status to `EXPIRED` with `stopped_at = NOW()`.
5. Logs audit event `challenge_instance_expired`.

### 8.2 Container Labeling & Orphan Reaper
All Docker resources created by the platform are tagged with immutable labels:
```text
techx.managed=true
techx.component=challenge-instance
techx.instance_id=<UUID>
techx.challenge_id=<UUID>
techx.team_id=<UUID>
```
The Orphan Reaper executes on startup and every 60 seconds:
- **Case 1 (Unmanaged Docker Container)**: A container has label `techx.managed=true`, but no corresponding `RUNNING` or `CREATING` record exists in `challenge_instances`. The container is stopped and removed immediately.
- **Case 2 (Missing Docker Container)**: A database record is marked `RUNNING`, but Docker reports the container does not exist. The record is transitioned to `FAILED` with `failure_reason = 'CONTAINER_TERMINATED_EXTERNALLY'`.
- **Case 3 (Wrong Image / Tampered)**: If a container's image hash does not match the server registry definition, it is immediately terminated.

---

## 9. Failure Handling & Information Disclosure Prevention

When Docker encounters failures (e.g. daemon down, image pull failure, resource quota exceeded, health check timeout):
1. **Never Leak System Details**: Raw Docker errors, host file paths, socket errors, and kernel messages are caught and redacted.
2. **Standardized Participant Errors**:
   - `CHALLENGE_CAPACITY_EXCEEDED`: Platform has reached maximum concurrent container threshold.
   - `INSTANCE_START_FAILED`: Container failed to become healthy within the bounded timeout (30 seconds).
   - `INSTANCE_NOT_FOUND`: No active instance exists for the team.
   - `INSTANCE_BUSY`: Instance is currently transitioning states (`CREATING` or `STOPPING`).
3. **Structured Server Logs**: Full error context, container IDs, exit codes, and timestamps are logged internally using Pino with audit event recording.
