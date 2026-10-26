# TechX CTF 2026 — Stage 11: Production Deployment, Infrastructure & Event-Day Readiness Manual

This document provides the authoritative, production-grade deployment and operations guide for the **TechX Madras 2026 CTF Platform**. It defines the repeatable, secure deployment procedures for running the platform on a standalone Linux event laptop/server over a college LAN switch, or on a public Linux VPS/dedicated server.

---

## 1. System Architecture

```text
                                LAN / Internet
                                      |
                                      v
                 +------------------------------------------+
                 |            NGINX 1.27 Alpine             |
                 |     (Reverse Proxy, Static SPA, TLS)     |
                 +--------------------+---------------------+
                                      | (ctf_core_net)
                                      v
                 +------------------------------------------+
                 |           Fastify Core Backend           |
                 |    (Auth, Submissions, Leaderboard, SSE) |
                 +---------+--------------------+-----------+
                           |                    |
            (ctf_core_net) |                    | (ctf_gateway_net - INTERNAL)
                           v                    v
          +----------------------+     +------------------------------------+
          |  PostgreSQL 16 &     |     |      TechX Challenge Gateway       |
          |  Redis 7 In-Memory   |     |    (Docker Socket Control Plane)   |
          +----------------------+     +-----------------+------------------+
                                                         |
                                    (/var/run/docker.sock| unprivileged)
                                                         v
                                       +------------------------------------+
                                       | Dynamic Challenge Containers (1..N)|
                                       | (Per-instance isolated bridge nets)|
                                       +------------------------------------+
```

### Core Security Architecture Invariants:
1. **Docker Socket Isolation**: Only `techx_challenge_gateway` has access to `/var/run/docker.sock`. Core backend, NGINX, Redis, and PostgreSQL have **NO** Docker socket access.
2. **Network Segmentation**:
   - `ctf_core_net`: Connects NGINX, Fastify Core, PostgreSQL, and Redis.
   - `ctf_gateway_net`: `internal: true` bridge connecting Fastify Core and Challenge Gateway.
   - Dynamic Challenge Networks: Dedicated, ephemeral bridges per instance (`techx-net-<id>`).
   - Direct network access between dynamic challenges and PostgreSQL, Redis, or the Core Backend is strictly blocked.
3. **Storage Isolation**: Challenge files are stored in protected volumes and served exclusively via Fastify-authorized `X-Accel-Redirect` inside NGINX.

---

## 2. Prerequisites

### Hardware Requirements:
- **CPU**: 4 cores minimum (8 cores recommended for 400+ concurrent participants).
- **RAM**: 8 GB minimum (16 GB recommended to support 100 concurrent dynamic Docker containers).
- **Disk Storage**: 50 GB free NVMe/SSD space (ext4 or xfs).

### Operating System:
- **Ubuntu 22.04 LTS / 24.04 LTS** or **Debian 12 Bookworm** (x86_64).
- Kernel >= 5.15 with cgroups v2 enabled.

### Software Dependencies:
- Docker Engine >= 24.0.0
- Docker Compose Plugin >= 2.20.0
- OpenSSL >= 3.0.0
- Bash >= 5.0
- curl >= 7.80.0, jq >= 1.6

---

## 3. Linux Host Preparation

Execute on the target Linux host prior to deployment:

```bash
# 1. Update OS packages
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl gnupg lsb-release jq gzip

# 2. Install official Docker Engine & Compose plugin
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 3. Optimize Linux kernel networking & memory for high concurrency
sudo tee /etc/sysctl.d/99-techx-ctf.conf << 'EOF'
# Increase socket backlog and max open files
fs.file-max = 2097152
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.core.netdev_max_backlog = 10000

# Ephemeral port range expansion
net.ipv4.ip_local_port_range = 1024 65535

# Fast TCP socket recycling
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_tw_reuse = 1

# Virtual memory overcommit
vm.max_map_count = 262144
vm.overcommit_memory = 1
EOF

sudo sysctl --system
```

---

## 4. Environment Configuration

Clone the repository to `/opt/techx-ctf` or user home:

```bash
git clone https://github.com/balax-24/TechX-26---CTF_Event.git /opt/techx-ctf
cd /opt/techx-ctf
```

The platform uses two deployment overlays:
- **LAN Mode** (`docker-compose.lan.yml`): For local offline deployment over Gigabit Ethernet switch. Binds NGINX to `0.0.0.0:80` without TLS overhead.
- **Production VPS Mode** (`docker-compose.prod.yml`): For public cloud VPS. Binds NGINX to `80` (HTTP -> HTTPS redirect) and `443` (TLS termination with SSL certs).

---

## 5. Secret Generation

Run the automated secret generator to create cryptographically secure keys:

```bash
chmod +x ./scripts/*.sh
./scripts/generate_secrets.sh
```

This generates `.env` with:
- 64-character hex strings for `JWT_SECRET`, `COOKIE_SECRET`, `CHALLENGE_GATEWAY_SECRET`, `DB_PASSWORD`, `REDIS_PASSWORD`
- 32-character hex string for `FLAG_SALT`
- Automated fail-fast validation in `backend/src/config/env.ts` will abort startup if default dev strings are retained in production.

