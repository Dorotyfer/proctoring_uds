<?php

define('CLI_SCRIPT', true);

require(__DIR__ . '/../../../config.php');
require_once($CFG->libdir . '/clilib.php');

use local_proctoring\service\legacy_migration_service;

$params = cli_get_params([
    'dry-run' => false,
    'execute' => false,
    'format' => 'text',
    'quizid' => null,
], [
    'h' => 'help',
]);

if (!empty($params['help'])) {
    echo "Migrate quizaccess_udsmonitor into native Proctoring.\n\n";
    echo "Options:\n";
    echo "  --dry-run             Preview without writes (default).\n";
    echo "  --execute             Write the migration.\n";
    echo "  --format=json         Print machine-readable JSON.\n";
    echo "  --quizid=<id>         Limit execution to one quiz.\n";
    exit(0);
}

if (!empty($params['dry-run']) && !empty($params['execute'])) {
    cli_error('Use only one of --dry-run or --execute.');
}

$context = context_system::instance();
if (!is_siteadmin($USER) && !has_capability('local/proctoring:migratelegacy', $context)) {
    cli_error('The current CLI user cannot migrate legacy Proctoring settings.');
}

$quizid = $params['quizid'] === null ? null : (int)$params['quizid'];
$service = new legacy_migration_service();
$result = $service->migrate((int)$USER->id, empty($params['execute']), $quizid);

if ($params['format'] === 'json') {
    echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
    exit(0);
}

if (empty($result['sourceavailable'])) {
    echo get_string('migrationsourceunavailable', 'local_proctoring') . PHP_EOL;
    exit(0);
}

echo ($result['dryrun'] ? get_string('migrationpreview', 'local_proctoring') : get_string('migrationexecute', 'local_proctoring')) . PHP_EOL;
echo 'Cuestionarios detectados: ' . (int)$result['quizzes_seen'] . PHP_EOL;
echo 'Cuestionarios migrados: ' . (int)($result['migrated'] ?? $result['mapped']) . PHP_EOL;
echo 'Advertencias: ' . count($result['warnings']) . PHP_EOL;
