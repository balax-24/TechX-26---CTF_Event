#!/bin/bash
# ==============================================================================
# TECHX CTF 2026 — PRE-EVENT DIAGNOSTIC SCRIPT (BASH)
# ==============================================================================
# Verifies container states, API responsiveness, database & cache connectivity.
# Usage: ./scripts/health_check.sh
# ==============================================================================

set -euo pipefail

TARGET_URL="${1:-http://localhost}"

echo "======================================================================"
echo "          IEEE TECHX CTF 2026 — SYSTEM HEALTH DIAGNOSTIC               "
echo "======================================================================"
echo "[+] Checking target: ${TARGET_URL}"
echo ""

echo "1. Checking Ingress Health Probe..."
if curl -sf "${TARGET_URL}/health" > /dev/null; then
  echo "   [✓] Ingress & Liveness: HEALTHY"
else
  echo "   [✗] Ingress & Liveness: FAILED (Cannot connect to ${TARGET_URL}/health)"
fi

echo ""
echo "2. Checking Deep Readiness Probe (Database & Redis)..."
RESPONSE=$(curl -s "${TARGET_URL}/api/v1/health" || echo '{"status":"unreachable"}')
echo "   Response: ${RESPONSE}"

echo ""
echo "3. Docker Container Status:"
docker ps --filter "name=techx_ctf" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "======================================================================"
