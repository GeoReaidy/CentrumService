param(
  [string]$DbUrl = $env:SUPABASE_DB_URL,
  [string]$ProjectRef = $(if ($env:SUPABASE_PROJECT_REF) { $env:SUPABASE_PROJECT_REF } else { "zlcikwwrgdnkscfitfqg" }),
  [string]$OutputRoot = "backups"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )

  Write-Host "==> $Label" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

if (-not $DbUrl) {
  $DbUrl = Read-Host "Paste the Supabase Session pooler/direct database URL (kept only in memory)"
}

if (-not $DbUrl -or $DbUrl -notmatch '^postgres(?:ql)?://') {
  throw "A valid PostgreSQL connection URL is required. Prefer setting SUPABASE_DB_URL for this PowerShell session."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $OutputRoot "centrum-$stamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$rolesFile = Join-Path $backupDir "roles.sql"
$schemaFile = Join-Path $backupDir "schema.sql"
$dataFile = Join-Path $backupDir "data.sql"
$historySchemaFile = Join-Path $backupDir "migration-history-schema.sql"
$historyDataFile = Join-Path $backupDir "migration-history-data.sql"
$sourceFile = Join-Path $backupDir "repository-source.zip"
$edgeFunctionsFile = Join-Path $backupDir "edge-functions.txt"
$migrationsFile = Join-Path $backupDir "migration-list.txt"
$workingTreeFile = Join-Path $backupDir "working-tree-status.txt"

Write-Host "Centrum production backup" -ForegroundColor Green
Write-Host "Output: $backupDir"
Write-Host "The database URL will NOT be written to the backup bundle."

Invoke-Checked "Supabase CLI availability" { npx supabase --version }

Invoke-Checked "Dump database roles" {
  npx supabase db dump --db-url $DbUrl -f $rolesFile --role-only
}

Invoke-Checked "Dump database schema" {
  npx supabase db dump --db-url $DbUrl -f $schemaFile
}

Invoke-Checked "Dump database data" {
  npx supabase db dump --db-url $DbUrl -f $dataFile --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
}

Invoke-Checked "Dump Supabase migration-history schema" {
  npx supabase db dump --db-url $DbUrl -f $historySchemaFile --schema supabase_migrations
}

Invoke-Checked "Dump Supabase migration-history data" {
  npx supabase db dump --db-url $DbUrl -f $historyDataFile --use-copy --data-only --schema supabase_migrations
}

$gitCommit = $null
$gitBranch = $null
if (Get-Command git -ErrorAction SilentlyContinue) {
  $insideRepo = (& git rev-parse --is-inside-work-tree 2>$null)
  if ($LASTEXITCODE -eq 0 -and $insideRepo -eq "true") {
    $gitCommit = (& git rev-parse HEAD).Trim()
    $gitBranch = (& git branch --show-current).Trim()
    (& git status --porcelain) | Set-Content -Path $workingTreeFile -Encoding UTF8

    Invoke-Checked "Archive committed application source" {
      git archive --format=zip --output=$sourceFile HEAD
    }
  }
}

if (-not (Test-Path $workingTreeFile)) {
  "Git repository information was unavailable." | Set-Content -Path $workingTreeFile -Encoding UTF8
}

# These inventory commands are useful during a disaster recovery, but a failure
# here should not invalidate the database dump itself.
try {
  (& npx supabase functions list --project-ref $ProjectRef 2>&1) | Set-Content -Path $edgeFunctionsFile -Encoding UTF8
} catch {
  "Unable to capture Edge Function inventory: $($_.Exception.Message)" | Set-Content -Path $edgeFunctionsFile -Encoding UTF8
}

try {
  (& npx supabase migration list 2>&1) | Set-Content -Path $migrationsFile -Encoding UTF8
} catch {
  "Unable to capture linked migration list: $($_.Exception.Message)" | Set-Content -Path $migrationsFile -Encoding UTF8
}

$filesForManifest = Get-ChildItem -Path $backupDir -File | Where-Object { $_.Name -ne "manifest.json" }
$manifestFiles = @()
foreach ($file in $filesForManifest) {
  $hash = (Get-FileHash -Path $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifestFiles += [ordered]@{
    name = $file.Name
    bytes = $file.Length
    sha256 = $hash
  }
}

$manifest = [ordered]@{
  format = "centrum-production-backup-v1"
  created_at = (Get-Date).ToUniversalTime().ToString("o")
  project_ref = $ProjectRef
  git_commit = $gitCommit
  git_branch = $gitBranch
  contains_database_url = $false
  files = $manifestFiles
}

$manifest | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $backupDir "manifest.json") -Encoding UTF8

Write-Host ""
Write-Host "Backup created successfully." -ForegroundColor Green
Write-Host "Verify it with:"
Write-Host "  npm run backup:verify -- -BackupDir `"$backupDir`"" -ForegroundColor Yellow
Write-Host ""
Write-Host "Store this directory off the web server and outside the Git repository. It can contain customer data." -ForegroundColor Yellow
