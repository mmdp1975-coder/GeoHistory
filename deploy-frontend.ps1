# === DEPLOY FRONTEND GEOHISTORY (Vercel) ===
# Fa: commit + push + tag + deploy Production su Vercel.
# Funziona anche SENZA CLI Vercel globale (usa npx vercel).
# Data release: generata automaticamente

# ========================
# 0) PREPARAZIONE
# ========================
$today = Get-Date -Format "yyyy-MM-dd"
Write-Host ""
Write-Host "=== DEPLOY FRONTEND GEOHISTORY — Release $today ===" -ForegroundColor Green

# ========================
# 1) GIT PUSH
# ========================
Write-Host ""
Write-Host "=== STEP 1: GIT PUSH ===" -ForegroundColor Cyan
cd C:\GeoHistory\frontend

git status
git fetch origin
git switch main
git pull origin main

git add -A
git commit -m "Release: frontend del $today"
git push origin main

# Tag di release (opzionale)
$feTag = "fe-$($today -replace '-', '')"
git tag -a $feTag -m "Frontend release $feTag"
git push origin $feTag

# ========================
# 2) DEPLOY SU VERCEL (con fallback)
# ========================
Write-Host ""
Write-Host "=== STEP 2: DEPLOY VERCEL (Production) ===" -ForegroundColor Cyan
cd C:\GeoHistory

$useNpx = $false
try {
  $vercelVersion = & vercel --version 2>$null
} catch {
  $useNpx = $true
}

if ($useNpx) {
  Write-Host "Vercel CLI non trovata. Uso 'npx vercel'..." -ForegroundColor Yellow
  npx vercel --version
  npx vercel --prod --confirm
} else {
  Write-Host "Vercel CLI trovata. Uso 'vercel'..." -ForegroundColor Yellow
  vercel --version
  vercel --prod --confirm
}

# ========================
# 3) VERIFICA ONLINE
# ========================
Write-Host ""
Write-Host "=== STEP 3: VERIFICA ONLINE ===" -ForegroundColor Cyan
Write-Host "Frontend URL:  https://geo-history-three.vercel.app/login" -ForegroundColor Green

# Apri automaticamente il browser su /login
Start-Process "https://geo-history-three.vercel.app/login"
