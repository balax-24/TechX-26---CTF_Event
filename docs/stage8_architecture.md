# TechX CTF 2026 — Stage 8 Architecture Specification
## Dynamic Challenge Infrastructure, Container Isolation & Lifecycle Management

---
## 1. Executive Summary & Objective

Stage 8 introduces **Dynamic Challenge Infrastructure** to the TechX Madras 2026 CTF platform. In traditional static CTFs, all participants connect to a shared challenge instance or download static binaries. In contrast, modern cybersecurity competitions require **per-team isolated dynamic challenge environments** (such as intentionally vulnerable web services, pwn binaries, or service exploits) where:
1. Each team receives an independent, ephemeral containerized runtime.
2. Exploitation, denial-of-service, file corruption, or database drops by Team A do not compromise Team B's instance.
3. Every dynamic challenge container is treated as an **untrusted, hostile workload boundary**.
4. Core infrastructure (PostgreSQL, Redis, Fastify), Docker daemon socket, and neighboring containers are partitioned and inaccessible to challenge workloads.

---

## 2. Threat Model & Trust Boundaries

### 2.1 Threat Assumptions
Dynamic challenges host intentionally vulnerable code. Once a participant exploits a challenge, they may obtain an interactive root or unprivileged shell inside the container. We assume an attacker will attempt:
- **Host Escape**: Exploiting container breakout flaws, mounting host storage, interacting with `/var/run/docker.sock`, or abusing Linux kernel capabilities.
- **Resource Denial of Service (DoS)**: Fork bombs, crypto-mining, unbounded memory consumption, disk exhaustion, or CPU monopolization.
- **Lateral Movement & Network Pivoting**: Scanning the local Docker subnet, accessing internal services (PostgreSQL on port 5432, Redis on port 6379, Fastify on port 4000), or attacking another team's challenge container.
- **SSRF & Proxy Abuse**: Manipulating reverse proxy endpoints or returning upstream redirects to route requests to arbitrary internal IP addresses or host loopback interfaces.
- **Secret Extraction**: Inspecting environment variables to steal CTF platform secrets (JWT signing keys, database passwords, session cookie secrets).
### 2.2 Trust Hierarchy & Component Separation
```text
+-------------------------------------------------------------------------------+
| ZONE 0: Core Application Control Plane (High Trust - Application Level)       |
| - Fastify Core API (Authentication, RBAC, Scoring, Participant Invariants)    |
| - PostgreSQL 16 (Relational State, Score Ledger, Instance Records)           |
| - Redis 7 (Cache, Session State, Pub/Sub, Outbox Queue)                       |
| - Networks: ctf_core_net, ctf_gateway_net                                     |
| - Docker Socket: NOT MOUNTED (Zero Docker engine access)                      |
| - Challenge Networks: NEVER ATTACHED (Zero presence on techx-inst-net-*)      |
+-------------------------------------------------------------------------------+
                                  |
                                  | Internal Control API over ctf_gateway_net
                                  | (Authenticated via x-gateway-secret)
                                  v
+-------------------------------------------------------------------------------+
| ZONE 1: Challenge Gateway & Infrastructure Manager (High Trust - Infra Level) |
| - Dedicated standalone Node.js infrastructure service                         |
| - Holds /var/run/docker.sock to manage container lifecycle and networks       |
| - Attaches ONLY its own container (techx_challenge_gateway) to instance nets   |
| - Strictly isolated: NO PostgreSQL credentials, NO Redis credentials,        |
|   NO JWT signing keys, NO Cookie secrets, NO Competition scoring logic        |
| - Network Forwarding Disabled: Host kernel / container net.ipv4.ip_forward=0  |
+-------------------------------------------------------------------------------+
                                  |
               [STRICT PER-INSTANCE BRIDGE BARRIER]
                                  |
        +-------------------------+-------------------------+
        |                                                   |
        v                                                   v
+-----------------------------------+   +-----------------------------------+
| ZONE 2A: Challenge Instance Team A|   | ZONE 2B: Challenge Instance Team B|
| - techx-inst-net-A (internal: true|   | - techx-inst-net-B (internal: true|
| - Dropped capabilities (ALL)      |   | - Dropped capabilities (ALL)      |
| - No-new-privileges, Read-only    |   | - No-new-privileges, Read-only    |
| - PID (64), Memory, CPU limits    |   | - PID (64), Memory, CPU limits    |
| - Inaccessible to Core Fastify/DB |   | - Inaccessible to Core Fastify/DB |
+-----------------------------------+   +-----------------------------------+
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
| **Docker Socket Exclusion** | `/var/run/docker.sock` NOT mounted | Participants and challenge containers can never invoke Docker daemon commands. |
| **Read-Only Filesystem**   | `ReadonlyRootfs: true` | Prevents persistence, rootkit installation, or modification of challenge binaries. |
| **Ephemeral Writable Storage**| `Tmpfs: { "/tmp": "rw,noexec,nosuid,size=32m" }` | Controlled, bounded in-memory storage for necessary temporary files with `noexec` and `nosuid`. |
| **Seccomp Filtering**       | Default / Hardened Seccomp profile | Blocks dangerous system calls (`clone` with new user namespaces, `bpf`, `sys_chroot`, etc.). |
| **Process Limits (PID)**    | `PidsLimit: 64` (default) | Prevents `fork bombs` from exhausting host PID tables. |
| **Memory Limits**           | `Memory: 256MB - 512MB`<br>`MemorySwap: 256MB - 512MB` | Enforces hard OOM boundary without swap exhaustion. |
| **CPU Quotas**              | `NanoCPUs: 500000000` (0.5 vCPU) | Throttles CPU consumption to prevent starving core services. |
| **Secret Isolation**        | Explicit allowlist of environment variables | Platform secrets (`JWT_SECRET`, `DATABASE_URL`, `REDIS_PASSWORD`) are never passed to challenge containers. |

---

## 4. Network Topology & Isolation Model

### 4.1 Topology Overview: Three-Tier Partitioned Architecture
To eliminate the architectural security risk of attaching the primary application container to participant networks:
1. **Core Backend Container (`techx_ctf_backend`)**:
   - Attached only to `ctf_core_net` (PostgreSQL, Redis, NGINX) and `ctf_gateway_net` (internal gateway bridge).
   - Has **NO** Docker daemon socket mounted.
   - **NEVER** executes `docker network connect <challenge-network> <backend-container>`.
   - Never has a network interface inside any participant bridge.
2. **Dedicated Challenge Gateway (`techx_challenge_gateway`)**:
   - Standalone, high-trust infrastructure container.
   - Attached to `ctf_gateway_net` (`internal: true`) to receive control and proxy requests from Fastify.
   - Holds `/var/run/docker.sock` to manage container lifecycles and per-instance networks.
   - Upon container provisioning, dynamically attaches **ONLY ITS OWN CONTAINER** (`techx_challenge_gateway`) to `techx-inst-net-<instanceId[:8]>`.
   - Stripped of all application credentials (`DATABASE_URL`, `REDIS_PASSWORD`, `JWT_SECRET`, `COOKIE_SECRET`).
3. **Per-Instance Challenge Networks (`techx-inst-net-<instanceId[:8]>`)**:
   - Created with `internal: true` (no WAN egress).
   - Contains strictly two network endpoints: the `techx_challenge_gateway` interface and the single team's challenge container.

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
                             /             \  (ctf_gateway_net: internal)
                   [ctf_core_net]       [Challenge Gateway Service]
                    /          \             (Port 5000)
                   v            v                 |
             [PostgreSQL]    [Redis]              | (Dynamically attaches Gateway only)
             (Port 5432)   (Port 6379)            |
             (Isolated)    (Isolated)   +---------+---------+
                                        |                   |
                                        v                   v
                               [Per-Instance Net A]  [Per-Instance Net B]
                                (internal: true)      (internal: true)
                                        |                   |
                                        v                   v
                                  [Container A]         [Container B]
                                   (Team A Only)         (Team B Only)
```

