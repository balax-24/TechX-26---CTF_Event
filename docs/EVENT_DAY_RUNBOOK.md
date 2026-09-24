# TechX CTF 2026 — Master Event-Day Operations Runbook

This runbook is the authoritative, operational reference checklist for event organizers and system administrators during **IEEE TechX Madras CTF 2026**.

---

## 1. PRE-EVENT CHECKLIST (T-3 Hours to T-0)

Print or keep this checklist open on the primary administrator operations console:

### 1.1 Host Server Verification
- [ ] Check operating system, kernel, and hardware specifications:
  ```bash
  uname -a && lscpu | grep "Model name\|CPU(s):"
  ```
- [ ] Check available memory (minimum 8 GB RAM, 16 GB recommended):
  ```bash
  free -h
  ```
- [ ] Check disk storage (minimum 30 GB free on `/` and `/var/lib/docker`):
  ```bash
  df -h / /var/lib/docker
  ```
- [ ] Check host network interface and static IP assignment:
  ```bash
  ip addr show
  ```

### 1.2 Docker Engine & Daemon Verification
- [ ] Check Docker daemon status and version:
  ```bash
  sudo systemctl status docker
  docker version
  ```
- [ ] Verify cgroup v2 support:
  ```bash
  docker info | grep -i cgroup
  ```

### 1.3 Production Secrets & Environment Validation
- [ ] Verify `.env` file exists and has secure permissions (`600`):
  ```bash
  ls -l .env
  ```
- [ ] Verify secrets are non-default (must be >= 32 hex chars):
  ```bash
  grep -E 'JWT_SECRET|COOKIE_SECRET|CHALLENGE_GATEWAY_SECRET|FLAG_SALT|DB_PASSWORD|REDIS_PASSWORD' .env
  ```

### 1.4 Database Migrations Verification
- [ ] Verify all 4 migrations have been applied to PostgreSQL:
  ```bash
  docker compose exec -T postgres psql -U techx_ctf_user -d techx_ctf_db -c \
    'SELECT id, hash, created_at FROM drizzle."__drizzle_migrations" ORDER BY id;'
  ```
  Expected: Exactly 4 migration records (`0000_init`, `0001_quiet_hydra`, `0002_quiet_control_plane`, `0003_dynamic_challenges`).

### 1.5 Clean Baseline Database Backup
- [ ] Create pre-event baseline database backup:
  ```bash
  ./scripts/backup_db.sh ./backups/pre_event_baseline
  ```
- [ ] Validate archive integrity:
  ```bash
  gunzip -t ./backups/pre_event_baseline/techx_ctf_backup_*.sql.gz
  ```

### 1.6 Service Health & Stack Verification
- [ ] Ensure all 5 containers are running and report `(healthy)`:
  ```bash
  docker compose ps
  ```
- [ ] Run diagnostic probe script:
  ```bash
  ./scripts/health_check.sh http://localhost
  ```

### 1.7 Operational Smoke Test Execution
- [ ] Run end-to-end smoke test suite:
  ```bash
  ./scripts/smoke_test.sh http://localhost
  ```
  Must output: `[✓] SUCCESS: All production smoke test assertions PASSED!`

### 1.8 Administrator Login & Challenge Verification
- [ ] Log in as superadmin via Admin UI or API:
  ```bash
  curl -s -X POST http://localhost/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"identifier":"admin@techxmadras.org","password":"<ADMIN_PASSWORD>"}' | jq .
  ```
- [ ] Verify challenge definitions, categories, and point distributions:
  ```bash
  curl -s http://localhost/api/v1/challenges | jq .
  ```

---

## 2. EVENT START PROCEDURE (T-0)

Execute immediately when the competition officially begins:

### 2.1 Set Competition State to Active
- [ ] Open competition state:
  ```bash
  curl -s -X POST http://localhost/api/v1/admin/competition/start \
    -H "Authorization: Bearer <ADMIN_TOKEN>" | jq .
  ```

### 2.2 Verify Participant Registration
- [ ] Ensure participant registration is accepted:
  ```bash
  curl -s -X POST http://localhost/api/v1/auth/register \
    -H "Content-Type: application/json" \
    -d '{"username":"live_probe_1","email":"live1@techx.org","password":"ValidPassword2026!#"}' | jq .
  ```

### 2.3 Verify Participant Login & JWT Cookie Issuance
- [ ] Confirm authentication and cookie dispatch:
  ```bash
  curl -i -X POST http://localhost/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"identifier":"live_probe_1","password":"ValidPassword2026!#"}'
  ```

### 2.4 Verify Challenge Catalog Visibility
- [ ] Ensure challenges are displayed to authenticated users:
  ```bash
  curl -s http://localhost/api/v1/challenges -H "Authorization: Bearer <TOKEN>" | jq .
  ```

