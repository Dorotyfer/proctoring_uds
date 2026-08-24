<?php

defined('MOODLE_INTERNAL') || die();

function xmldb_local_proctoring_upgrade($oldversion): bool {
    global $DB;

    $dbman = $DB->get_manager();
    if ($oldversion < 2026082101) {
        $legacytable = new xmldb_table('quizaccess_proctorpy_idph');
        if (!$dbman->table_exists($legacytable)) {
            $legacytable->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE);
            $legacytable->add_field('userid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL);
            $legacytable->add_field('fileid', XMLDB_TYPE_INTEGER, '10', null, null);
            $legacytable->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
            $legacytable->add_key('fk_user', XMLDB_KEY_FOREIGN, ['userid'], 'user', ['id']);
            $dbman->create_table($legacytable);
        }

        upgrade_plugin_savepoint(true, 2026082101, 'local', 'proctoring');
    }

    return true;
}
