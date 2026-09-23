#!/bin/bash
# ==============================================================================
# TECHX CTF 2026 — PRODUCTION SECRET GENERATOR
# ==============================================================================
# Generates cryptographically secure, high-entropy secrets for production deployment.
# Usage: ./scripts/generate_secrets.sh
# ==============================================================================

set -euo pipefail

ENV_FILE=".env"
ENV_TEMPLATE=".env.example"

echo "======================================================================"
echo "          IEEE TECHX CTF 2026 — SECRET GENERATION UTILITY             "
echo "======================================================================"

if [ -f "${ENV_FILE}" ]; then
  echo "[!] Existing '${ENV_FILE}' file detected."
  read -p "    Do you want to backup the existing file and generate a new one? (y/N): " CONFIRM
  if [[ ! "${CONFIRM}" =~ ^[Yy]$ ]]; then
    echo "[-] Secret generation aborted."
    exit 0
  fi
  BACKUP_ENV="${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
  cp "${ENV_FILE}" "${BACKUP_ENV}"
  echo "[✓] Backed up current environment to: ${BACKUP_ENV}"
fi

if [ ! -f "${ENV_TEMPLATE}" ]; then
  echo "[-] Error: Template '${ENV_TEMPLATE}' not found."
  exit 1
fi

echo "[+] Generating cryptographically secure random secrets..."

generate_token() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  fi
}

JWT_SECRET=$(generate_token)
COOKIE_SECRET=$(generate_token)
CHALLENGE_GATEWAY_SECRET=$(generate_token)
FLAG_SALT=$(generate_token)
DB_PASSWORD=$(generate_token)
REDIS_PASSWORD=$(generate_token)
ADMIN_BOOTSTRAP_PASSWORD=$(generate_token | cut -c1-24)

# Create .env from template with substituted secrets
sed \
  -e "s|<GENERATE_WITH_SCRIPTS_GENERATE_SECRETS_SH_MIN_32_CHARS>|${JWT_SECRET}|g" \
  -e "s|<GENERATE_WITH_SCRIPTS_GENERATE_SECRETS_SH_MIN_16_CHARS>|${FLAG_SALT}|g" \
  -e "s|<GENERATE_WITH_SCRIPTS_GENERATE_SECRETS_SH_STRONG_PASSWORD>|${DB_PASSWORD}|g" \
  -e "s|<SET_STRONG_ADMIN_PASSWORD_MIN_12_CHARS>|${ADMIN_BOOTSTRAP_PASSWORD}|g" \
  "${ENV_TEMPLATE}" > "${ENV_FILE}"

# Re-substitute specific distinct secrets
# In sed, replace first matching occurrence or update specifically
sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" "${ENV_FILE}"
sed -i.bak "s|^COOKIE_SECRET=.*|COOKIE_SECRET=${COOKIE_SECRET}|" "${ENV_FILE}"
sed -i.bak "s|^CHALLENGE_GATEWAY_SECRET=.*|CHALLENGE_GATEWAY_SECRET=${CHALLENGE_GATEWAY_SECRET}|" "${ENV_FILE}"
sed -i.bak "s|^FLAG_SALT=.*|FLAG_SALT=${FLAG_SALT}|" "${ENV_FILE}"
sed -i.bak "s|^DB_PASSWORD=.*|DB_PASSWORD=${DB_PASSWORD}|" "${ENV_FILE}"
sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://techx_ctf_user:${DB_PASSWORD}@postgres:5432/techx_ctf_db|" "${ENV_FILE}"
sed -i.bak "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=${REDIS_PASSWORD}|" "${ENV_FILE}"
sed -i.bak "s|^REDIS_URL=.*|REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0|" "${ENV_FILE}"
sed -i.bak "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${ADMIN_BOOTSTRAP_PASSWORD}|" "${ENV_FILE}"

rm -f "${ENV_FILE}.bak"

# Lock file permissions to current user only
chmod 600 "${ENV_FILE}" 2>/dev/null || true

echo "[✓] Successfully created '${ENV_FILE}' with high-entropy cryptographic secrets!"
echo "[✓] File permissions set to 600 (owner read/write only)."
echo ""
echo "[i] NOTICE:"
echo "    - Initial admin bootstrap password has been stored in .env (ADMIN_PASSWORD)."
echo "    - Run 'npm run bootstrap:admin' inside the backend container to provision."
echo "    - After provisioning, remove ADMIN_PASSWORD from .env."
echo "======================================================================"
