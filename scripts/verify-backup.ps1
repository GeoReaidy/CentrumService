param(
  [Parameter(Mandatory = $true)][string]$BackupDir
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path $BackupDir -PathType Container)) {
  throw "Backup directory not found: $BackupDir"
}

$manifestPath = Join-Path $BackupDir "manifest.json"
if (-not (Test-Path $manifestPath -PathType Leaf)) {
  throw "manifest.json is missing from $BackupDir"
}

$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
if ($manifest.format -ne "centrum-production-backup-v1") {
  throw "Unsupported backup format: $($manifest.format)"
}

$required = @("roles.sql", "schema.sql", "data.sql", "migration-history-schema.sql", "migration-history-data.sql")
$failed = $false

foreach ($name in $required) {
  if (-not (Test-Path (Join-Path $BackupDir $name) -PathType Leaf)) {
    Write-Host "FAIL  missing $name" -ForegroundColor Red
    $failed = $true
  }
}

foreach ($entry in $manifest.files) {
  $path = Join-Path $BackupDir $entry.name
  if (-not (Test-Path $path -PathType Leaf)) {
    Write-Host "FAIL  missing $($entry.name)" -ForegroundColor Red
    $failed = $true
    continue
  }

  $actual = (Get-FileHash -Path $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $entry.sha256) {
    Write-Host "FAIL  checksum mismatch: $($entry.name)" -ForegroundColor Red
    $failed = $true
  } else {
    Write-Host "PASS  $($entry.name)" -ForegroundColor Green
  }
}

if ($failed) {
  throw "Backup verification failed. Do not rely on this bundle for recovery."
}

Write-Host ""
Write-Host "Backup verification PASSED." -ForegroundColor Green
Write-Host "Created: $($manifest.created_at)"
Write-Host "Project: $($manifest.project_ref)"
if ($manifest.git_commit) { Write-Host "Commit:  $($manifest.git_commit)" }