### 2.5 Verify Real-Time Leaderboard & SSE Stream
- [ ] Verify SSE stream connection opens and sends initial snapshot:
  ```bash
  curl -N -H "Accept: text/event-stream" -H "Authorization: Bearer <TOKEN>" \
    http://localhost/api/v1/leaderboard/stream
  ```

### 2.6 Verify Dynamic Challenge Sandbox Allocation
- [ ] Request dynamic container launch for a team:
  ```bash
  curl -s -X POST http://localhost/api/v1/instances \
    -H "Authorization: Bearer <TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{"challengeSlug":"dyn-cloud-sandbox"}' | jq .
  ```
- [ ] Verify container is running on isolated bridge network:
  ```bash
  docker ps --filter "name=techx26-inst"
  ```

---

## 3. DURING-EVENT MONITORING & MAINTENANCE

Perform continuous monitoring during the competition:

### 3.1 Host & Container Resource Monitoring
- [ ] Real-time container metrics:
  ```bash
  docker stats --no-stream
  ```
- [ ] Host memory and swap:
  ```bash
  free -h
  ```
- [ ] Host disk usage:
  ```bash
  df -h / /var/lib/docker
  ```

### 3.2 Database & Connection Pool Monitoring
- [ ] Check active PostgreSQL connection counts and pool status:
  ```bash
  docker compose exec -T postgres psql -U techx_ctf_user -d techx_ctf_db -c \
    "SELECT state, count(*) FROM pg_stat_activity GROUP BY state;"
  ```
- [ ] Check submission volume:
  ```bash
  docker compose exec -T postgres psql -U techx_ctf_user -d techx_ctf_db -c \
    "SELECT is_correct, count(*) FROM submissions GROUP BY is_correct;"
  ```

### 3.3 Redis Pub/Sub & Memory Monitoring
- [ ] Check Redis memory and client connections:
  ```bash
  docker compose exec -T redis redis-cli -a "${REDIS_PASSWORD}" info memory
  docker compose exec -T redis redis-cli -a "${REDIS_PASSWORD}" info clients
  ```

### 3.4 Error Log Monitoring
- [ ] Fastify backend error logs:
  ```bash
  docker compose logs -f --tail=20 backend | grep -iE 'error|fatal|exception'
  ```
- [ ] NGINX 4xx/5xx access logs:
  ```bash
  docker compose logs -f --tail=20 nginx | grep -E '" [45][0-9]{2} '
  ```
- [ ] Challenge Gateway operational logs:
  ```bash
  docker compose logs -f --tail=20 challenge_gateway
  ```

### 3.5 Hourly Automated Backup Procedure
- [ ] Execute every **60 minutes** during the live event:
  ```bash
  ./scripts/backup_db.sh ./backups/hourly
  ```

### 3.6 Event Pause Procedure (If Needed for Technical Briefing)
- [ ] Temporarily freeze submissions without clearing sessions:
  ```bash
  curl -s -X POST http://localhost/api/v1/admin/competition/pause \
    -H "Authorization: Bearer <ADMIN_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{"reason":"Technical announcement in progress"}' | jq .
  ```

### 3.7 Event Resume Procedure
- [ ] Resume submissions:
  ```bash
  curl -s -X POST http://localhost/api/v1/admin/competition/resume \
    -H "Authorization: Bearer <ADMIN_TOKEN>" | jq .
  ```

---

## 4. EMERGENCY INCIDENT RESPONSE PLAYBOOK

### 4.1 Backend Service Failure
- **Symptom**: NGINX returns `502 Bad Gateway` on `/api/v1/*`.
- **Response**:
  1. Inspect backend logs:
     ```bash
     docker compose logs --tail=50 backend
     ```
  2. Restart backend container:
     ```bash
     docker compose restart backend
     ```
  3. Verify recovery via readiness probe:
     ```bash
     curl -s http://localhost/api/v1/health | jq .
     ```

### 4.2 Database Outage or Connection Pool Exhaustion
- **Symptom**: Backend logs report `connection timeout` or health endpoint reports `database: unhealthy`.
- **Response**:
  1. Check PostgreSQL container status:
     ```bash
     docker compose ps postgres
     ```
  2. Terminate long-running idle connections:
     ```bash
     docker compose exec -T postgres psql -U techx_ctf_user -d techx_ctf_db -c \
       "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND age(clock_timestamp(), query_start) > interval '2 minutes';"
     ```
  3. If PostgreSQL is deadlocked, restart container:
     ```bash
     docker compose restart postgres
     docker compose restart backend
     ```

