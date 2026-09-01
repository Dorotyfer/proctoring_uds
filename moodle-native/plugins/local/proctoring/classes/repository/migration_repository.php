<?php

namespace local_proctoring\repository;

defined('MOODLE_INTERNAL') || die();

final class migration_repository {
    private $db;

    public function __construct($db = null) {
        global $DB;
        $this->db = $db ?? $DB;
    }

    public function record(array $entry): int {
        $existing = $this->find(
            (string)$entry['migrationversion'],
            (string)$entry['sourcekey'],
            (int)($entry['quizid'] ?? 0),
            (string)$entry['targetkey']
        );
        if ($existing) {
            $entry['id'] = $existing->id;
            $this->db->update_record('local_proctoring_migration', (object)$entry);
            return (int)$existing->id;
        }
        return (int)$this->db->insert_record('local_proctoring_migration', (object)$entry);
    }

    public function find(string $migrationversion, string $sourcekey, int $quizid = 0, string $targetkey = ''): ?\stdClass {
        $params = [
            'migrationversion' => $migrationversion,
            'sourcekey' => $sourcekey,
            'quizid' => $quizid,
        ];
        return $this->db->get_record('local_proctoring_migration', $params) ?: null;
    }
}
