# TechX CTF 2026 — Event-Day Operations Runbook

This runbook is the rapid-reference checklist for event organizers and system operators during **TechX Madras CTF 2026**.

---

## 1. Pre-Event Checklist (T-3 Hours to T-0)

Print or keep this checklist open on the primary operations console:

- [ ] **1. Disk Space Verification**:
  Ensure at least 30 GB free space on `/` and `/var/lib/docker`:
  ```bash
  df -h / /var/lib/docker
  ```
- [ ] **2. Docker Engine Status**:
  ```bash
  sudo systemctl status docker
  docker version
  ```
- [ ] **3. Container Stack Health**:
  Ensure all 5 services are running and reporting healthy:
  ```bash
  docker compose ps
  ./scripts/health_check.sh http://localhost
  ```
- [ ] **4. PostgreSQL Readiness**:
  ```bash
  docker compose exec -T postgres pg_isready -U techx_ctf_user -d techx_ctf_db
  ```
- [ ] **5. Redis Cache & Bus Readiness**:
  ```bash
  docker compose exec -T redis redis-cli -a "${REDIS_PASSWORD}" ping
  # Expected: PONG
  ```
- [ ] **6. Challenge Gateway Status**:
  ```bash
  curl -s http://localhost:5000/health | jq
  ```
- [ ] **7. NGINX Reverse Proxy**:
  ```bash
  curl -I http://localhost/health
  # Expected: HTTP/1.1 200 OK
  ```
- [ ] **8. Admin Account Access**:
  Log into the Admin Portal (`/admin` or `POST /api/v1/auth/login`) with the bootstrapped superadmin credentials.
- [ ] **9. Pre-Event Clean Database Dump**:
  Take a fresh baseline backup:
  ```bash
  ./scripts/backup_db.sh ./backups/pre_event_baseline
  ```
- [ ] **10. Full Smoke Test Execution**:
  Run the automated smoke test script:
  ```bash
  ./scripts/smoke_test.sh http://localhost
  # Must report: [✓] SUCCESS: All production smoke test assertions PASSED!
  ```
- [ ] **11. Leaderboard & SSE Verification**:
  Open leaderboard in browser console. Confirm WebSocket/SSE connection opens and receives `initial_snapshot`.
- [ ] **12. Dynamic Challenge Launch Test**:
  Test launching 1 dynamic challenge from the test account, confirm container spins up and URL is reachable.

---

## 2. During-Event Monitoring (Competition In-Progress)

### Essential Monitoring Commands:

#### Host System Resource Utilization:
```bash
# Monitor CPU, Memory, and IO in real time
htop
# Or
docker stats --no-stream
```

#### Container Log Stream (Error Monitoring):
```bash
# Backend unhandled errors
docker compose logs -f --tail=20 backend | grep -iE 'error|fatal|exception'

# NGINX 4xx/5xx requests
docker compose logs -f --tail=20 nginx | grep -E '" [45][0-9]{2} '
```

#### Active PostgreSQL Database Connections & Pool:
```bash
docker compose exec -T postgres psql -U techx_ctf_user -d techx_ctf_db -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
```

#### Dynamic Challenge Container Count:
```bash
# Total running challenge containers (must not exceed MAX_GLOBAL_INSTANCES = 100)
docker ps --filter "name=techx26-inst" | wc -l
```

#### Periodic Event-Day Backup Schedule:
Execute every **60 minutes** during the competition:
```bash
./scripts/backup_db.sh ./backups/hourly
```

---

## 3. Emergency Incident Response Matrix

### Scenario A: Participant Authentication Outage (401 / 403 Spike)
1. Check token expiry in `.env` (`JWT_EXPIRES_IN=24h`).
2. Verify Redis session store is responsive: `docker compose exec -T redis redis-cli -a "${REDIS_PASSWORD}" ping`.
3. If token signing secret was altered, restart backend: `docker compose restart backend`.

### Scenario B: Leaderboard Freezes / Real-Time SSE Updates Stop
1. Check NGINX SSE proxy buffer settings: `proxy_buffering off` must be active in `nginx.conf`.
2. Check backend outbox worker status in logs: `docker compose logs --tail=50 backend | grep Outbox`.
3. Restart Redis and trigger outbox drain:
   ```bash
   docker compose restart redis
   docker compose restart backend
   ```

### Scenario C: PostgreSQL Outage / Connection Exhaustion
1. Check if active connections hit `max_connections=200`:
   ```bash
   docker compose exec -T postgres psql -U techx_ctf_user -d techx_ctf_db -c "SELECT count(*) FROM pg_stat_activity;"
   ```
2. Terminate idle connections if necessary:
   ```bash
   docker compose exec -T postgres psql -U techx_ctf_user -d techx_ctf_db -c \
     "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND age(clock_timestamp(), query_start) > interval '5 minutes';"
   ```
3. Restart postgres if unresponsive: `docker compose restart postgres`.

### Scenario D: Dynamic Challenge Quota Exhaustion (Global Cap Hit)
1. Check active containers: `docker ps --filter "name=techx26-inst" --format "table {{.Names}}\t{{.RunningFor}}"`.
2. Reconcile expired instances via gateway API:
   ```bash
   curl -X POST http://localhost:5000/reconcile \
     -H "x-gateway-secret: ${CHALLENGE_GATEWAY_SECRET}"
   ```
3. Prune dangling networks if needed: `docker network prune -f`.

### Scenario E: Host Disk Space Warning (> 85% full)
1. Inspect docker storage: `docker system df`.
2. Clean unused dangling build caches and images:
   ```bash
   docker image prune -f
   docker builder prune -f
   ```
3. Verify backups directory size: `du -sh ./backups`.

---

## 4. Post-Event Operations (Competition Conclusion)

Execute immediately upon competition countdown completion:

- [ ] **1. Freeze Competition & Scoreboard**:
  From Admin UI or via API, transition state to `frozen`:
  ```bash
  curl -X POST http://localhost/api/v1/admin/competition/freeze \
    -H "Authorization: Bearer <ADMIN_TOKEN>"
  ```
- [ ] **2. Halt Dynamic Challenge Instances**:
  Terminate all running dynamic challenge containers:
  ```bash
  docker ps -q --filter "name=techx26-inst" | xargs -r docker rm -f
  ```
- [ ] **3. Take Final Official Database Dump**:
  ```bash
  ./scripts/backup_db.sh ./backups/final_competition_results
  ```
- [ ] **4. Export Official Leaderboard Standings**:
  ```bash
  curl -s http://localhost/api/v1/leaderboard > ./backups/official_standings.json
  ```
- [ ] **5. Archive Container Logs**:
  ```bash
  docker compose logs > ./backups/full_event_logs_$(date +%Y%m%d).log
  ```
- [ ] **6. Graceful Platform Teardown**:
  ```bash
  docker compose down
  ```
