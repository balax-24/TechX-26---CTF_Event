#!/bin/bash
# ==============================================================================
# TECHX CTF 2026 — DATABASE BACKUP SCRIPT
# ==============================================================================
# Creates an atomic compressed PostgreSQL dump tagged with timestamp.
# Usage: ./scripts/backup_db.sh
# ==============================================================================

set -euo pipefail

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/techx_ctf_backup_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[+] Starting TechX CTF PostgreSQL backup..."
echo "[+] Target: ${BACKUP_FILE}"

# Execute pg_dump inside the running postgres container
docker exec -t techx_ctf_postgres pg_dump -U techx_ctf_user -d techx_ctf_db | gzip > "${BACKUP_FILE}"

echo "[✓] Backup completed successfully! File size: $(du -h "${BACKUP_FILE}" | cut -f1)"
echo "[i] Keep this backup safe on external media."
