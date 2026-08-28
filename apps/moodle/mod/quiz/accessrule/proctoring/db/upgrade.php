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

    if ($oldversion < 2026082801) {
        $table = new xmldb_table('quizaccess_proctoring');
        $version = new xmldb_field('policyversion', XMLDB_TYPE_CHAR, '64', null, XMLDB_NOTNULL, null, 'quiz-policy-3', 'controllevel');
        $json = new xmldb_field('policyjson', XMLDB_TYPE_TEXT, null, null, XMLDB_NOTNULL, null, '{"version":"quiz-policy-3","signals":[]}', 'policyversion');
        if (!$DB->field_exists($table, $version)) {
            $DB->add_field($table, $version);
        }
        if (!$DB->field_exists($table, $json)) {
            $DB->add_field($table, $json);
        }
        upgrade_plugin_savepoint(true, 2026082801, 'quizaccess', 'proctoring');
    }

    return true;
}
