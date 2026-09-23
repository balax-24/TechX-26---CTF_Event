#!/bin/bash
# ==============================================================================
# TECHX CTF 2026 — DATABASE BACKUP UTILITY
# ==============================================================================
# Creates an atomic, compressed PostgreSQL database dump with integrity validation.
# Usage: ./scripts/backup_db.sh [optional_target_directory]
# ==============================================================================

set -euo pipefail

# Load environment variables if .env exists
if [ -f ".env" ]; then
  # Source non-commented exportable lines safely
  export $(grep -v '^#' .env | xargs -d '\n' 2>/dev/null || true)
fi

DB_USER="${DB_USER:-techx_ctf_user}"
DB_NAME="${DB_NAME:-techx_ctf_db}"
CONTAINER_NAME="techx_ctf_postgres"

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/techx_ctf_backup_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "======================================================================"
echo "          IEEE TECHX CTF 2026 — DATABASE BACKUP                        "
echo "======================================================================"
echo "[+] Target Database: ${DB_NAME} (User: ${DB_USER})"
echo "[+] Destination:     ${BACKUP_FILE}"

# Verify container is running
if ! docker ps --format '{{.Names}}' | grep -Eq "^${CONTAINER_NAME}\$"; then
  echo "[-] Error: Database container '${CONTAINER_NAME}' is not running!"
  exit 1
fi

echo "[+] Executing pg_dump inside container..."

# Use -i (interactive, without TTY -t) to prevent binary stream corruption
docker exec -i "${CONTAINER_NAME}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists | gzip > "${BACKUP_FILE}"

# Verify dump file was created and is non-empty
if [ ! -s "${BACKUP_FILE}" ]; then
  echo "[-] Error: Backup file is empty or was not created!"
  rm -f "${BACKUP_FILE}"
  exit 1
fi

# Validate gzip integrity
echo "[+] Validating backup archive integrity..."
if ! gunzip -t "${BACKUP_FILE}"; then
  echo "[-] Error: Backup archive failed integrity verification!"
  exit 1
fi

FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[✓] Backup completed and verified successfully!"
echo "[✓] Backup file size: ${FILE_SIZE}"

# Enforce backup retention quota to prevent unlimited disk consumption
MAX_BACKUPS="${MAX_BACKUPS:-20}"
BACKUP_COUNT=$(ls -1 "${BACKUP_DIR}"/techx_ctf_backup_*.sql.gz 2>/dev/null | wc -l || echo 0)
if [ "${BACKUP_COUNT}" -gt "${MAX_BACKUPS}" ]; then
  EXCESS=$((BACKUP_COUNT - MAX_BACKUPS))
  echo "[+] Enforcing retention policy: pruning ${EXCESS} oldest backup(s) (max: ${MAX_BACKUPS})..."
  ls -1t "${BACKUP_DIR}"/techx_ctf_backup_*.sql.gz | tail -n "${EXCESS}" | xargs rm -f
fi

echo "[i] CRITICAL: Copy this backup to an external drive or offline storage before the event."
echo "======================================================================"
