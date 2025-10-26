# Audit-Geohistory.ps1 — PS5 compatible (no GetRelativePath), full reports
param(
  [string]$Root = (Get-Location).Path,
  [string]$OutDir = "geo_audit"
)

# -------- Utils compatibili PS5 --------
function RelativePath([string]$basePath, [string]$fullPath) {
  try {
    $b = [System.IO.Path]::GetFullPath($basePath)
    $f = [System.IO.Path]::GetFullPath($fullPath)
    $baseUri = New-Object System.Uri(($b.TrimEnd('\') + '\'))
    $fileUri = New-Object System.Uri($f)
    $rel = $baseUri.MakeRelativeUri($fileUri).ToString()
    return ($rel -replace '/','\')
  } catch {
    return $fullPath
  }
}

function TopFolder([string]$basePath, [string]$fullPath) {
  $rel = RelativePath $basePath $fullPath
  if ($rel -match '^[^\\\/]+') { return $Matches[0] } else { return '.' }
}

# -------- Output --------
$OutDirFull = Join-Path $Root $OutDir
$null = New-Item -ItemType Directory -Force -Path $OutDirFull
$OutPath = { param($n) (Join-Path $OutDirFull $n) }

# -------- Scansione file (escludi directory rumorose) --------
$excludePattern = '\\(\.git|node_modules|\.next|dist|build|\.turbo|coverage|\.vercel|\.cache)(\\|$)'
$allFiles = Get-ChildItem -Path $Root -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch $excludePattern }

# -------- Git sets --------
$repoRoot = $null
try { $repoRoot = (git -C $Root rev-parse --show-toplevel 2>$null).Trim() } catch {}
$trackedSet   = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$ignoredSet   = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$untrackedSet = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)

if ($repoRoot) {
  # Tracciati
  $trackedRel = (git -C $repoRoot ls-files -z 2>$null)
  if ($LASTEXITCODE -eq 0 -and $trackedRel) {
    ($trackedRel -join "`n") -split "`0" | Where-Object { $_ } |
      ForEach-Object { $trackedSet.Add([IO.Path]::GetFullPath((Join-Path $repoRoot $_))) | Out-Null }
  }
  # Ignorati
  $ignoredRel = (git -C $repoRoot ls-files --others -i --exclude-standard -z 2>$null)
  if ($LASTEXITCODE -eq 0 -and $ignoredRel) {
    ($ignoredRel -join "`n") -split "`0" | Where-Object { $_ } |
      ForEach-Object { $ignoredSet.Add([IO.Path]::GetFullPath((Join-Path $repoRoot $_))) | Out-Null }
  }
  # Non tracciati
  $untrackedRel = (git -C $repoRoot ls-files --others --exclude-standard -z 2>$null)
  if ($LASTEXITCODE -eq 0 -and $untrackedRel) {
    ($untrackedRel -join "`n") -split "`0" | Where-Object { $_ } |
      ForEach-Object { $untrackedSet.Add([IO.Path]::GetFullPath((Join-Path $repoRoot $_))) | Out-Null }
  }
}

# -------- Heuristics testo/binario --------
$textExt = @('.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.md','.txt','.yml','.yaml','.css','.scss','.less','.html','.htm','.sql','.ps1','.psm1','.psd1','.py','.toml','.ini','.env','.xml')
$binExt  = @('.png','.jpg','.jpeg','.gif','.svg','.ico','.pdf','.zip','.7z','.rar','.mp4','.webm','.mov','.wav','.mp3','.woff','.woff2','.ttf','.eot')
function IsTextFile($ext) { return $textExt -contains ($ext.ToLower()) }
function IsBinaryFile($ext) { return $binExt -contains ($ext.ToLower()) }

# -------- Inventario --------
$inventory = foreach ($f in $allFiles) {
  $ext = [IO.Path]::GetExtension($f.Name)
  $isText   = IsTextFile $ext
  $isBinary = IsBinaryFile $ext

  $lines = $null
  if ($isText) {
    try { $lines = (Get-Content -Path $f.FullName -ErrorAction Stop | Measure-Object -Line).Lines } catch { $lines = $null }
  }

  $hash = $null
  try { $hash = (Get-FileHash -Algorithm SHA256 -Path $f.FullName -ErrorAction Stop).Hash } catch { $hash = $null }

  $isTracked   = $trackedSet.Contains($f.FullName)
  $isIgnored   = $ignoredSet.Contains($f.FullName)
  $isUntracked = $untrackedSet.Contains($f.FullName)

  [PSCustomObject]@{
    FullPath        = $f.FullName
    RelPath         = if ($repoRoot) { RelativePath $repoRoot $f.FullName } else { RelativePath $Root $f.FullName }
    Directory       = $f.DirectoryName
    Name            = $f.Name
    Extension       = $ext
    SizeBytes       = $f.Length
    LastWriteTime   = $f.LastWriteTime
    CreatedTime     = $f.CreationTime
    IsText          = [bool]$isText
    IsBinary        = [bool]$isBinary
    Lines           = $lines
    SHA256          = $hash
    GitTracked      = [bool]$isTracked
    GitIgnored      = [bool]$isIgnored
    GitUntracked    = [bool]$isUntracked
    TopFolder       = if ($repoRoot) { TopFolder $repoRoot $f.FullName } else { TopFolder $Root $f.FullName }
  }
}

$invCsv = & $OutPath "inventory.csv"
$inventory | Sort-Object FullPath | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $invCsv

# -------- Riepilogo per estensione --------
$byExtCsv = & $OutPath "summary_by_extension.csv"
$inventory |
  Group-Object Extension | ForEach-Object {
    [PSCustomObject]@{
      Extension   = $_.Name
      FilesCount  = $_.Count
      TotalBytes  = ($_.Group | Measure-Object -Property SizeBytes -Sum).Sum
      TextFiles   = ($_.Group | Where-Object IsText | Measure-Object).Count
      BinaryFiles = ($_.Group | Where-Object IsBinary | Measure-Object).Count
      Tracked     = ($_.Group | Where-Object GitTracked | Measure-Object).Count
      Ignored     = ($_.Group | Where-Object GitIgnored | Measure-Object).Count
      Untracked   = ($_.Group | Where-Object GitUntracked | Measure-Object).Count
    }
  } | Sort-Object -Property FilesCount -Descending |
  Export-Csv -NoTypeInformation -Encoding UTF8 -Path $byExtCsv

# -------- Riepilogo per macro-cartella --------
$byDirCsv = & $OutPath "summary_by_topfolder.csv"
$inventory |
  Group-Object TopFolder | ForEach-Object {
    [PSCustomObject]@{
      TopFolder   = $_.Name
      FilesCount  = $_.Count
      TotalBytes  = ($_.Group | Measure-Object -Property SizeBytes -Sum).Sum
      Tracked     = ($_.Group | Where-Object GitTracked | Measure-Object).Count
      Ignored     = ($_.Group | Where-Object GitIgnored | Measure-Object).Count
      Untracked   = ($_.Group | Where-Object GitUntracked | Measure-Object).Count
    }
  } | Sort-Object -Property FilesCount -Descending |
  Export-Csv -NoTypeInformation -Encoding UTF8 -Path $byDirCsv

# -------- Duplicati per hash --------
$dupsCsv = & $OutPath "duplicates_by_hash.csv"
$inventory |
  Where-Object { $_.SHA256 } |
  Group-Object SHA256 | Where-Object { $_.Count -gt 1 } |
  ForEach-Object {
    $_.Group | Select-Object SHA256, SizeBytes, RelPath, FullPath, Extension, LastWriteTime
  } |
  Sort-Object SHA256, SizeBytes, RelPath |
  Export-Csv -NoTypeInformation -Encoding UTF8 -Path $dupsCsv

# -------- Git snapshot --------
$gitCsv = & $OutPath "git_status_counts.csv"
[PSCustomObject]@{
  TrackedCount   = ($inventory | Where-Object GitTracked   | Measure-Object).Count
  IgnoredCount   = ($inventory | Where-Object GitIgnored   | Measure-Object).Count
  UntrackedCount = ($inventory | Where-Object GitUntracked | Measure-Object).Count
} | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $gitCsv

# -------- README --------
$readme = @"
GeoHistory Audit
Root: $Root
RepoRoot (git): $repoRoot
Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Files scanned: $($inventory.Count)

Output:
- inventory.csv                 => elenco completo file (con hash, linee, stato Git, TopFolder)
- summary_by_extension.csv      => riepilogo per estensione
- summary_by_topfolder.csv      => riepilogo per macro-cartella
- duplicates_by_hash.csv        => possibili duplicati (stesso SHA256)
- git_status_counts.csv         => conteggi stato Git

Note:
- PS5 compat: relative path via System.Uri (no Path.GetRelativePath).
- Filtra inventory.csv su GitIgnored/Untracked per trovare file probabilmente inutili.
"@
$readme | Out-File -FilePath (& $OutPath "README.txt") -Encoding UTF8

Write-Host "✅ Audit completato in '$($OutDirFull)'."
