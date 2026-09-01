$ErrorActionPreference = 'Stop'

$requiredFiles = @(
    'plugins/local/proctoring/version.php',
    'plugins/local/proctoring/db/install.xml',
    'plugins/local/proctoring/lang/en/local_proctoring.php',
    'plugins/local/proctoring/lang/es/local_proctoring.php',
    'plugins/quizaccess/proctoring/version.php',
    'plugins/quizaccess/proctoring/rule.php',
    'plugins/quizaccess/proctoring/db/install.xml',
    'plugins/quizaccess/proctoring/classes/observer.php',
    'plugins/quizaccess/proctoring/lang/en/quizaccess_proctoring.php',
    'plugins/quizaccess/proctoring/lang/es/quizaccess_proctoring.php'
)

$missingFiles = $requiredFiles | Where-Object { -not (Test-Path (Join-Path $PSScriptRoot "..\..\$_")) }

if ($missingFiles) {
    $missingFiles | ForEach-Object { Write-Error "Missing plugin file: $_" }
    exit 1
}

Write-Output "Native Moodle plugin structure is complete."
