@echo off
echo ============================================================
echo   TECHX CTF 2026 -- SAFE DOCKER SHUTDOWN (PRESERVES ALL DATA)
echo ============================================================
echo.
echo WARNING: This script stops containers SAFELY.
echo It will NOT delete databases, volumes, solves, or submissions.
echo.

if not exist backups mkdir backups
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set dt=%%I
set TIMESTAMP=%dt:~0,8%_%dt:~8,6%
echo [1/2] Taking automatic safety backup before stopping...
docker exec -i techx_ctf_postgres pg_dump -U techx_ctf_user -d techx_ctf_db > "backups\pre_shutdown_%TIMESTAMP%.sql"
echo Safety backup saved to backups\pre_shutdown_%TIMESTAMP%.sql.

echo.
echo [2/2] Stopping Docker containers safely...
docker compose stop

echo.
echo ============================================================
echo   ALL CONTAINERS STOPPED SAFELY.
echo   PostgreSQL and Redis data are safely stored in Docker volumes.
echo   To resume at any time, run SAFE_START.bat or START_PUBLIC.bat
echo ============================================================
pause