### 4.2 Network Isolation Invariants & Exact Routing Mechanics
1. **Core Service Isolation (`ctf_core_net`)**:
   `PostgreSQL` and `Redis` containers reside exclusively on `ctf_core_net`. They have no IP or routing interface on challenge networks or the gateway network. Direct connectivity attempts from challenge containers to port 5432, port 6379, or internal backend services fail.
2. **Core Backend Unreachability**:
   The primary Fastify backend has no presence on `techx-inst-net-*`. A compromised challenge container cannot route to or establish TCP connections with Fastify (`techx_ctf_backend`).
3. **Challenge-to-Challenge Segregation**:
   Because each challenge instance resides on an independent bridge network (`techx-inst-net-A` vs `techx-inst-net-B`), containers from different teams share no subnet, cannot ARP or ping each other, and cannot establish direct TCP/UDP connections. Docker's `DOCKER-ISOLATION-STAGE-2` iptables chain explicitly drops forwarded traffic between different bridge devices.
4. **Gateway Non-Bridging Invariant**:
   The Gateway container does not enable IP forwarding (`net.ipv4.ip_forward = 0`). It never routes packets between `techx-inst-net-A` and `techx-inst-net-B`. It acts solely as an application-level reverse proxy.
5. **Egress Policy (External WAN Inaccessibility)**:
   Per-instance challenge networks are provisioned with `internal: true`. Docker does not create default NAT/masquerade outbound routing rules for internal bridge networks, and no default gateway route is installed inside the container network namespace. Outbound traffic to the public Internet, internal host loopback services, or cloud metadata endpoints (`169.254.169.254`) is blocked.
