@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo ============================================================
echo  TECHX CTF 2026 -- FRESH SYSTEM SETUP & VERIFICATION
echo ============================================================
echo.

REM ------------------------------------------------------------
REM STEP 1 -- PREFLIGHT CHECKS
REM ------------------------------------------------------------
echo [1/10] Verifying required system tools and versions...

REM Git
where git >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not installed or not available on PATH.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('git --version 2^>nul') do echo   %%v

REM Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed or not available on PATH.
    echo Please install Node.js 20+ LTS: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do echo   Node.js: %%v

REM npm
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not installed or not available on PATH.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('npm --version 2^>nul') do echo   npm: v%%v

REM PowerShell
where powershell >nul 2>&1
if errorlevel 1 (
    echo [ERROR] PowerShell is not available.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('powershell -NoProfile -Command "$PSVersionTable.PSVersion.ToString()" 2^>nul') do echo   PowerShell: v%%v

REM Docker CLI
where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker CLI is not installed or not available on PATH.
    echo Please install Docker Desktop: https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('docker --version 2^>nul') do echo   %%v

REM Docker Compose
docker compose version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Compose plugin is not available.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('docker compose version 2^>nul') do echo   %%v

echo.

REM ------------------------------------------------------------
REM STEP 2 -- REPOSITORY INTEGRITY
REM ------------------------------------------------------------
echo [2/10] Checking repository layout...
if not exist "%~dp0package.json" (
    echo "Run this script from the cloned TechX CTF repository."
    pause
    exit /b 1
)
if not exist "%~dp0docker-compose.yml" (
    echo "Run this script from the cloned TechX CTF repository."
    pause
    exit /b 1
)
if not exist "%~dp0backend" (
    echo "Run this script from the cloned TechX CTF repository."
    pause
    exit /b 1
)
if not exist "%~dp0frontend" (
    echo "Run this script from the cloned TechX CTF repository."
    pause
    exit /b 1
)
echo   [OK] TechX CTF repository verified.
echo.

REM ------------------------------------------------------------
REM STEP 3 -- DOCKER DAEMON VERIFICATION
REM ------------------------------------------------------------
echo [3/10] Verifying Docker daemon status...
docker info >nul 2>&1
if errorlevel 1 (
    if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
        echo   [*] Launching Docker Desktop...
        start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
        echo   [*] Waiting for Docker engine to become responsive (up to 60s)...
        for /L %%i in (1,1,30) do (
            docker info >nul 2>&1 && goto DOCKER_ACTIVE
            timeout /t 2 >nul 2>&1
        )
    )
)
:DOCKER_ACTIVE
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker daemon is not running!
    echo Please start Docker Desktop and wait until it is ready, then rerun this script.
    pause
    exit /b 1
)
echo   [OK] Docker engine is running.
echo.

REM ------------------------------------------------------------
REM STEP 4 -- ENVIRONMENT CONFIGURATION
REM ------------------------------------------------------------
echo [4/10] Checking environment configuration (.env)...
if not exist "%~dp0.env" (
    echo   [*] No existing .env file detected.
    echo   [*] Running official cryptographic secret generator...
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\generate_secrets.ps1"
    if not exist "%~dp0.env" (
        echo [ERROR] Secret generation was aborted or failed.
        echo A valid .env file is mandatory to proceed.
        pause
        exit /b 1
    )
    echo   [OK] Fresh cryptographic secrets provisioned into .env.
) else (
    echo   [OK] Existing .env detected. Preserving existing secrets.
)
echo.

REM ------------------------------------------------------------
REM STEP 5 -- INSTALL NODE DEPENDENCIES
REM ------------------------------------------------------------
echo [5/10] Installing Node.js project dependencies...

echo   [*] Installing backend dependencies...
cd /d "%~dp0backend"
if exist package-lock.json (
    call npm ci
) else (
    call npm install
)
if errorlevel 1 (
    echo [ERROR] Backend dependency installation failed!
    cd /d "%~dp0"
    pause
    exit /b 1
)

echo   [*] Installing frontend dependencies...
cd /d "%~dp0frontend"
if exist package-lock.json (
    call npm ci
) else (
    call npm install
)
if errorlevel 1 (
    echo [ERROR] Frontend dependency installation failed!
    cd /d "%~dp0"
    pause
    exit /b 1
)
cd /d "%~dp0"
echo   [OK] Dependencies installed successfully.
echo.

REM ------------------------------------------------------------
REM STEP 6 -- PRODUCTION BUILDS
REM ------------------------------------------------------------
echo [6/10] Running production builds...

echo   [*] Compiling backend TypeScript...
cd /d "%~dp0backend"
call npm run build
if errorlevel 1 (
    echo [ERROR] Backend TypeScript build failed!
    cd /d "%~dp0"
    pause
    exit /b 1
)

