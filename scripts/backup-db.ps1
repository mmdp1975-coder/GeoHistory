# C:\Geohistory\scripts\backup-db.ps1
# Backup DB GeoHistory utilizzando pooler eu-west-1 con options project=ref

$ErrorActionPreference = 'Stop'

# --- Parametri base ---
$Root  = 'C:\Geohistory'
$STAMP = '20250909-2320'
$TAG   = "release-$STAMP"
$Bkp   = Join-Path $Root 'backups'
$BkpDb = Join-Path $Bkp 'db'
New-Item -ItemType Directory -Force -Path $BkpDb | Out-Null

# --- Trova pg_dump ---
$PgDump = Join-Path $env:USERPROFILE 'scoop\apps\postgresql\current\bin\pg_dump.exe'
if (!(Test-Path $PgDump)) { throw "pg_dump non trovato. Usa scoop install postgresql." }

# --- Connection string (pooler eu-west-1) con project option ---
$PROJECT = 'jcqaesoavmxucexjeudq'
$DB_URL = "postgresql://postgres:XtwOWAY0yLt44XZc@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=require&options=project%3D$PROJECT"

# --- File di output ---
$DumpFile = Join-Path $BkpDb "db-$TAG.sql"
if (Test-Path $DumpFile) { Remove-Item $DumpFile -Force }

# --- Esegui dump ---
Write-Host "Eseguo dump → $DB_URL" -ForegroundColor Yellow
& $PgDump $DB_URL --no-owner --no-privileges --format=p --file $DumpFile
if ($LASTEXITCODE -ne 0) { throw "pg_dump ha fallito (exit $LASTEXITCODE)" }

# --- Verifica contenuto ---
$sizeBytes = (Get-Item $DumpFile).Length
if ($sizeBytes -lt 1024) { throw "Dump troppo piccolo ($sizeBytes bytes)" }

$size = "{0:N1}" -f ($sizeBytes / 1MB)
Write-Host "✅ Dump OK → $DumpFile ($size MB)" -ForegroundColor Green
Read-Host "Backup completato! Premi INVIO per chiudere."
