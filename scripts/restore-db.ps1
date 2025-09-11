# C:\Geohistory\scripts\restore-db.ps1
# Restore DB GeoHistory via Pooler eu-west-1 (porta 6543) + project ref nelle options

$ErrorActionPreference = 'Stop'

$DumpFile = 'C:\Geohistory\backups\db\db-release-20250909-2320.sql'
if (!(Test-Path $DumpFile)) { throw "Dump non trovato: $DumpFile" }

# --- Trova psql ---
$candidates = @(
  (Join-Path $env:USERPROFILE 'scoop\apps\postgresql\current\bin\psql.exe'),
  'C:\Program Files\PostgreSQL\17\bin\psql.exe',
  'C:\Program Files\PostgreSQL\16\bin\psql.exe',
  'C:\Program Files\PostgreSQL\15\bin\psql.exe'
)
$Psql = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Psql) { throw "psql non trovato. Installa con: scoop install postgresql" }

# --- Connection string (POOLER) con project ref nelle options ---
$DB_USER  = 'postgres'
$DB_PASS  = 'XtwOWAY0yLt44XZc'
$DB_HOST  = 'aws-0-eu-west-1.pooler.supabase.com'
$DB_PORT  = '6543'
$DB_NAME  = 'postgres'
$PROJECT  = 'jcqaesoavmxucexjeudq'
$DB_URL   = ("postgresql://{0}:{1}@{2}:{3}/{4}?sslmode=require&options=project%3D{5}" -f `
              $DB_USER, $DB_PASS, $DB_HOST, $DB_PORT, $DB_NAME, $PROJECT)

Write-Host "Eseguo restore → $DB_URL" -ForegroundColor Yellow
& $Psql $DB_URL -f $DumpFile
if ($LASTEXITCODE -ne 0) { throw "psql restore fallito (exit $LASTEXITCODE)" }

Write-Host "✅ Restore completato da $DumpFile" -ForegroundColor Green
Read-Host "Fine. Premi INVIO per chiudere"
