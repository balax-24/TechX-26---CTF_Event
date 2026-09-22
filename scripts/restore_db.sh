#!/bin/bash
# ==============================================================================
# TECHX CTF 2026 — DATABASE RESTORE SCRIPT
# ==============================================================================
# Restores a compressed PostgreSQL dump into the database container.
# Usage: ./scripts/restore_db.sh ./backups/techx_ctf_backup_YYYYMMDD_HHMMSS.sql.gz
# ==============================================================================

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "[-] Error: Please specify the backup file to restore."
  echo "    Usage: $0 <path_to_backup.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[-] Error: Backup file '${BACKUP_FILE}' not found."
  exit 1
fi

echo "[!] WARNING: This will overwrite the current 'techx_ctf_db' database!"
read -p "Are you sure you want to proceed? (yes/no): " CONFIRM
if [ "${CONFIRM}" != "yes" ]; then
  echo "[-] Restore cancelled."
  exit 0
fi

echo "[+] Restoring from ${BACKUP_FILE}..."

# Decompress and feed directly into psql
gunzip -c "${BACKUP_FILE}" | docker exec -i techx_ctf_postgres psql -U techx_ctf_user -d techx_ctf_db

echo "[✓] Database restoration completed successfully!"
