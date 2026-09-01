<?php

defined('MOODLE_INTERNAL') || die();

function xmldb_quizaccess_proctoring_upgrade(int $oldversion): bool {
    global $DB;

    if ($oldversion < 2026090101) {
        upgrade_plugin_savepoint(true, 2026090101, 'quizaccess', 'proctoring');
    }

    if ($oldversion < 2026090102) {
        $dbman = $DB->get_manager();
        $table = new xmldb_table('quizaccess_proctoring');
        $fields = [
            new xmldb_field('controllevel', XMLDB_TYPE_CHAR, '10', null, XMLDB_NOTNULL, null, 'medium', 'failurepolicy'),
            new xmldb_field('policyversion', XMLDB_TYPE_CHAR, '64', null, XMLDB_NOTNULL, null, 'quiz-policy-1', 'controllevel'),
            new xmldb_field('policyjson', XMLDB_TYPE_TEXT, null, null, null, null, null, 'policyversion'),
        ];
        foreach ($fields as $field) {
            if (!$dbman->field_exists($table, $field)) {
                $dbman->add_field($table, $field);
            }
        }
        $DB->execute(
            'UPDATE {quizaccess_proctoring} SET policyjson = ? WHERE policyjson IS NULL',
            ['{}']
        );
        $policyjson = new xmldb_field('policyjson', XMLDB_TYPE_TEXT, null, null, XMLDB_NOTNULL, null, null, 'policyversion');
        $dbman->change_field_notnull($table, $policyjson);
        upgrade_plugin_savepoint(true, 2026090102, 'quizaccess', 'proctoring');
    }

    return true;
}
