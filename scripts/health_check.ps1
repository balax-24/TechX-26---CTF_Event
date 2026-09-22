# ==============================================================================
# TECHX CTF 2026 — PRE-EVENT DIAGNOSTIC SCRIPT (POWERSHELL)
# ==============================================================================
# Usage: .\scripts\health_check.ps1 [-TargetUrl http://localhost]
# ==============================================================================

param (
    [string]$TargetUrl = "http://localhost"
)

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "          IEEE TECHX CTF 2026 — SYSTEM HEALTH DIAGNOSTIC               " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "[+] Checking target: $TargetUrl"
Write-Host ""

Write-Host "1. Checking Ingress Health Probe..." -ForegroundColor Yellow
try {
    $res = Invoke-RestMethod -Uri "$TargetUrl/health" -Method Get -TimeoutSec 5
    if ($res.status -eq "ok") {
        Write-Host "   [✓] Ingress & Liveness: HEALTHY" -ForegroundColor Green
    } else {
        Write-Host "   [✗] Ingress & Liveness: UNHEALTHY ($($res | ConvertTo-Json))" -ForegroundColor Red
    }
} catch {
    Write-Host "   [✗] Ingress & Liveness: FAILED (Cannot reach $TargetUrl/health)" -ForegroundColor Red
}

Write-Host ""
Write-Host "2. Checking Deep Readiness Probe (Database & Redis)..." -ForegroundColor Yellow
try {
    $res = Invoke-RestMethod -Uri "$TargetUrl/api/v1/health" -Method Get -TimeoutSec 5
    Write-Host "   Status: $($res.status)" -ForegroundColor ($res.status -eq 'ok' ? 'Green' : 'Yellow')
    Write-Host "   Database: $($res.services.database.status)"
    Write-Host "   Redis: $($res.services.redis.status)"
} catch {
    Write-Host "   [!] Readiness probe responded: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "3. Docker Container Status:" -ForegroundColor Yellow
docker ps --filter "name=techx_ctf" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