### 4.3 Redis Pub/Sub Outage
- **Symptom**: Real-time SSE updates stop; submissions still register in PostgreSQL.
- **Response**:
  1. Transactional outbox pattern automatically retains all score events in PostgreSQL `score_event_outbox` table.
  2. Restart Redis:
     ```bash
     docker compose restart redis
     ```
  3. Restart backend to immediately trigger outbox drain:
     ```bash
     docker compose restart backend
     ```

### 4.4 Challenge Gateway Failure
- **Symptom**: Participants cannot launch dynamic challenges; existing containers continue running.
- **Response**:
  1. Check gateway status:
     ```bash
     docker compose logs --tail=50 challenge_gateway
     ```
  2. Restart gateway (it will automatically reconcile running challenge containers):
     ```bash
     docker compose restart challenge_gateway
     ```
  3. Verify health probe:
     ```bash
     curl -s http://localhost:5000/health | jq .
     ```

### 4.5 NGINX Ingress Failure
- **Symptom**: Host port 80/443 connection refused.
- **Response**:
  1. Verify host ports are not bound by another process:
     ```bash
     sudo netstat -tulpn | grep -E ':80|:443'
     ```
  2. Test NGINX configuration syntax:
     ```bash
     docker compose exec -T nginx nginx -t
     ```
  3. Restart NGINX:
     ```bash
     docker compose restart nginx
     ```

### 4.6 Dynamic Challenge Container Exhaustion
- **Symptom**: Gateway reports `Global instance limit reached`.
- **Response**:
  1. List running challenge containers:
     ```bash
     docker ps --filter "name=techx26-inst"
     ```
  2. Trigger reconciliation of expired containers:
     ```bash
     curl -s -X POST http://localhost:5000/reconcile \
       -H "x-gateway-secret: ${CHALLENGE_GATEWAY_SECRET}"
     ```
  3. Prune dangling networks:
     ```bash
     docker network prune -f
     ```

### 4.7 Host Disk Space Exhaustion (> 85% full)
- **Symptom**: Disk write errors in PostgreSQL or Docker daemon.
- **Response**:
  1. Check Docker storage breakdown:
     ```bash
     docker system df
     ```
  2. Safely prune unused build caches and dangling images:
     ```bash
     docker image prune -f
     docker builder prune -f
     ```
  3. Verify backup retention policy pruned old dumps:
     ```bash
     ls -l ./backups/*.sql.gz
     ```

### 4.8 Suspected Security Incident (Malicious Activity / Brute Force)
- **Response**:
  1. Identify offending client IP from NGINX access logs:
     ```bash
     docker compose logs --tail=100 nginx | awk '{print $1}' | sort | uniq -c | sort -nr | head -10
     ```
  2. Inspect audit logs for privileged attempts:
     ```bash
     docker compose exec -T postgres psql -U techx_ctf_user -d techx_ctf_db -c \
       "SELECT actor_id, actor_role, action, actor_ip, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 20;"
     ```
  3. Ban malicious IP at host iptables level:
     ```bash
     sudo iptables -I INPUT -s <OFFENDING_IP> -j DROP
     ```

---

## 5. EVENT END & CONCLUSION PROCEDURE

Execute immediately upon competition countdown completion:

### 5.1 Stop Submissions & Freeze Scoreboard
- [ ] Transition competition state to `ended`:
  ```bash
  curl -s -X POST http://localhost/api/v1/admin/competition/end \
    -H "Authorization: Bearer <ADMIN_TOKEN>" | jq .
  ```

### 5.2 Terminate All Dynamic Challenge Containers
- [ ] Cleanly shut down all participant sandbox containers:
  ```bash
  docker ps -q --filter "name=techx26-inst" | xargs -r docker rm -f
  docker network prune -f
  ```

### 5.3 Export Final Official Leaderboard Standings
- [ ] Export JSON snapshot of final rankings:
  ```bash
  curl -s http://localhost/api/v1/leaderboard > ./backups/official_final_standings.json
  ```

### 5.4 Execute Final Official Database Backup
- [ ] Create official conclusion backup archive:
  ```bash
  ./scripts/backup_db.sh ./backups/final_competition_archive
  ```

### 5.5 Archive Audit Logs & Container Logs
- [ ] Export immutable audit records:
  ```bash
  docker compose exec -T postgres psql -U techx_ctf_user -d techx_ctf_db -c \
    "COPY audit_logs TO STDOUT WITH CSV HEADER" > ./backups/audit_logs_$(date +%Y%m%d).csv
  ```
- [ ] Export full container logs:
  ```bash
  docker compose logs > ./backups/full_platform_logs_$(date +%Y%m%d).log
  ```

### 5.6 Graceful Platform Teardown (Post-Verification)
- [ ] Stop all containers cleanly:
  ```bash
  docker compose down
  ```
