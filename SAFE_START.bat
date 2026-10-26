@echo off
echo ============================================================
echo   TECHX CTF 2026 -- SAFE DOCKER START (RESTORES EXISTING DATA)
echo ============================================================
echo.
docker compose start
if %ERRORLEVEL% NEQ 0 (
    echo Containers not created yet or stopped, running docker compose up -d...
    docker compose up -d
)
echo.
echo Containers are running!
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo.
pause
