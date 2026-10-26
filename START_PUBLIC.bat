@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo ============================================================
echo  TECHX CTF 2026 -- PUBLIC TUNNEL INITIALIZATION
echo ============================================================
echo.

REM 1. Verify Docker CLI is installed
where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not installed or not available on PATH.
    echo Please install Docker Desktop for Windows:
    echo   https://www.docker.com/products/docker-desktop/
    echo.
    pause
    exit /b 1
)

REM 2. Verify Docker Daemon is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker daemon / Docker Desktop is not running!
    echo Please start Docker Desktop and wait until the engine is ready.
    echo.
    pause
    exit /b 1
)

REM 3. Verify Docker Compose plugin is available
docker compose version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Compose is not available.
    echo Ensure Docker Desktop is updated and Compose V2 is enabled.
    echo.
    pause
    exit /b 1
)

REM 4. Verify Compose configuration files exist
if not exist "%~dp0docker-compose.yml" (
    echo [ERROR] Missing docker-compose.yml in %~dp0
    pause
    exit /b 1
)
if not exist "%~dp0docker-compose.lan.yml" (
    echo [ERROR] Missing docker-compose.lan.yml in %~dp0
    pause
    exit /b 1
)

REM 5. Verify required environment configuration
if not exist "%~dp0.env" (
    echo.
    echo [ERROR] Missing required .env configuration file!
    echo The production secret and configuration system requires a valid .env file.
    echo.
    echo To generate cryptographically secure secrets, run:
    echo   powershell -ExecutionPolicy Bypass -File "%~dp0scripts\generate_secrets.ps1"
    echo.
    echo Or copy .env.example to .env and configure production secrets.
    echo.
    pause
    exit /b 1
)

REM Check for ungenerated placeholders
findstr /c:"<GENERATE_" "%~dp0.env" >nul 2>&1
if not errorlevel 1 (
    echo.
    echo [ERROR] Unset placeholder secrets detected in .env!
    echo To provision valid cryptographic keys, run:
    echo   powershell -ExecutionPolicy Bypass -File "%~dp0scripts\generate_secrets.ps1"
    echo.
    pause
    exit /b 1
)

REM 6. Verify cloudflared executable is available
set "CLOUDFLARED_BIN="
where cloudflared >nul 2>&1
if not errorlevel 1 (
    set "CLOUDFLARED_BIN=cloudflared"
) else if exist "%~dp0cloudflared.exe" (
    set "CLOUDFLARED_BIN=%~dp0cloudflared.exe"
)

if not "%CLOUDFLARED_BIN%"=="" goto CLOUDFLARED_FOUND

echo.
echo ============================================================
echo  CLOUDFLARE TUNNEL [cloudflared] IS NOT INSTALLED
echo ============================================================
echo.
echo  START_PUBLIC.bat requires cloudflared to create an external
echo  secure HTTPS tunnel to NGINX for remote participants.
echo.
echo  INSTALLATION OPTIONS:
echo.
echo  Option 1 [Recommended Windows Package Manager]:
echo    winget install --id Cloudflare.cloudflared
echo.
echo  Option 2 [Official Cloudflare Binary Download]:
echo    Download cloudflared-windows-amd64.exe from:
echo    https://github.com/cloudflare/cloudflared/releases/latest
echo    Rename to cloudflared.exe and place in this directory:
echo    %~dp0
echo.
echo ============================================================
echo.
pause
exit /b 1

:CLOUDFLARED_FOUND

REM 7. Determine physical LAN IPv4 address
set "LAN_IP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.InterfaceAlias -notmatch 'Docker|vEthernet|WSL|Loopback' -and $_.IPAddress -notmatch '^169\.254\.' } | Select-Object -ExpandProperty IPAddress | Select-Object -First 1"`) do (
    set "LAN_IP=%%i"
)
if "%LAN_IP%"=="" set "LAN_IP=127.0.0.1"

set "PUBLIC_HOST=%LAN_IP%"
set "CORS_ORIGIN=http://localhost,http://127.0.0.1,http://%LAN_IP%,http://%LAN_IP%:80,*"

REM 8. Start the production container stack
echo [*] Launching TechX CTF container stack via Docker Compose...
docker compose -f "%~dp0docker-compose.yml" -f "%~dp0docker-compose.lan.yml" up -d --build
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to start Docker Compose stack!
    docker compose -f "%~dp0docker-compose.yml" -f "%~dp0docker-compose.lan.yml" ps
    pause
    exit /b 1
)

REM 9. Wait for core services to report healthy
echo [*] Waiting for services to become healthy...
set /a ATTEMPTS=0
:WAIT_HEALTH
set /a ATTEMPTS+=1
set "ALL_HEALTHY=1"

for %%c in (techx_ctf_postgres techx_ctf_redis techx_challenge_gateway techx_ctf_backend techx_ctf_nginx) do (
    for /f "usebackq delims=" %%s in (`docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" %%c 2^>nul`) do (
        if not "%%s"=="healthy" (
            if not "%%s"=="running" set "ALL_HEALTHY=0"
        )
    )
)

if "!ALL_HEALTHY!"=="1" goto HEALTHY_READY
if !ATTEMPTS! GEQ 30 (
    echo [!] Services taking longer than expected to stabilize. Proceeding to migration...
    goto HEALTHY_READY
)
timeout /t 2 >nul 2>&1
goto WAIT_HEALTH

:HEALTHY_READY

