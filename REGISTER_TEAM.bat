@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
cd /d "%~dp0"

REM ------------------------------------------------------------
REM TECHX CTF 2026 -- ONE-CLICK TEAM & PARTICIPANT PROVISIONING
REM ------------------------------------------------------------

REM 1. Verify Docker CLI is installed
where docker >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] Docker CLI is not installed or not available on PATH.
    echo Please install Docker Desktop for Windows:
    echo   https://www.docker.com/products/docker-desktop/
    echo.
    pause
    exit /b 1
)

REM 2. Verify Docker daemon is running
docker info >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] Docker daemon is not running!
    echo Please start Docker Desktop and ensure the engine is ready.
    echo.
    pause
    exit /b 1
)

REM 3. Verify backend container is running
set "BACKEND_STATUS="
for /f "usebackq delims=" %%s in (`docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" techx_ctf_backend 2^>nul`) do (
    set "BACKEND_STATUS=%%s"
)
if not "%BACKEND_STATUS%"=="running" (
    if not "%BACKEND_STATUS%"=="healthy" (
        echo.
        echo [ERROR] Backend container 'techx_ctf_backend' is not running!
        echo Please start the platform first:
        echo   START_LAN.bat    - for local LAN competition
        echo   START_PUBLIC.bat - for remote competition
        echo.
        pause
        exit /b 1
    )
)

REM 4. Verify PostgreSQL container is healthy
set "PG_STATUS="
for /f "usebackq delims=" %%s in (`docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" techx_ctf_postgres 2^>nul`) do (
    set "PG_STATUS=%%s"
)
if not "%PG_STATUS%"=="healthy" (
    echo.
    echo [ERROR] PostgreSQL container 'techx_ctf_postgres' is not healthy!
    echo Wait until the database container completes initialization and reports healthy.
    echo.
    pause
    exit /b 1
)

REM 5. Verify database migration state
docker compose -f "%~dp0docker-compose.yml" -f "%~dp0docker-compose.lan.yml" exec -T backend npm run db:migrate >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] Database migrations are not up-to-date or failed to verify!
    echo Check backend logs:
    echo   docker compose logs backend
    echo.
    pause
    exit /b 1
)

REM 6. Verify Node.js is installed on host (required for secure password masking)
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] Node.js is not installed or not available on PATH.
    echo Node.js is required to securely mask password input without echoing to the terminal.
    echo Please install Node.js 20+ LTS: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM 7. Launch secure interactive provisioning workflow
node "%~dp0scripts\register_team.cjs"
set "PROVISION_EXIT=%ERRORLEVEL%"

if not "%PROVISION_EXIT%"=="0" (
    echo.
    pause
    exit /b %PROVISION_EXIT%
)

echo.
pause
exit /b 0
