<?php

namespace local_proctoring\repository;

defined('MOODLE_INTERNAL') || die();

final class legacy_settings_repository {
    private $db;

    public function __construct($db = null) {
        global $DB;
        $this->db = $db ?? $DB;
    }

    public function has_component(string $component): bool {
        return array_key_exists($component, get_plugin_list('quizaccess'));
    }

    public function read_global(): array {
        if (!$this->has_component('quizaccess_udsmonitor')) {
            return [];
        }

        $settings = [];
        foreach (['keepcapturedays', 'maximagekb', 'defaultidentitythresh', 'encryptionkey'] as $name) {
            $value = get_config('quizaccess_udsmonitor', $name);
            if ($value !== false && $value !== null && $value !== '') {
                $settings[$name] = $value;
            }
        }
        return $settings;
    }

    public function read_quiz_policies(): array {
        if (!$this->has_component('quizaccess_udsmonitor')) {
            return [];
        }

        foreach (['quizaccess_udsmonitor', 'quizaccess_udsmonitor_settings', 'quizaccess_udsmonitor_config'] as $tablename) {
            if (!$this->table_exists($tablename)) {
                continue;
            }
            $records = $this->db->get_records($tablename);
            $policies = [];
            foreach ($records as $record) {
                $quizid = (int)($record->quizid ?? $record->quiz ?? 0);
                if ($quizid > 0) {
                    $policies[$quizid] = (array)$record;
                }
            }
            return $policies;
        }

        return [];
    }

    private function table_exists(string $tablename): bool {
        return $this->db->get_manager()->table_exists(new \xmldb_table($tablename));
    }
}
