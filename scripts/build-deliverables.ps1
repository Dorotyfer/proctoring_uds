param(
  [string]$SourceRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

function Resolve-InRoot {
  param([string]$Root, [string]$RelativePath)

  $rootPath = [System.IO.Path]::GetFullPath($Root)
  $targetPath = [System.IO.Path]::GetFullPath((Join-Path $rootPath $RelativePath))
  if (-not $targetPath.StartsWith($rootPath + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Path escapes source root: $RelativePath"
  }
  return $targetPath
}

function Reset-Directory {
  param([string]$Path, [string]$AllowedParent)

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $fullParent = [System.IO.Path]::GetFullPath($AllowedParent)
  if (-not $fullPath.StartsWith($fullParent + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to reset directory outside deliverables: $fullPath"
  }
  if (Test-Path -LiteralPath $fullPath) {
    Remove-Item -LiteralPath $fullPath -Recurse -Force
  }
  New-Item -ItemType Directory -Path $fullPath | Out-Null
}

function Copy-RequiredItem {
  param([string]$Source, [string]$Destination)

  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Required source is missing: $Source"
  }
  $parent = Split-Path -Parent $Destination
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
}

function Copy-SourceTree {
  param([string]$Source, [string]$Destination)

  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Required source is missing: $Source"
  }
  Get-ChildItem -LiteralPath $Source -File -Recurse | Where-Object {
    $_.Extension -ne '.pyc' -and $_.FullName -notmatch '[\\/]__pycache__[\\/]'
  } | ForEach-Object {
    $relative = [System.IO.Path]::GetRelativePath($Source, $_.FullName)
    $target = Join-Path $Destination $relative
    $parent = Split-Path -Parent $target
    if (-not (Test-Path -LiteralPath $parent)) {
      New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    Copy-Item -LiteralPath $_.FullName -Destination $target -Force
  }
}

function New-PluginZip {
  param([string]$PluginDirectory, [string]$Destination)

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  if (Test-Path -LiteralPath $Destination) {
    Remove-Item -LiteralPath $Destination -Force
  }
  $stream = [System.IO.File]::Open($Destination, [System.IO.FileMode]::CreateNew)
  try {
    $archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
    try {
      $base = Split-Path -Parent $PluginDirectory
      Get-ChildItem -LiteralPath $PluginDirectory -File -Recurse | Sort-Object FullName | ForEach-Object {
        $entry = [System.IO.Path]::GetRelativePath($base, $_.FullName).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
          $archive,
          $_.FullName,
          $entry,
          [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
      }
    } finally {
      $archive.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Assert-ApplicationDeliverable {
  param([string]$Path)

  $required = @(
    'README.md',
    '.env.example',
    'apps/api/pyproject.toml',
    'apps/api/src/proctoring/__init__.py',
    'apps/api/src/proctoring/web/templates/session.html',
    'apps/api/src/proctoring/web/static/js/preparation.js',
    'apps/api/migrations/001_sessions.sql',
    'apps/api/migrations/011_effect_idempotency.sql',
    'apps/api/licenses/inventory.json',
    'apps/api/config/model-weights.example.json',
    'deploy/systemd/proctoring-api.service',
    'deploy/systemd/proctoring-worker.service',
    'deploy/apache/proctoring.conf',
    'scripts/install-ubuntu.sh',
    'scripts/rollback-ubuntu.sh',
    'scripts/build-deliverables.ps1'
  )
  foreach ($relative in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $Path $relative))) {
      throw "Application deliverable is missing: $relative"
    }
  }

  $forbiddenNames = @('package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'next.config.js', 'vitest.config.js')
  $forbiddenExtensions = @('.jsx', '.mjs', '.cjs', '.bin', '.onnx', '.pth', '.pem', '.key', '.pyc')
  Get-ChildItem -LiteralPath $Path -File -Recurse | ForEach-Object {
    if ($_.Name -in $forbiddenNames -or $_.Extension.ToLowerInvariant() -in $forbiddenExtensions) {
      throw "Forbidden application artifact: $($_.FullName)"
    }
    if ($_.Name -ne '.env.example' -and $_.Name.StartsWith('.env')) {
      throw "Environment secret file is forbidden: $($_.FullName)"
    }
    if ($_.Name -match '(?i)human') {
      throw "Human.js artifact is forbidden: $($_.FullName)"
    }
  }

  foreach ($relative in @('apps/web', 'packages/contracts', 'apps/api/tests', 'node_modules', '.venv')) {
    if (Test-Path -LiteralPath (Join-Path $Path $relative)) {
      throw "Forbidden application path: $relative"
    }
  }

  $legacyPackageName = 'proctoring' + '_api'
  $legacyPackage = Get-ChildItem -LiteralPath $Path -File -Recurse |
    Where-Object { $_.Extension -in @('.py', '.toml', '.md', '.service', '.sh', '.ps1') } |
    Select-String -Pattern $legacyPackageName -SimpleMatch
  if ($legacyPackage) {
    throw "Legacy Python package reference remains: $($legacyPackage[0].Path)"
  }
}

function Assert-PluginZip {
  param([string]$Path)

  Add-Type -AssemblyName System.IO.Compression
  $archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $entries = @($archive.Entries | ForEach-Object FullName)
    if ('proctoring/version.php' -notin $entries) {
      throw "Plugin ZIP lacks proctoring/version.php: $Path"
    }
    if (@($entries | Where-Object { -not $_.StartsWith('proctoring/') }).Count -gt 0) {
      throw "Plugin ZIP has an invalid root: $Path"
    }
  } finally {
    $archive.Dispose()
  }
}

$source = [System.IO.Path]::GetFullPath($SourceRoot)
$deliverables = Resolve-InRoot $source 'entregables'
$application = Resolve-InRoot $source 'entregables/aplicacion'
$moodle = Resolve-InRoot $source 'entregables/moodle'

Reset-Directory $application $deliverables
if (-not (Test-Path -LiteralPath $moodle)) {
  New-Item -ItemType Directory -Path $moodle -Force | Out-Null
}

Copy-RequiredItem (Join-Path $source 'README.md') (Join-Path $application 'README.md')
Copy-RequiredItem (Join-Path $source '.env.example') (Join-Path $application '.env.example')
foreach ($relative in @('pyproject.toml', 'migrations', 'config', 'licenses')) {
  Copy-RequiredItem (Join-Path $source "apps/api/$relative") (Join-Path $application "apps/api/$relative")
}
Copy-SourceTree (Join-Path $source 'apps/api/src') (Join-Path $application 'apps/api/src')
Copy-RequiredItem (Join-Path $source 'deploy') (Join-Path $application 'deploy')
foreach ($relative in @('install-ubuntu.sh', 'rollback-ubuntu.sh', 'build-deliverables.ps1')) {
  Copy-RequiredItem (Join-Path $source "scripts/$relative") (Join-Path $application "scripts/$relative")
}

$localOutput = Join-Path $moodle 'local_proctoring'
$quizOutput = Join-Path $moodle 'quizaccess_proctoring'
Reset-Directory $localOutput $moodle
Reset-Directory $quizOutput $moodle
Copy-RequiredItem (Join-Path $source 'apps/moodle/local/proctoring') (Join-Path $localOutput 'proctoring')
Copy-RequiredItem (Join-Path $source 'apps/moodle/mod/quiz/accessrule/proctoring') (Join-Path $quizOutput 'proctoring')

$localZip = Join-Path $moodle 'local_proctoring.zip'
$quizZip = Join-Path $moodle 'quizaccess_proctoring.zip'
New-PluginZip (Join-Path $localOutput 'proctoring') $localZip
New-PluginZip (Join-Path $quizOutput 'proctoring') $quizZip

Assert-ApplicationDeliverable $application
Assert-PluginZip $localZip
Assert-PluginZip $quizZip

Write-Output "Application deliverable: $application"
Write-Output "Moodle ZIP: $localZip"
Write-Output "Moodle ZIP: $quizZip"
Write-Output 'Python-only deliverable exclusions: OK'