Verify permissions:
```bash
ls -l .env # Must be -rw------- (600)
```

---

## 6. Deployment Execution

### College LAN Mode:
```bash
# Set host Ethernet IP in .env (e.g. PUBLIC_HOST=192.168.1.50)
sed -i 's|^PUBLIC_HOST=.*|PUBLIC_HOST=192.168.1.50|' .env
sed -i 's|^DEPLOYMENT_MODE=.*|DEPLOYMENT_MODE=lan|' .env

# Build and start services
docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build
```

### Production VPS Mode:
```bash
# Ensure SSL certs are in place
mkdir -p docker/nginx/ssl
# Copy fullchain.pem and privkey.pem into docker/nginx/ssl/

sed -i 's|^PUBLIC_HOST=.*|PUBLIC_HOST=ctf.techxmadras.org|' .env
sed -i 's|^PUBLIC_PROTOCOL=.*|PUBLIC_PROTOCOL=https|' .env
sed -i 's|^DEPLOYMENT_MODE=.*|DEPLOYMENT_MODE=production|' .env

# Build and start services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

## 7. Database Migrations

Apply database schema migrations idempotently:

```bash
# Run migrations using the backend container
docker compose exec -T backend npm run db:migrate
```

*Verification*:
```bash
docker compose exec -T postgres psql -U techx_ctf_user -d techx_ctf_db -c "\dt"
```
Expected: 14 public tables (`users`, `teams`, `challenges`, `submissions`, `score_ledger`, `audit_logs`, `outbox_events`, `container_instances`, etc.).

---

## 8. Admin Bootstrap

Provision the initial platform administrator account:

```bash
docker compose exec -T \
  -e ADMIN_USERNAME="techx_admin" \
  -e ADMIN_EMAIL="admin@techxmadras.org" \
  -e ADMIN_PASSWORD="<YOUR_STRONG_PASSWORD_MIN_12_CHARS>" \
  backend npm run bootstrap:admin
```

Expected output:
```text
[✓] Bootstrap result: CREATED (User: techx_admin)
```
*Note*: Running this again is idempotent and will safely skip duplicate creation.

---

## 9. Health & Diagnostic Probes

Verify system health via the included diagnostic script:

```bash
./scripts/health_check.sh http://localhost
```

Or query endpoints directly:
1. **Liveness Probe**:
   ```bash
   curl -I http://localhost/health
   # HTTP/1.1 200 OK
   ```
2. **Deep Readiness Probe**:
   ```bash
   curl -s http://localhost/api/v1/health | jq
   ```
   Expected response:
   ```json
   {
     "status": "ok",
     "deploymentMode": "lan",
     "competitionState": "active",
     "uptimeSeconds": 145.2,
     "services": {
       "database": { "status": "healthy", "latencyMs": 1.2 },
       "redis": { "status": "healthy", "latencyMs": 0.8 }
     }
   }
   ```

---

## 10. Operational Smoke Test

Run the automated smoke test script to validate all 12 platform workflows:

```bash
./scripts/smoke_test.sh http://localhost
```

Validates:
1. Frontend SPA Availability (200 OK)
2. Ingress & Liveness Probes
3. Deep Readiness Probes (PostgreSQL & Redis)
4. Participant Registration
5. Authentication & JWT Issuance
6. Team Creation
7. Team Member Joining via Invite Code
8. Challenge Catalog Listing
9. Leaderboard Snapshot Retrieval
10. Leaderboard Real-Time SSE Stream Handshake
11. Protected Challenge Storage Security Guard (`/protected_storage/`)
12. Participant Logout

---

## 11. Database Backup Procedure

Execute regular automated backups before and during the event:

```bash
./scripts/backup_db.sh /opt/techx-ctf/backups
```

- Produces: `backups/techx_ctf_backup_YYYYMMDD_HHMMSS.sql.gz`
- Automatically executes gzip integrity check (`gunzip -t`) post-dump.
- Non-TTY execution avoids stream corruption.

---

## 12. Disaster Recovery & Restore Procedure

In the event of database corruption or hardware failover:

```bash
# 1. Stop backend to halt incoming writes
docker compose stop backend

# 2. Execute restore script
./scripts/restore_db.sh backups/techx_ctf_backup_YYYYMMDD_HHMMSS.sql.gz

# 3. Restart backend
docker compose start backend

