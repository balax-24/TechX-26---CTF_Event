# TechX CTF 2026 — Quickstart Deployment Guide

This cheat sheet contains the exact, copy-paste commands to deploy and operate the **IEEE TechX Madras CTF 2026** platform.

---

## OPTION A: Deploy Locally in Docker (Test / Demo / Laptop)

Use this mode when testing on your development laptop, running a dry-run demo, or using Docker Desktop.

### Step 1: Generate Secrets
```bash
# On Linux / macOS / Git Bash:
chmod +x ./scripts/*.sh
./scripts/generate_secrets.sh

# Or on Windows PowerShell:
.\scripts\generate_secrets.ps1
```

### Step 2: Build & Start All Containers
```bash
docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build
```

### Step 3: Run Database Migrations
```bash
docker compose exec -T backend npm run db:migrate
```

### Step 4: Bootstrap Platform Administrator Account
```bash
docker compose exec -T \
  -e ADMIN_USERNAME="techx_admin" \
  -e ADMIN_EMAIL="admin@techxmadras.org" \
  -e ADMIN_PASSWORD="MySecureAdminPass2026!#" \
  backend npm run bootstrap:admin
```

### Step 5: Verify Health & Run Smoke Test
```bash
# 1. Quick health check probe:
curl http://localhost/health

# 2. Automated end-to-end smoke test:
./scripts/smoke_test.sh http://localhost
```

Open your browser and navigate to:
**`http://localhost`**

---

## OPTION B: Deploy on Physical Event Server (Ubuntu Linux / College LAN)

Use this mode on the actual event server connected to the Gigabit Ethernet switch.

### Step 1: Clone Repository
```bash
sudo mkdir -p /opt/techx-ctf
sudo chown -R $USER:$USER /opt/techx-ctf
git clone https://github.com/balax-24/TechX-26---CTF_Event.git /opt/techx-ctf
cd /opt/techx-ctf
```

### Step 2: Make Scripts Executable & Generate Cryptographic Secrets
```bash
chmod +x ./scripts/*.sh
./scripts/generate_secrets.sh
```

### Step 3: Configure Server's Physical LAN IP
Find your Ethernet IP (`ip addr show` or `ifconfig`, e.g., `192.168.1.50`):
```bash
# Replace 192.168.1.50 with your server's actual static Ethernet IP:
sed -i 's|^PUBLIC_HOST=.*|PUBLIC_HOST=192.168.1.50|' .env
sed -i 's|^DEPLOYMENT_MODE=.*|DEPLOYMENT_MODE=lan|' .env
```

### Step 4: Build & Launch Container Stack
```bash
docker compose -f docker-compose.yml -f docker-compose.lan.yml up -d --build
```

### Step 5: Apply Database Migrations
```bash
docker compose exec -T backend npm run db:migrate
```

### Step 6: Provision Event Superadmin Account
```bash
docker compose exec -T \
  -e ADMIN_USERNAME="techx_admin" \
  -e ADMIN_EMAIL="admin@techxmadras.org" \
  -e ADMIN_PASSWORD="SetYourActualStrongPasswordHere123!" \
  backend npm run bootstrap:admin
```

### Step 7: Create Pre-Event Baseline Backup & Run Smoke Test
```bash
# 1. Take clean baseline database backup:
./scripts/backup_db.sh ./backups/pre_event_baseline

# 2. Execute automated smoke verification:
./scripts/smoke_test.sh http://localhost
```

Participants can now connect over the LAN Ethernet switch at:
**`http://192.168.1.50/`**

---

## OPTION C: Deploy on Public VPS (Cloud with HTTPS / SSL)

### Step 1: Place SSL Certificates
```bash
mkdir -p docker/nginx/ssl
# Copy your Let's Encrypt certificates:
# fullchain.pem -> docker/nginx/ssl/fullchain.pem
# privkey.pem   -> docker/nginx/ssl/privkey.pem
```

### Step 2: Configure Environment
```bash
sed -i 's|^PUBLIC_HOST=.*|PUBLIC_HOST=ctf.yourdomain.org|' .env
sed -i 's|^PUBLIC_PROTOCOL=.*|PUBLIC_PROTOCOL=https|' .env
sed -i 's|^DEPLOYMENT_MODE=.*|DEPLOYMENT_MODE=production|' .env
```

### Step 3: Launch with Production Compose
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose exec -T backend npm run db:migrate
```

---

## ESSENTIAL OPERATIONAL COMMANDS

### Check Stack Status
```bash
docker compose ps
docker stats --no-stream
```

### View Live Logs
```bash
# Backend application logs
docker compose logs -f --tail=50 backend

# NGINX web server access & error logs
docker compose logs -f --tail=50 nginx

# Challenge Gateway (Docker manager) logs
docker compose logs -f --tail=50 challenge_gateway
```

### Event Database Backups
```bash
# Take an on-demand verified backup:
./scripts/backup_db.sh

# Hourly event backup:
./scripts/backup_db.sh ./backups/hourly
```

### Emergency Database Restore
```bash
# 1. Stop backend to halt writes:
docker compose stop backend

# 2. Restore from backup archive:
./scripts/restore_db.sh ./backups/techx_ctf_backup_YYYYMMDD_HHMMSS.sql.gz --force

# 3. Restart backend:
docker compose start backend
```

### Graceful Teardown After Event
```bash
# Take final database archive:
./scripts/backup_db.sh ./backups/final_event_archive

# Stop all containers:
docker compose down
```
