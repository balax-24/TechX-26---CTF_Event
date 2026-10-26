# TechX CTF 2026 — Windows One-Click Deployment Guide

This guide describes how to run and operate the **IEEE TechX CTF 2026** platform on Windows using the four automated operator `.bat` scripts located at the repository root.

---

## Architecture Overview

All scripts strictly maintain the authoritative, stage-hardened security topology:

```
Participant (LAN / Tunnel)
    │
    ▼ (Port 80 / HTTPS Tunnel)
[ NGINX Reverse Proxy ] (techx_ctf_nginx)
    │
    ▼ (Internal Docker Bridge: ctf_core_net)
[ Fastify Backend ] (techx_ctf_backend)
   ├──▶ [ PostgreSQL 16 ] (techx_ctf_postgres) — Relational State of Record
   ├──▶ [ Redis 7 ] (techx_ctf_redis) — Monotonic Cache & Pub/Sub
   │
   ▼ (Internal Docker Bridge: ctf_gateway_net)
[ Challenge Gateway ] (techx_challenge_gateway)
   └──▶ [ Dynamic Challenge Containers ] (Sandboxed Docker Network)
```

**Security Guarantees:**
- Only **NGINX** is exposed to participants.
- PostgreSQL, Redis, Backend, Gateway, and Docker Daemon are **never** exposed to host networks.
- Production secrets are generated cryptographically and never hardcoded.

---

## 1. `START_LAN.bat` — College LAN / In-Person Event

### Purpose
Double-click script to start the complete TechX CTF production stack on the event server/laptop and provide the exact URL for participants connected to the same Wi-Fi or Gigabit Ethernet switch.

### How to Run
Double-click `START_LAN.bat` in File Explorer, or open a terminal:
```cmd
START_LAN.bat
```

### What the Script Does Automatically:
1. **Preflight Check**: Verifies Docker CLI, Docker Desktop daemon, and Compose V2 are active.
2. **Configuration Validation**: Ensures `.env`, `docker-compose.yml`, and `docker-compose.lan.yml` are present with valid secrets.
3. **LAN IPv4 Detection**: Uses PowerShell to detect the server's active physical Ethernet/Wi-Fi IPv4 address (filtering out WSL, Docker, and loopback virtual adapters).
4. **Stack Launch**: Executes `docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build`.
5. **Health Wait**: Polls Docker container health checks until PostgreSQL, Redis, Gateway, Backend, and NGINX report healthy.
6. **Schema Migration**: Executes `docker compose exec -T backend npm run db:migrate`.
7. **Local Ingress Verification**: Tests `http://127.0.0.1/health` to guarantee NGINX is responding.
8. **Banner Display**: Shows service status and the exact URL participants must use.

### What Participants Receive:
Provide this URL to all in-person competitors:
```
http://<SERVER-LAN-IP>/
Example: http://172.20.10.2/
```

### Stopping the LAN Stack:
```cmd
docker compose -f docker-compose.yml -f docker-compose.lan.yml down
```

---

## 2. `START_PUBLIC.bat` — Remote / Hybrid Event (Cloudflare Tunnel)

### Purpose
Starts the production stack and exposes **only NGINX** through a secure Cloudflare Quick Tunnel (`trycloudflare.com`) so participants on home internet or external cellular networks can compete.

### How to Run
Double-click `START_PUBLIC.bat` in File Explorer, or run:
```cmd
START_PUBLIC.bat
```

