<?php

defined('MOODLE_INTERNAL') || die();

function xmldb_quizaccess_proctoring_upgrade(int $oldversion): bool {
    if ($oldversion < 2026090101) {
        upgrade_plugin_savepoint(true, 2026090101, 'quizaccess', 'proctoring');
    }

    return true;
}