echo   [*] Building frontend production SPA bundle...
cd /d "%~dp0frontend"
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend production build failed!
    cd /d "%~dp0"
    pause
    exit /b 1
)
cd /d "%~dp0"
echo   [OK] Production builds compiled clean.
echo.

REM ------------------------------------------------------------
REM STEP 7 -- DOCKER COMPOSE BUILD
REM ------------------------------------------------------------
echo [7/10] Validating and building Docker containers...

echo   [*] Validating Docker Compose configuration...
docker compose -f "%~dp0docker-compose.yml" -f "%~dp0docker-compose.lan.yml" config --quiet
if errorlevel 1 (
    echo [ERROR] Docker Compose configuration validation failed!
    pause
    exit /b 1
)

echo   [*] Building container images...
docker compose -f "%~dp0docker-compose.yml" -f "%~dp0docker-compose.lan.yml" build
if errorlevel 1 (
    echo [ERROR] Docker Compose image build failed!
    pause
    exit /b 1
)
echo   [OK] Container images built successfully.
echo.

REM ------------------------------------------------------------
REM STEP 8 -- DATABASE MIGRATION
REM ------------------------------------------------------------
echo [8/10] Starting core stack and applying database migrations...

docker compose -f "%~dp0docker-compose.yml" -f "%~dp0docker-compose.lan.yml" up -d
if errorlevel 1 (
    echo [ERROR] Failed to start Docker Compose stack!
    pause
    exit /b 1
)

echo   [*] Waiting for PostgreSQL and core services...
set /a ATTEMPTS=0
:WAIT_SETUP_HEALTH
set /a ATTEMPTS+=1
set "READY=1"

for %%c in (techx_ctf_postgres techx_ctf_redis techx_challenge_gateway techx_ctf_backend techx_ctf_nginx) do (
    for /f "usebackq delims=" %%s in (`docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" %%c 2^>nul`) do (
        if not "%%s"=="healthy" (
            if not "%%s"=="running" set "READY=0"
        )
    )
)
if "!READY!"=="1" goto MIGRATION_READY
if !ATTEMPTS! GEQ 30 goto MIGRATION_READY
timeout /t 2 >nul 2>&1
goto WAIT_SETUP_HEALTH

:MIGRATION_READY
echo   [*] Applying PostgreSQL schema migrations...
docker compose -f "%~dp0docker-compose.yml" -f "%~dp0docker-compose.lan.yml" exec -T backend npm run db:migrate
if errorlevel 1 (
    echo [ERROR] Database migration failed!
    pause
    exit /b 1
)
echo   [OK] Database schema verified and migrated.
echo.

REM ------------------------------------------------------------
REM STEP 9 -- SYSTEM HEALTH CHECK
REM ------------------------------------------------------------
echo [9/10] Testing system ingress and liveness probes...

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1/health' -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -ne 200) { exit 1 } } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Health probe failed on http://127.0.0.1/health!
    pause
    exit /b 1
)
echo   [OK] Ingress endpoint responding with HTTP 200.
echo.

REM ------------------------------------------------------------
REM STEP 10 -- REGRESSION TEST VERIFICATION
REM ------------------------------------------------------------
echo [10/10] Executing test suites...

echo   [*] Running backend regression tests...
cd /d "%~dp0backend"
call npm test
if errorlevel 1 (
    echo [ERROR] Backend tests failed!
    cd /d "%~dp0"
    pause
    exit /b 1
)

echo   [*] Running frontend regression tests...
cd /d "%~dp0frontend"
call npm test
if errorlevel 1 (
    echo [ERROR] Frontend tests failed!
    cd /d "%~dp0"
    pause
    exit /b 1
)
cd /d "%~dp0"
echo   [OK] All test suites passed!
echo.

REM ------------------------------------------------------------
REM FINAL OUTPUT
REM ------------------------------------------------------------
cls
echo ============================================================
echo  TECHX CTF 2026 -- SYSTEM READY
echo ============================================================
echo.
echo Installation:
echo         COMPLETE
echo.
echo Docker:
echo         READY
echo.
echo Dependencies:
echo         INSTALLED
echo.
echo Database:
echo         MIGRATED
echo.
echo Backend:
echo         BUILT
echo.
echo Frontend:
echo         BUILT
echo.
echo Compose:
echo         VALID
echo.
echo Tests:
echo         PASS
echo.
echo ============================================================
echo.
echo NEXT COMMAND:
echo.
echo START_LAN.bat
echo.
echo For participants on another network:
echo.
echo START_PUBLIC.bat
echo.
echo ============================================================
echo.
pause