REM 10. Run database migrations using existing migration command
echo [*] Applying database migrations...
docker compose -f "%~dp0docker-compose.yml" -f "%~dp0docker-compose.lan.yml" exec -T backend npm run db:migrate
if errorlevel 1 (
    echo.
    echo [ERROR] Database migration failed!
    echo Check backend logs:
    docker compose -f "%~dp0docker-compose.yml" -f "%~dp0docker-compose.lan.yml" logs --tail=30 backend
    pause
    exit /b 1
)

REM 11. Verify local HTTP endpoint before starting tunnel
echo [*] Verifying NGINX ingress probe...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1/health' -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -ne 200) { exit 1 } } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] Local HTTP endpoint probe failed on http://127.0.0.1/health!
    pause
    exit /b 1
)

REM 12. Determine NGINX host port from .env or default 80
set "NGINX_PORT=80"
for /f "tokens=2 delims==" %%p in ('findstr /b "PUBLIC_PORT=" "%~dp0.env" 2^>nul') do (
    set "NGINX_PORT=%%p"
)

echo [*] Initializing Cloudflare Quick Tunnel on port %NGINX_PORT%...
echo [*] Waiting for temporary public HTTPS URL...

REM 13. Run Cloudflare Tunnel via PowerShell helper to parse trycloudflare.com URL and manage process lifecycle
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$port = '%NGINX_PORT%';" ^
    "$cfBin = '%CLOUDFLARED_BIN%';" ^
    "$lanIp = '%LAN_IP%';" ^
    "$psi = New-Object System.Diagnostics.ProcessStartInfo;" ^
    "$psi.FileName = $cfBin;" ^
    "$psi.Arguments = 'tunnel --url http://localhost:' + $port;" ^
    "$psi.RedirectStandardError = $true;" ^
    "$psi.UseShellExecute = $false;" ^
    "$psi.CreateNoWindow = $true;" ^
    "$proc = [System.Diagnostics.Process]::Start($psi);" ^
    "$tunnelUrl = $null;" ^
    "try {" ^
    "    while (-not $proc.HasExited -and -not $tunnelUrl) {" ^
    "        $line = $proc.StandardError.ReadLine();" ^
    "        if ($line -match '(https://[-a-zA-Z0-9]+\.trycloudflare\.com)') {" ^
    "            $tunnelUrl = $matches[1];" ^
    "            break;" ^
    "        }" ^
    "    }" ^
    "    if (-not $tunnelUrl) {" ^
    "        Write-Host '[ERROR] Failed to obtain Cloudflare Tunnel URL.' -ForegroundColor Red;" ^
    "        exit 1;" ^
    "    }" ^
    "    Clear-Host;" ^
    "    Write-Host '============================================================' -ForegroundColor Cyan;" ^
    "    Write-Host ' TECHX CTF 2026 -- PUBLIC SERVER' -ForegroundColor Cyan;" ^
    "    Write-Host '============================================================' -ForegroundColor Cyan;" ^
    "    Write-Host '';" ^
    "    Write-Host ' STATUS: ONLINE' -ForegroundColor Green;" ^
    "    Write-Host '';" ^
    "    Write-Host ' PARTICIPANT PUBLIC URL:' -ForegroundColor Yellow;" ^
    "    Write-Host ' ' $tunnelUrl -ForegroundColor Yellow;" ^
    "    Write-Host '';" ^
    "    Write-Host '============================================================' -ForegroundColor Cyan;" ^
    "    Write-Host 'Participants on OTHER networks can use this URL.';" ^
    "    Write-Host '';" ^
    "    Write-Host 'Local URL:';" ^
    "    Write-Host ('http://localhost:' + $port + '/');" ^
    "    Write-Host '';" ^
    "    Write-Host 'LAN URL:';" ^
    "    Write-Host ('http://' + $lanIp + ':' + $port + '/');" ^
    "    Write-Host '';" ^
    "    Write-Host '============================================================' -ForegroundColor Cyan;" ^
    "    Write-Host 'SECURITY:';" ^
    "    Write-Host '';" ^
    "    Write-Host 'Only NGINX is publicly reachable through the tunnel.';" ^
    "    Write-Host '';" ^
    "    Write-Host 'PostgreSQL: NOT EXPOSED' -ForegroundColor Green;" ^
    "    Write-Host 'Redis:      NOT EXPOSED' -ForegroundColor Green;" ^
    "    Write-Host 'Backend:    NOT EXPOSED' -ForegroundColor Green;" ^
    "    Write-Host 'Gateway:    NOT EXPOSED' -ForegroundColor Green;" ^
    "    Write-Host 'Docker API: NOT EXPOSED' -ForegroundColor Green;" ^
    "    Write-Host 'Challenges: NOT EXPOSED' -ForegroundColor Green;" ^
    "    Write-Host '';" ^
    "    Write-Host '============================================================' -ForegroundColor Cyan;" ^
    "    Write-Host 'NOTE: TEMPORARY PUBLIC EVENT URL (Quick Tunnel)' -ForegroundColor Magenta;" ^
    "    Write-Host 'This URL remains active while this window is open.' -ForegroundColor White;" ^
    "    Write-Host 'Press Ctrl+C to disconnect the public tunnel.' -ForegroundColor Gray;" ^
    "    Write-Host '============================================================' -ForegroundColor Cyan;" ^
    "    while (-not $proc.HasExited) {" ^
    "        Start-Sleep -Seconds 1;" ^
    "    }" ^
    "} finally {" ^
    "    if ($proc -and -not $proc.HasExited) {" ^
    "        $proc.Kill();" ^
    "    }" ^
    "    Write-Host '[!] Cloudflare Tunnel disconnected. Public URL is offline.' -ForegroundColor Yellow;" ^
    "}"

pause