6. **Controlled Upstream Reverse Proxy**:
   Participant-controlled upstream host/IP parameters are not accepted. Proxy destinations are resolved exclusively from server-controlled challenge-instance metadata (`http://${instance.internalIp}:${instance.internalPort}/`).
7. **Proxy Redirect Safety**:
   The reverse proxy does not follow upstream HTTP 3xx redirects. If an upstream challenge service returns a redirect pointing to `127.0.0.1`, `localhost`, `169.254.169.254`, or private subnets, the response with the `Location` header is passed directly back to the participant's browser. The platform never executes an internal request to redirect targets.s.

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

---

## 10. Operational Hardening, Verification & Known Limitations

### 10.1 Competition-End Behavior
When the competition state transitions to `ended` or `archived`:
1. **Immediate Proxy Gating**: `getProxyTarget` queries `competitionService.requireLiveCompetition()`. Any active participant HTTP session hitting `/proxy/*` immediately receives `403 FORBIDDEN` with code `COMPETITION_NOT_ACTIVE`.
2. **Lifecycle Mutations Blocked**: `startInstance` and `resetInstance` immediately fail with `403 COMPETITION_NOT_ACTIVE`.
3. **Automated Cleanup**: The `InstanceCleanupWorker` periodically checks competition state. Upon detecting `ended` or `archived`, it transitions all remaining active instances to `EXPIRED` and tears down all associated Docker containers and per-instance bridge networks.

### 10.2 Orphan Reaper Trust Model
The cleanup worker enforces a strict fail-closed trust model:
- Only containers carrying **both** `techx.managed = 'true'` AND `techx.component = 'ctf-challenge'` are evaluated for reaping.
- Core system containers (PostgreSQL, Redis, NGINX, Fastify) carry either no `techx.managed` label or `techx.component = 'core-datastore'`. They are strictly ignored by the reaper.
- Containers with malformed or missing labels are never removed by the automated reaper.

### 10.3 Verification Classification
To adhere to strict engineering integrity and avoid false verification claims:
- **`STATIC CONFIGURATION VERIFIED`**: Memory limits, CPU quotas, PIDs limit, read-only rootfs, `SecurityOpt: ["no-new-privileges:true"]`, `CapDrop: ["ALL"]`, `Privileged: false`, Docker Compose file validation, and schema definitions.
- **`UNIT TEST VERIFIED`**: URL sanitization (CRLF/null-byte rejection), parameter rejection, redirect non-following, orphan reaper logic, concurrency mutexes, and secret exclusion.
- **`DOCKER MOCK/CONTRACT VERIFIED`**: `MockDockerManager` verifies Docker Engine API payload contracts, network isolation simulation, and container creation parameters.
- **`LIVE DOCKER INTEGRATION VERIFIED`**: `NOT VERIFIED` on hosts lacking a running Docker Linux engine daemon.
- **`RUNTIME KERNEL ENFORCEMENT VERIFIED`**: `NOT VERIFIED` on hosts lacking an active Linux cgroups v2 controller or live Seccomp BPF filter.
- **`PROXY-TO-CHALLENGE RUNTIME VERIFICATION`**: `NOT VERIFIED — NO LIVE LINUX DOCKER DAEMON` (Docker Desktop Linux daemon not running on this Windows host).

### 10.4 Known Limitations
1. **Per-Host Container Capacity**: Limited to configured `MAX_GLOBAL_INSTANCES` (default 100). When full, teams must wait for running instances to expire or stop before launching new ones.
2. **Cold Start Latency**: Spawning a new container and waiting for healthcheck readiness takes approximately 1–3 seconds depending on image complexity and host load.
3. **No Dynamic Outbound Access**: By default, challenge containers on `internal: true` bridge networks cannot make external network connections. If a specific challenge requires outbound Internet access, it must be explicitly configured with custom egress routing.