### Prerequisites
Requires `cloudflared` (official Cloudflare Tunnel client). If not installed, the script provides copy-paste installation instructions:
- **Recommended**: `winget install --id Cloudflare.cloudflared`
- **Manual**: Download `cloudflared-windows-amd64.exe` from [Cloudflare Releases](https://github.com/cloudflare/cloudflared/releases/latest), rename to `cloudflared.exe`, and place in repository root.

### How It Works:
1. Starts the production Compose stack and verifies container health.
2. Starts a Cloudflare Quick Tunnel targeting `http://localhost:80` (NGINX).
3. Automatically captures the temporary `https://<subdomain>.trycloudflare.com` public URL.
4. Keeps the tunnel process active and reports status.

### What Participants Receive:
Provide this temporary HTTPS URL to remote competitors:
```
https://xxxxx.trycloudflare.com
```

### Stopping the Public Tunnel:
Press `Ctrl+C` in the `START_PUBLIC.bat` window. The script gracefully shuts down the tunnel process without affecting the database.

---

## 3. `SETUP_NEW_SYSTEM.bat` — Fresh Windows Machine Setup

### Purpose
Prepares a completely fresh Windows development or event machine after cloning the repository. Safe to run without destroying existing data or secrets.

### How to Run
```cmd
SETUP_NEW_SYSTEM.bat
```

### What the Script Executes:
1. **Tooling Preflight**: Verifies Git, Docker, Docker Compose, Node.js 20+, npm, and PowerShell.
2. **Repository Integrity**: Validates root manifests and service directories.
3. **Docker Engine**: Verifies or launches Docker Desktop and waits up to 60 seconds for the daemon.
4. **Secrets Provisioning**: If `.env` does not exist, runs `scripts\generate_secrets.ps1` to generate cryptographically secure keys. If `.env` already exists, leaves it intact.
5. **Node Dependencies**: Runs reproducible `npm ci` for both `backend` and `frontend`.
6. **Production Compilation**: Builds backend TypeScript (`tsc`) and frontend SPA bundle (`vite build`).
7. **Container Images**: Validates Compose files and builds all Docker images.
8. **Database Initialization**: Starts core infrastructure and applies PostgreSQL schema migrations.
9. **Health Diagnostics**: Probes NGINX and backend liveness.
10. **Regression Testing**: Runs the complete unit test suites (`backend` + `frontend`).

---

---

## 4. `REGISTER_TEAM.bat` — One-Click Team & Participant Provisioning

### Purpose
Allows the event organizer to quickly provision one competition team and its participant account directly from Windows without opening the admin web UI.

### Security Guarantees
- **Zero Direct Database Exposure**: Does NOT connect directly to PostgreSQL from Windows.
- **Authoritative Business Logic**: Reuses existing `AdminService.provisionTeamWithParticipant` and OWASP Argon2id password hashing inside the backend container.
- **Single Atomic Transaction**: Team creation, participant account creation, team membership assignment (as captain), and audit logs are committed together or rolled back completely on any failure.
- **No Plaintext Passwords**: Password input is masked in the terminal with asterisks, never stored in environment variables, temporary files, logs, or command history, and passed securely to the container over stdin.
- **Duplicate Protection**: Prevents duplicate team names, emails, and derived usernames.

### Example Workflow:

1. Start the server:
```cmd
START_LAN.bat
```
*(or `START_PUBLIC.bat` for remote competitions)*

2. Run:
```cmd
REGISTER_TEAM.bat
```

3. Enter:
```
Team:
TECHX_SENTINELS

Email:
sentinel@example.com

Password:
<secure password>
```

4. Give the participant their credentials.

5. Participant opens the URL printed by `START_LAN.bat` (e.g., `http://172.20.10.2/`).

6. Participant selects **SIGN IN**.

7. Participant enters their provisioned credentials.

8. Participant enters the CTF.

---

## 5. Initial Event Administration & Bootstrapping

Once the stack is running via `START_LAN.bat` or `START_PUBLIC.bat`, provision the initial Event Superadmin account:

```cmd
docker compose -f docker-compose.yml -f docker-compose.lan.yml exec -T ^
  -e ADMIN_USERNAME="techx_admin" ^
  -e ADMIN_EMAIL="admin@techxmadras.org" ^
  -e ADMIN_PASSWORD="YourStrongAdminPassword2026!#" ^
  backend npm run bootstrap:admin
```

After provisioning, log in at the participant URL using your admin credentials to access the Admin Control Plane (`/api/v1/admin/...`) for team and participant provisioning.

---

## 6. Summary Cheat Sheet

| Task | Command | Target Audience |
|---|---|---|
| **Start LAN Event** | `START_LAN.bat` | In-person venue (Gigabit LAN / Wi-Fi) |
| **Start Remote Event** | `START_PUBLIC.bat` | Remote participants (Cloudflare HTTPS tunnel) |
| **Provision Team & Account** | `REGISTER_TEAM.bat` | Event organizer (one-click participant onboarding) |
| **Fresh Machine Setup** | `SETUP_NEW_SYSTEM.bat` | Event coordinator / initial server setup |
| **Stop Event Stack** | `docker compose -f docker-compose.yml -f docker-compose.lan.yml down` | Event teardown |
| **View Live Logs** | `docker compose logs -f --tail=50 backend nginx` | Diagnostics & monitoring |
| **Backup Database** | `powershell -File scripts\backup_db.ps1` or `./scripts/backup_db.sh` | Periodic event snapshots |
