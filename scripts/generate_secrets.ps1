# ==============================================================================
# TECHX CTF 2026 — PRODUCTION SECRET GENERATOR (POWERSHELL)
# ==============================================================================

$EnvFile = ".env"
$EnvTemplate = ".env.example"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "          IEEE TECHX CTF 2026 — SECRET GENERATION UTILITY             " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

if (Test-Path $EnvFile) {
    Write-Host "[!] Existing '$EnvFile' detected." -ForegroundColor Yellow
    $Confirm = Read-Host "    Do you want to backup the existing file and generate a new one? (y/N)"
    if ($Confirm -notmatch '^[Yy]$') {
        Write-Host "[-] Secret generation aborted." -ForegroundColor Red
        exit 0
    }
    $Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $Backup = "$EnvFile.backup.$Timestamp"
    Copy-Item $EnvFile $Backup
    Write-Host "[✓] Backed up current environment to: $Backup" -ForegroundColor Green
}

if (-not (Test-Path $EnvTemplate)) {
    Write-Error "Template file '$EnvTemplate' not found."
    exit 1
}

function Generate-CryptoHex($bytes = 32) {
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $buf = New-Object byte[] $bytes
    $rng.GetBytes($buf)
    return -join ($buf | ForEach-Object { "{0:x2}" -f $_ })
}

Write-Host "[+] Generating cryptographically secure random secrets..." -ForegroundColor Cyan

$JwtSecret = Generate-CryptoHex 32
$CookieSecret = Generate-CryptoHex 32
$GatewaySecret = Generate-CryptoHex 32
$FlagSalt = Generate-CryptoHex 16
$DbPassword = Generate-CryptoHex 24
$RedisPassword = Generate-CryptoHex 24
$AdminPassword = (Generate-CryptoHex 16).Substring(0, 24)

$Content = Get-Content $EnvTemplate -Raw

$Content = $Content -replace 'JWT_SECRET=.*', "JWT_SECRET=$JwtSecret"
$Content = $Content -replace 'COOKIE_SECRET=.*', "COOKIE_SECRET=$CookieSecret"
$Content = $Content -replace 'CHALLENGE_GATEWAY_SECRET=.*', "CHALLENGE_GATEWAY_SECRET=$GatewaySecret"
$Content = $Content -replace 'FLAG_SALT=.*', "FLAG_SALT=$FlagSalt"
$Content = $Content -replace 'DB_PASSWORD=.*', "DB_PASSWORD=$DbPassword"
$Content = $Content -replace 'DATABASE_URL=.*', "DATABASE_URL=postgresql://techx_ctf_user:$($DbPassword)@postgres:5432/techx_ctf_db"
$Content = $Content -replace 'REDIS_PASSWORD=.*', "REDIS_PASSWORD=$RedisPassword"
$Content = $Content -replace 'REDIS_URL=.*', "REDIS_URL=redis://:$($RedisPassword)@redis:6379/0"
$Content = $Content -replace 'ADMIN_PASSWORD=.*', "ADMIN_PASSWORD=$AdminPassword"

Set-Content -Path $EnvFile -Value $Content -Encoding utf8

Write-Host "[✓] Successfully generated '$EnvFile' with cryptographic secrets!" -ForegroundColor Green
Write-Host "[i] Remember to run 'npm run bootstrap:admin' in backend to provision admin." -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan
