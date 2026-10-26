@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo   TECHX CTF 2026 -- DATABASE BACKUP UTILITY
echo ============================================================

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set dt=%%I
set TIMESTAMP=%dt:~0,8%_%dt:~8,6%

if not exist backups mkdir backups
set BACKUP_FILE=backups\techx_ctf_backup_%TIMESTAMP%.sql

echo Backing up PostgreSQL database 'techx_ctf_db'...
docker exec -i techx_ctf_postgres pg_dump -U techx_ctf_user -d techx_ctf_db > "%BACKUP_FILE%"

if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Backup created successfully: %BACKUP_FILE%
) else (
    echo [ERROR] Backup failed! Check Docker status.
)

pause
