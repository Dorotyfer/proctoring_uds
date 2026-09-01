<?php

namespace local_proctoring\service;

use local_proctoring\domain\legacy_policy_mapper;
use local_proctoring\repository\legacy_settings_repository;
use local_proctoring\repository\migration_repository;

defined('MOODLE_INTERNAL') || die();

final class legacy_migration_service {
    private const VERSION = 'legacy-udsmonitor-v1';
    private $legacy;
    private $migrations;
    private $mapper;
    private $policies;
    private $db;

    public function __construct(
        ?legacy_settings_repository $legacy = null,
        ?migration_repository $migrations = null,
        ?legacy_policy_mapper $mapper = null,
        ?quiz_policy_service $policies = null,
        $db = null
    ) {
        global $DB;
        $this->db = $db ?? $DB;
        $this->legacy = $legacy ?? new legacy_settings_repository($this->db);
        $this->migrations = $migrations ?? new migration_repository($this->db);
        $this->mapper = $mapper ?? new legacy_policy_mapper();
        $this->policies = $policies ?? new quiz_policy_service($this->db);
    }

    public function preview(): array {
        $available = $this->legacy->has_component('quizaccess_udsmonitor');
        if (!$available) {
            return [
                'dryrun' => true,
                'sourceavailable' => false,
                'globalkeys' => [],
                'quizzes_seen' => 0,
                'mapped' => 0,
                'warnings' => [],
            ];
        }

        $global = $this->legacy->read_global();
        $quizzes = $this->legacy->read_quiz_policies();
        $globalmap = $this->mapper::map_global($global);
        $warnings = $globalmap['warnings'];
        $mapped = 0;
        foreach ($quizzes as $quizid => $source) {
            $mappedpolicy = $this->mapper::map_quiz($source);
            $mapped++;
            foreach ($mappedpolicy['warnings'] as $warning) {
                $warnings[] = 'quiz:' . $quizid . ':' . $warning;
            }
        }

        return [
            'dryrun' => true,
            'sourceavailable' => true,
            'globalkeys' => array_keys($globalmap['settings']),
            'quizzes_seen' => count($quizzes),
            'mapped' => $mapped,
            'warnings' => array_values(array_unique($warnings)),
            'redacted_sources' => $globalmap['redacted_sources'],
        ];
    }

    public function migrate(int $actorid, bool $dryrun = true, ?int $quizid = null): array {
        $preview = $this->preview();
        if ($dryrun || !$preview['sourceavailable']) {
            return $preview;
        }

        $global = $this->legacy->read_global();
        $globalmap = $this->mapper::map_global($global);
        foreach ($globalmap['settings'] as $key => $value) {
            set_config($key, $value, 'local_proctoring');
            $this->audit($actorid, 'global:' . $key, 0, 'local_proctoring/' . $key, 'mapped', '');
        }

        $quizzes = $this->legacy->read_quiz_policies();
        $migrated = 0;
        $warnings = $globalmap['warnings'];
        foreach ($quizzes as $sourcequizid => $source) {
            if ($quizid !== null && (int)$sourcequizid !== $quizid) {
                continue;
            }
            $quiz = $this->db->get_record('quiz', ['id' => $sourcequizid]);
            if (!$quiz) {
                $warnings[] = 'quiz_missing:' . (int)$sourcequizid;
                continue;
            }
            $mapped = $this->mapper::map_quiz($source);
            $this->policies->save_policy($quiz, $mapped['policy'], $actorid);
            $migrated++;
            foreach ($mapped['sourcekeys'] as $sourcekey) {
                $this->audit($actorid, 'quiz:' . $sourcekey, (int)$sourcequizid, 'quiz_policy', 'mapped', '');
            }
            foreach ($mapped['warnings'] as $warning) {
                $warnings[] = 'quiz:' . (int)$sourcequizid . ':' . $warning;
                $this->audit($actorid, 'quiz:warning', (int)$sourcequizid, 'quiz_policy', 'warning', $warning);
            }
        }

        set_config('legacymigrationversion', self::VERSION, 'local_proctoring');
        return [
            'dryrun' => false,
            'sourceavailable' => true,
            'globalkeys' => array_keys($globalmap['settings']),
            'quizzes_seen' => count($quizzes),
            'migrated' => $migrated,
            'warnings' => array_values(array_unique($warnings)),
        ];
    }

    public function status(): array {
        $version = (string)get_config('local_proctoring', 'legacymigrationversion');
        $count = 0;
        if ($this->db->get_manager()->table_exists(new \xmldb_table('local_proctoring_migration'))) {
            $count = $this->db->count_records('local_proctoring_migration', ['migrationversion' => self::VERSION]);
        }
        return [
            'version' => $version,
            'complete' => $version === self::VERSION,
            'auditcount' => $count,
        ];
    }

    private function audit(int $actorid, string $sourcekey, int $quizid, string $targetkey, string $status, string $message): void {
        $this->migrations->record([
            'migrationversion' => self::VERSION,
            'sourcecomponent' => 'quizaccess_udsmonitor',
            'sourcekey' => $sourcekey,
            'quizid' => $quizid,
            'targetkey' => $targetkey,
            'status' => $status,
            'message' => $message,
            'timecreated' => time(),
            'actorid' => $actorid,
        ]);
    }
}
