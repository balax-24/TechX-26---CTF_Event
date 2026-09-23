#!/bin/bash
# ==============================================================================
# TECHX CTF 2026 — DATABASE RESTORATION UTILITY
# ==============================================================================
# Restores an atomic PostgreSQL database dump into the active container.
# Usage: ./scripts/restore_db.sh <path_to_backup.sql.gz> [--force]
# ==============================================================================

set -euo pipefail

# Load environment variables if .env exists
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs -d '\n' 2>/dev/null || true)
fi

DB_USER="${DB_USER:-techx_ctf_user}"
DB_NAME="${RESTORE_DB:-${DB_NAME:-techx_ctf_db}}"
CONTAINER_NAME="techx_ctf_postgres"

if [ -z "${1:-}" ]; then
  echo "[-] Error: Please specify the backup file to restore."
  echo "    Usage: $0 <path_to_backup.sql.gz> [--force] [target_database]"
  exit 1
fi

BACKUP_FILE="$1"
FORCE="${2:-}"
if [ -n "${3:-}" ]; then
  DB_NAME="$3"
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[-] Error: Backup file '${BACKUP_FILE}' not found."
  exit 1
fi

echo "======================================================================"
echo "          IEEE TECHX CTF 2026 — DATABASE RESTORE                      "
echo "======================================================================"
echo "[+] Target Database: ${DB_NAME} (User: ${DB_USER})"
echo "[+] Source Backup:   ${BACKUP_FILE}"

# Validate gzip integrity before touching database
echo "[+] Verifying archive integrity..."
if ! gunzip -t "${BACKUP_FILE}"; then
  echo "[-] Error: Archive '${BACKUP_FILE}' is corrupt. Restore aborted."
  exit 1
fi

# Verify container is running and ready
if ! docker ps --format '{{.Names}}' | grep -Eq "^${CONTAINER_NAME}\$"; then
  echo "[-] Error: Database container '${CONTAINER_NAME}' is not running!"
  exit 1
fi

echo "[+] Checking PostgreSQL readiness..."
if ! docker exec -i "${CONTAINER_NAME}" pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; then
  echo "[-] Error: PostgreSQL is not ready to accept connections!"
  exit 1
fi

if [ "${FORCE}" != "--force" ]; then
  echo ""
  echo "[!] WARNING: THIS OPERATION WILL OVERWRITE ALL EXISTING TABLES AND DATA IN '${DB_NAME}'!"
  read -p "    Are you sure you want to proceed? (Type 'RESTORE' to confirm): " CONFIRM
  if [ "${CONFIRM}" != "RESTORE" ]; then
    echo "[-] Database restore cancelled."
    exit 0
  fi
fi

echo "[+] Pausing application traffic: Recommended to run 'docker compose stop backend' first."
echo "[+] Streaming SQL dump into PostgreSQL..."

# Decompress and pipe directly into psql
gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1

echo "[+] Verifying restored schema and core tables..."
TABLE_COUNT=$(docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
CORE_TABLES=$(docker exec -i "${CONTAINER_NAME}" psql -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users', 'teams', 'challenges', 'submissions', 'score_events');")

CORE_COUNT=$(echo "${CORE_TABLES}" | tr -d ' ')
if [ "${CORE_COUNT}" -lt 5 ]; then
  echo "[-] WARNING: Restored database is missing essential CTF core tables (found ${CORE_COUNT}/5)!"
  exit 1
fi

echo "[✓] Database restoration completed successfully!"
echo "[✓] Public tables detected post-restore: $(echo "${TABLE_COUNT}" | tr -d ' ')"
echo "[✓] Core CTF tables validated: ${CORE_COUNT}/5 (users, teams, challenges, submissions, score_events)"
echo "[i] Restart the backend container to reload caches: 'docker compose restart backend'"
echo "======================================================================"
