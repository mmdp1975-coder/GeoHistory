# === DEPLOY FRONTEND GEOHISTORY (Vercel) ===
# Questo script pubblica la versione frontend su Vercel (Production).
# - Esegue commit & push su branch main
# - Crea un tag di release
# - Lancia il deploy diretto su Vercel (via CLI)
# Data release: generata automaticamente

# ========================
# 0) PREPARAZIONE
# ========================
$today = Get-Date -Format "yyyy-MM-dd"
Write-Host "`n=== DEPLOY FRONTEND GEOHISTORY — Release $today ===" -ForegroundColor Green

# ========================
# 1) FRONTEND - DEPLOY
# ========================
Write-Host "`n=== STEP 1: GIT PUSH ===" -ForegroundColor Cyan
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
# 2) DEPLOY SU VERCEL
# ========================
Write-Host "`n=== STEP 2: DEPLOY VERCEL (Production) ===" -ForegroundColor Cyan
cd C:\GeoHistory
vercel --prod --confirm

# ========================
# 3) VERIFICA ONLINE
# ========================
Write-Host "`n=== STEP 3: VERIFICA ONLINE ===" -ForegroundColor Cyan
Write-Host "Frontend URL:  https://geo-history-three.vercel.app/login"
