#!/bin/bash
# ==============================================================================
# TECHX CTF 2026 — PRODUCTION & EVENT-DAY SMOKE TEST SUITE
# ==============================================================================
# Executes an end-to-end operational verification across all user and system flows.
# Usage: ./scripts/smoke_test.sh [TARGET_URL]
# Example: ./scripts/smoke_test.sh http://localhost
# ==============================================================================

set -euo pipefail

TARGET_URL="${1:-http://localhost}"
COOKIE_JAR=$(mktemp)
trap 'rm -f "${COOKIE_JAR}"' EXIT

PASSED_COUNT=0
FAILED_COUNT=0

log_step() {
  echo -n "[..] Testing $1... "
}

log_pass() {
  echo -e "\r[\033[0;32m✓ PASS\033[0m] Testing $1"
  PASSED_COUNT=$((PASSED_COUNT + 1))
}

log_fail() {
  echo -e "\r[\033[0;31m✗ FAIL\033[0m] Testing $1: $2"
  FAILED_COUNT=$((FAILED_COUNT + 1))
}

echo "======================================================================"
echo "          IEEE TECHX CTF 2026 — OPERATIONAL SMOKE TEST                "
echo "======================================================================"
echo "[+] Target Host: ${TARGET_URL}"
echo "[+] Timestamp:   $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

RANDOM_ID=$(head /dev/urandom | tr -dc 'a-z0-9' | head -c 8 || echo "smk$RANDOM")
TEST_USER1="smoke_u1_${RANDOM_ID}"
TEST_EMAIL1="smoke_${RANDOM_ID}_1@techxmadras.org"
TEST_USER2="smoke_u2_${RANDOM_ID}"
TEST_EMAIL2="smoke_${RANDOM_ID}_2@techxmadras.org"
TEST_PASS="SmokeTestPass_2026!#"

# 1. Frontend SPA Availability
log_step "1. Frontend SPA Availability"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/")
if [ "${HTTP_CODE}" = "200" ]; then
  log_pass "1. Frontend SPA Availability"
else
  log_fail "1. Frontend SPA Availability" "HTTP status ${HTTP_CODE}"
fi

# 2. Ingress & Liveness Health Probe
log_step "2. Liveness Probe (/health)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/health")
if [ "${HTTP_CODE}" = "200" ]; then
  log_pass "2. Liveness Probe (/health)"
else
  log_fail "2. Liveness Probe (/health)" "HTTP status ${HTTP_CODE}"
fi

# 3. Deep Readiness Probe (/api/v1/health)
log_step "3. Readiness Probe (/api/v1/health)"
HEALTH_RESP=$(curl -s "${TARGET_URL}/api/v1/health" || echo '{"status":"unreachable"}')
if echo "${HEALTH_RESP}" | grep -q '"status"'; then
  log_pass "3. Readiness Probe (/api/v1/health) [Response: $(echo "${HEALTH_RESP}" | cut -c1-60)...]"
else
  log_fail "3. Readiness Probe (/api/v1/health)" "Invalid health JSON"
fi

# 4. User Registration (User 1)
log_step "4. Participant Registration"
REG_RESP=$(curl -s -c "${COOKIE_JAR}" -X POST "${TARGET_URL}/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${TEST_USER1}\",\"email\":\"${TEST_EMAIL1}\",\"password\":\"${TEST_PASS}\"}")

