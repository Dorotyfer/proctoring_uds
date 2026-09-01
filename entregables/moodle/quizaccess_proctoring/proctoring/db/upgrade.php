<?php

defined('MOODLE_INTERNAL') || die();

function xmldb_quizaccess_proctoring_upgrade(int $oldversion): bool {
    global $DB;

    if ($oldversion < 2026082400) {
        $table = new xmldb_table('quizaccess_proctoring');
        $field = new xmldb_field('controllevel', XMLDB_TYPE_CHAR, '10', null, XMLDB_NOTNULL, null, 'medium', 'failurepolicy');
        if (!$DB->field_exists($table, $field)) {
            $DB->add_field($table, $field);
        }
        upgrade_plugin_savepoint(true, 2026082400, 'quizaccess', 'proctoring');
    }

    return true;
}