# 4. Verify system readiness
./scripts/health_check.sh http://localhost
```

---

## 13. Failure Recovery & Service Lifecycle

The platform uses `restart: unless-stopped` with health-based startup sequencing:

| Failure Scenario | Automatic Recovery Behavior | Manual Intervention (if required) |
| :--- | :--- | :--- |
| **Backend Crash** | Docker restarts container; reconnects to Postgres pool and Redis bus. | `docker compose logs -f --tail=100 backend` |
| **Redis Outage** | Backend buffers events in PostgreSQL `outbox_events` table; when Redis resumes, `outbox.worker.ts` drains backlog. | `docker compose restart redis` |
| **PostgreSQL Outage**| Backend health probe returns `503 Service Unavailable`; resumes automatically upon DB recovery. | `docker compose logs -f postgres` |
| **Gateway Crash** | Dynamic challenge containers remain running in Docker; gateway re-attaches on restart and reconciles state. | `docker compose restart challenge_gateway` |
| **Orphaned Container**| Periodic cleanup worker in gateway automatically reaps containers past their TTL. | Handled automatically. |

---

## 14. Log Management & Rotation

All services are configured with bounded Docker logging:
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "20m"
    max-file: "5"
```
Logs are capped at 100 MB per container, preventing disk exhaustion during the event.

To view live structured logs:
```bash
docker compose logs -f --tail=50 backend
docker compose logs -f --tail=50 nginx
```

---

## 15. Resource Limits & Sizing

| Container | CPU Limit | Memory Limit | Sizing Rationale |
| :--- | :--- | :--- | :--- |
| **`postgres`** | 2.0 cores | 1024 MB | Sized for `max_connections=200`, `shared_buffers=256MB` |
| **`redis`** | 1.0 core | 512 MB | Sized for pub/sub buffers and rate limiter sliding windows |
| **`backend`** | 2.0 cores | 1024 MB | Fastify V8 heap headroom for 200+ concurrent connections |
| **`challenge_gateway`** | 1.0 core | 512 MB | Lightweight reverse proxy & Docker SDK controller |
| **`nginx`** | 1.0 core | 256 MB | Epoll static file caching and proxy buffering |
| **Dynamic Challenge** | 0.5 core | 256 MB | Per-instance sandbox limit (`pids-limit: 64`) |

---

## 16. Security Model Summary

- **Non-Root Execution**: Backend and NGINX run as unprivileged users (`node`, `nginx`).
- **Privilege Escalation**: `no-new-privileges:true` set across all containers.
- **Port Exposure**: PostgreSQL and Redis have **no external port mappings** in production.
- **CSRF & Rate Limiting**: Enabled on all mutation endpoints.
- **Audit Logging**: All administrative actions logged to `audit_logs` table with actor metadata.

---

## 17. College LAN Deployment Guide

1. Connect the event server/laptop to the dedicated Gigabit switch via Cat6 Ethernet.
2. Assign a static IP address to the Ethernet interface:
   - IP: `192.168.1.50`
   - Netmask: `255.255.255.0`
3. Update `.env`:
   - `PUBLIC_HOST=192.168.1.50`
   - `PUBLIC_PORT=80`
   - `DEPLOYMENT_MODE=lan`
4. Start platform:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build
   ```
5. Participants navigate to `http://192.168.1.50/` in their browser.

---

## 18. VPS Deployment Guide

1. Point DNS A record (e.g. `ctf.techxmadras.org`) to VPS public IP.
2. Obtain Let's Encrypt certificates using Certbot.
3. Place certs in `docker/nginx/ssl/` (`fullchain.pem`, `privkey.pem`).
4. Update `.env`:
   - `PUBLIC_HOST=ctf.techxmadras.org`
   - `PUBLIC_PORT=443`
   - `PUBLIC_PROTOCOL=https`
   - `DEPLOYMENT_MODE=production`
5. Start platform:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   ```

---

## 19. Event-Day Runbook Pointer

Refer to [`docs/EVENT_DAY_RUNBOOK.md`](../../docs/EVENT_DAY_RUNBOOK.md) for the operator operational checklist before, during, and after the event.

---

## 20. Clean Shutdown Procedure

To cleanly stop the competition:

```bash
# 1. Freeze competition state in admin portal or via API
curl -X POST http://localhost/api/v1/admin/competition/freeze \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# 2. Take final verified database backup
./scripts/backup_db.sh ./backups/final_event_backup

# 3. Stop containers gracefully
docker compose down
```

---

## 21. Emergency Recovery Procedure

1. **Mass Leaderboard Desynchronization**:
   Execute `docker compose restart redis backend` to trigger outbox reconciliation.
2. **Dynamic Challenge Gateway Lockup**:
   Execute `docker compose restart challenge_gateway`. Existing participant challenge containers remain running.
3. **Database Performance Degradation**:
   Check slow queries: `docker compose exec -T postgres psql -U techx_ctf_user -d techx_ctf_db -c "SELECT pid, query, state, age(clock_timestamp(), query_start) FROM pg_stat_activity WHERE state != 'idle';"`

---

## 22. Known Limitations & Disclosure

- **Host Environment**: This repository was engineered on a Windows 11 host with Docker simulation and loopback testing.
- **Pending Linux Staging Validation**: While all Dockerfiles, Compose overlays, shell scripts, and configs have been statically and syntactically verified, multi-node physical 400-user end-to-end capacity through physical NGINX, live PostgreSQL, live Redis, and live dynamic Docker containers remains to be executed on target Linux hardware.
