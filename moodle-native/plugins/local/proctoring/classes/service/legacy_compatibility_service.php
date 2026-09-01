<?php

namespace local_proctoring\service;

use local_proctoring\domain\legacy_policy_mapper;
use local_proctoring\repository\legacy_settings_repository;

defined('MOODLE_INTERNAL') || die();

final class legacy_compatibility_service {
    private const MIGRATION_VERSION = 'legacy-udsmonitor-v1';
    private $legacy;
    private $policies;

    public function __construct($db = null) {
        global $DB;
        $db = $db ?? $DB;
        $this->legacy = new legacy_settings_repository($db);
        $this->policies = new quiz_policy_service($db);
    }

    public function compare(int $quizid): array {
        $legacy = $this->legacy->read_quiz_policies();
        $source = $legacy[$quizid] ?? [];
        $mapped = legacy_policy_mapper::map_quiz($source);
        $native = $this->policies->for_quiz($quizid);
        $different = [];
        foreach (['enabled', 'devicepolicy', 'controllevel', 'failurepolicy'] as $key) {
            if (($mapped['policy'][$key] ?? null) !== ($native[$key] ?? null)) {
                $different[] = $key;
            }
        }

        return [
            'quizid' => $quizid,
            'equal' => $different === [] && $source !== [],
            'different' => $different,
            'unmapped' => $mapped['warnings'],
            'missing' => $source === [] ? ['legacy_policy'] : [],
        ];
    }

    public function can_hide_legacy_ui(): bool {
        $status = $this->legacy_status();
        return $status['migrationcomplete'] && $status['verified'] && $status['unmapped'] === 0;
    }

    public function legacy_status(): array {
        $migrationversion = (string)get_config('local_proctoring', 'legacymigrationversion');
        $verified = (bool)get_config('local_proctoring', 'legacymigrationverified');
        $unmapped = 0;
        if ($this->legacy->has_component('quizaccess_udsmonitor')) {
            foreach ($this->legacy->read_quiz_policies() as $source) {
                $unmapped += count(legacy_policy_mapper::map_quiz($source)['warnings']);
            }
        }
        return [
            'installed' => $this->legacy->has_component('quizaccess_udsmonitor'),
            'migrationversion' => $migrationversion,
            'migrationcomplete' => $migrationversion === self::MIGRATION_VERSION,
            'verified' => $verified,
            'unmapped' => $unmapped,
        ];
    }
}
