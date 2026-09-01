<?php

defined('MOODLE_INTERNAL') || die();

function xmldb_local_proctoring_upgrade(int $oldversion): bool {
    global $DB;

    if ($oldversion < 2026090101) {
        $dbman = $DB->get_manager();
        $tables = [
            'local_proctoring_policy',
            'local_proctoring_session',
            'local_proctoring_event',
            'local_proctoring_alert',
            'local_proctoring_evidence',
            'local_proctoring_evaudit',
            'local_proctoring_biometric',
            'local_proctoring_biover',
            'local_proctoring_biocheck',
            'local_proctoring_envsignal',
            'local_proctoring_riskscore',
        ];

        foreach ($tables as $table) {
            if (!$dbman->table_exists(new xmldb_table($table))) {
                $dbman->install_one_table_from_xmldb_file(__DIR__ . '/install.xml', $table);
            }
        }

        upgrade_plugin_savepoint(true, 2026090101, 'local', 'proctoring');
    }

    if ($oldversion < 2026090102) {
        upgrade_plugin_savepoint(true, 2026090102, 'local', 'proctoring');
    }

    if ($oldversion < 2026090103) {
        $dbman = $DB->get_manager();
        if (!$dbman->table_exists(new xmldb_table('local_proctoring_migration'))) {
            $dbman->install_one_table_from_xmldb_file(__DIR__ . '/install.xml', 'local_proctoring_migration');
        }
        upgrade_plugin_savepoint(true, 2026090103, 'local', 'proctoring');
    }

    if ($oldversion < 2026090104) {
        if (file_exists(__DIR__ . '/../classes/service/lti_tool_service.php')) {
            (new \local_proctoring\service\lti_tool_service($DB))->ensure_registered();
        }
        upgrade_plugin_savepoint(true, 2026090104, 'local', 'proctoring');
    }

    if ($oldversion < 2026090105) {
        upgrade_plugin_savepoint(true, 2026090105, 'local', 'proctoring');
    }

    return true;
}
