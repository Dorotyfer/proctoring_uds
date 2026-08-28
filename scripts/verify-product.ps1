$ErrorActionPreference = 'Stop'

pnpm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm web:build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$migrationFiles = Get-ChildItem 'apps/api/src/db/migrations/*.sql' | Sort-Object Name
$migrationNames = $migrationFiles | Select-Object -ExpandProperty Name
if (($migrationNames | Select-Object -Unique).Count -ne $migrationNames.Count) {
  throw 'Duplicate migration names found.'
}
foreach ($migration in $migrationFiles) {
  $sql = Get-Content $migration.FullName -Raw
  if ($sql -notmatch 'CREATE TABLE IF NOT EXISTS|ALTER TABLE') {
    throw "Migration $($migration.Name) does not contain retry-safe DDL."
  }
}

$requiredFiles = @(
  'docs/GUIA_ABSOLUTA_PRODUCTO_FINAL.md',
  'apps/api/src/services/policy-service.js',
  'apps/api/src/services/biometric-monitor-service.js',
  'apps/api/src/services/risk-score-service.js',
  'apps/web/lib/biometric-monitor.js',
  'apps/web/lib/device-signals.js'
)
foreach ($requiredFile in $requiredFiles) {
  if (-not (Test-Path $requiredFile)) { throw "Required file is missing: $requiredFile" }
}

$guides = Get-ChildItem -Path . -Filter 'GUIA_ABSOLUTA_PRODUCTO_FINAL.md' -Recurse -File
$guideHashes = $guides | ForEach-Object { (Get-FileHash $_.FullName -Algorithm SHA256).Hash } | Select-Object -Unique
if ($guideHashes.Count -ne 1) { throw 'Absolute guide copies do not have identical hashes.' }

pnpm api:infra:check
