@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo ============================================================
echo  TECHX CTF 2026 -- LAN DEPLOYMENT INITIALIZATION
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

REM 6. Determine physical LAN IPv4 address (filtering out virtual/Docker/WSL adapters)
set "LAN_IP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.InterfaceAlias -notmatch 'Docker|vEthernet|WSL|Loopback' -and $_.IPAddress -notmatch '^169\.254\.' } | Select-Object -ExpandProperty IPAddress | Select-Object -First 1"`) do (
    set "LAN_IP=%%i"
)
if "%LAN_IP%"=="" (
    set "LAN_IP=127.0.0.1"
    echo [!] No physical LAN IPv4 detected; falling back to 127.0.0.1.
) else (
    echo [*] Detected LAN IPv4 Address: %LAN_IP%
)

set "PUBLIC_HOST=%LAN_IP%"
set "CORS_ORIGIN=http://localhost,http://127.0.0.1,http://%LAN_IP%,http://%LAN_IP%:80,*"

REM 7. Start the LAN production stack
echo [*] Launching TechX CTF LAN stack via Docker Compose...
docker compose -f "%~dp0docker-compose.yml" -f "%~dp0docker-compose.lan.yml" up -d --build
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to start Docker Compose stack!
    docker compose -f "%~dp0docker-compose.yml" -f "%~dp0docker-compose.lan.yml" ps
    pause
    exit /b 1
)

REM 8. Wait for core services to report healthy
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

REM 9. Run database migrations using existing migration command
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

REM 10. Test local HTTP endpoint before declaring success
echo [*] Verifying NGINX ingress probe...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1/health' -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -ne 200) { exit 1 } } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] Local HTTP endpoint probe failed on http://127.0.0.1/health!
    echo Container status:
    docker compose -f "%~dp0docker-compose.yml" -f "%~dp0docker-compose.lan.yml" ps
    echo.
    echo NGINX / Backend logs:
    docker compose -f "%~dp0docker-compose.yml" -f "%~dp0docker-compose.lan.yml" logs --tail=20 nginx backend
    pause
    exit /b 1
)

REM 11. Retrieve exact health status strings for display
for /f "usebackq delims=" %%s in (`docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" techx_ctf_postgres 2^>nul`) do set "PG_STATUS=%%s"
for /f "usebackq delims=" %%s in (`docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" techx_ctf_redis 2^>nul`) do set "REDIS_STATUS=%%s"
for /f "usebackq delims=" %%s in (`docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" techx_ctf_backend 2^>nul`) do set "BACKEND_STATUS=%%s"
for /f "usebackq delims=" %%s in (`docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" techx_challenge_gateway 2^>nul`) do set "GW_STATUS=%%s"
for /f "usebackq delims=" %%s in (`docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" techx_ctf_nginx 2^>nul`) do set "NGINX_STATUS=%%s"

REM Upper-case strings
if /i "!PG_STATUS!"=="healthy" set "PG_STATUS=HEALTHY"
if /i "!REDIS_STATUS!"=="healthy" set "REDIS_STATUS=HEALTHY"
if /i "!BACKEND_STATUS!"=="healthy" set "BACKEND_STATUS=HEALTHY"
if /i "!GW_STATUS!"=="healthy" set "GW_STATUS=HEALTHY"
if /i "!NGINX_STATUS!"=="healthy" set "NGINX_STATUS=HEALTHY"

cls
echo ============================================================
echo  TECHX CTF 2026 -- LAN SERVER
echo ============================================================
echo.
echo  STATUS: ONLINE
echo.
echo  PARTICIPANT URL:
echo  http://%LAN_IP%
echo.
echo  SERVER:
echo  %LAN_IP%
echo.
echo  ADMIN:
echo  http://%LAN_IP%/
echo.
echo  Docker:      RUNNING
echo  PostgreSQL:  !PG_STATUS!
echo  Redis:       !REDIS_STATUS!
echo  Backend:     !BACKEND_STATUS!
echo  Gateway:     !GW_STATUS!
echo  NGINX:       !NGINX_STATUS!
echo.
echo ============================================================
echo.
echo IMPORTANT:
echo.
echo Participants must be connected to the same LAN/network.
echo.
echo Use Ctrl+C only for this window if applicable.
echo To stop the platform run:
echo.
echo docker compose -f docker-compose.yml -f docker-compose.lan.yml down
echo.
echo ============================================================
echo.
echo Server is actively serving requests. Keep this window open.
pause >nul