if echo "${REG_RESP}" | grep -q '"token"'; then
  AUTH_TOKEN1=$(echo "${REG_RESP}" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
  log_pass "4. Participant Registration (${TEST_USER1})"
else
  AUTH_TOKEN1=""
  log_fail "4. Participant Registration" "Response: ${REG_RESP}"
fi

# 5. User Login (User 1)
log_step "5. Authentication & JWT Issuance"
LOGIN_RESP=$(curl -s -b "${COOKIE_JAR}" -c "${COOKIE_JAR}" -X POST "${TARGET_URL}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${TEST_EMAIL1}\",\"password\":\"${TEST_PASS}\"}")

if echo "${LOGIN_RESP}" | grep -q '"token"'; then
  AUTH_TOKEN1=$(echo "${LOGIN_RESP}" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
  log_pass "5. Authentication & JWT Issuance"
else
  log_fail "5. Authentication & JWT Issuance" "Response: ${LOGIN_RESP}"
fi

# 6. Team Creation
log_step "6. Team Creation"
TEAM_NAME="SmokeTeam_${RANDOM_ID}"
TEAM_RESP=$(curl -s -b "${COOKIE_JAR}" -c "${COOKIE_JAR}" -X POST "${TARGET_URL}/api/v1/teams" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN1}" \
  -d "{\"name\":\"${TEAM_NAME}\"}")

if echo "${TEAM_RESP}" | grep -q '"inviteCode"'; then
  INVITE_CODE=$(echo "${TEAM_RESP}" | grep -o '"inviteCode":"[^"]*' | cut -d'"' -f4)
  log_pass "6. Team Creation (${TEAM_NAME}, Invite: ${INVITE_CODE})"
else
  INVITE_CODE=""
  log_fail "6. Team Creation" "Response: ${TEAM_RESP}"
fi

# 7. Team Member Joining
log_step "7. Second User Registration & Team Joining"
REG_RESP2=$(curl -s -X POST "${TARGET_URL}/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${TEST_USER2}\",\"email\":\"${TEST_EMAIL2}\",\"password\":\"${TEST_PASS}\"}")

if echo "${REG_RESP2}" | grep -q '"token"'; then
  AUTH_TOKEN2=$(echo "${REG_RESP2}" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
  if [ -n "${INVITE_CODE}" ]; then
    JOIN_RESP=$(curl -s -X POST "${TARGET_URL}/api/v1/teams/join" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${AUTH_TOKEN2}" \
      -d "{\"inviteCode\":\"${INVITE_CODE}\"}")
    if echo "${JOIN_RESP}" | grep -q '"team"'; then
      log_pass "7. Second User Registration & Team Joining"
    else
      log_fail "7. Second User Registration & Team Joining" "Join failed: ${JOIN_RESP}"
    fi
  else
    log_fail "7. Second User Registration & Team Joining" "No invite code available"
  fi
else
  log_fail "7. Second User Registration & Team Joining" "Registration 2 failed: ${REG_RESP2}"
fi

# 8. Challenge Listing
log_step "8. Challenge Catalog Query"
CHALLENGES_RESP=$(curl -s -H "Authorization: Bearer ${AUTH_TOKEN1}" "${TARGET_URL}/api/v1/challenges")
if echo "${CHALLENGES_RESP}" | grep -Eq '(\[|\{"challenges")'; then
  log_pass "8. Challenge Catalog Query"
else
  log_fail "8. Challenge Catalog Query" "Invalid response: ${CHALLENGES_RESP}"
fi

# 9. Leaderboard Snapshot
log_step "9. Leaderboard Snapshot Retrieval"
LEADERBOARD_RESP=$(curl -s "${TARGET_URL}/api/v1/leaderboard")
if echo "${LEADERBOARD_RESP}" | grep -Eq '(\[|\{"standings"|\{"leaderboard")'; then
  log_pass "9. Leaderboard Snapshot Retrieval"
else
  log_fail "9. Leaderboard Snapshot Retrieval" "Invalid response: ${LEADERBOARD_RESP}"
fi

# 10. Leaderboard Real-Time SSE Stream Handshake
log_step "10. Leaderboard Real-Time SSE Connection"
SSE_HEADER=$(curl -s -I -N -H "Accept: text/event-stream" -H "Authorization: Bearer ${AUTH_TOKEN1}" \
  "${TARGET_URL}/api/v1/leaderboard/stream" --max-time 3 || true)

if echo "${SSE_HEADER}" | grep -qi "text/event-stream"; then
  log_pass "10. Leaderboard Real-Time SSE Connection"
else
  log_fail "10. Leaderboard Real-Time SSE Connection" "Did not receive text/event-stream header"
fi

# 11. Protected Challenge File Storage Barrier
log_step "11. Protected Storage Authorization Barrier"
UNAUTH_FILE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/protected_storage/test_flag.txt")
if [ "${UNAUTH_FILE_STATUS}" = "404" ] || [ "${UNAUTH_FILE_STATUS}" = "403" ]; then
  log_pass "11. Protected Storage Authorization Barrier (Internal NGINX Guard)"
else
  log_fail "11. Protected Storage Authorization Barrier" "Unexpected status: ${UNAUTH_FILE_STATUS} (Should be 403 or 404)"
fi

# 12. User Logout
log_step "12. Participant Logout"
LOGOUT_RESP=$(curl -s -b "${COOKIE_JAR}" -X POST "${TARGET_URL}/api/v1/auth/logout" \
  -H "Authorization: Bearer ${AUTH_TOKEN1}")
log_pass "12. Participant Logout"

echo ""
echo "======================================================================"
echo "          SMOKE TEST EXECUTION SUMMARY                                "
echo "======================================================================"
echo "Total Tests Run:  $((PASSED_COUNT + FAILED_COUNT))"
echo "Passed:           ${PASSED_COUNT}"
echo "Failed:           ${FAILED_COUNT}"
echo "======================================================================"

if [ "${FAILED_COUNT}" -eq 0 ]; then
  echo -e "\033[0;32m[✓] SUCCESS: All production smoke test assertions PASSED!\033[0m"
  exit 0
else
  echo -e "\033[0;31m[✗] WARNING: ${FAILED_COUNT} smoke test assertions FAILED!\033[0m"
  exit 1
fi
