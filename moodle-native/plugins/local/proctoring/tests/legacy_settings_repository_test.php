<?php

namespace local_proctoring\tests;

defined('MOODLE_INTERNAL') || die();

final class legacy_settings_repository_test extends \advanced_testcase {
    public function test_missing_legacy_component_is_safe(): void {
        $repository = new \local_proctoring\repository\legacy_settings_repository($GLOBALS['DB']);

        $this->assertFalse($repository->has_component('quizaccess_udsmonitor'));
        $this->assertSame([], $repository->read_global());
        $this->assertSame([], $repository->read_quiz_policies());
    }

    public function test_migration_table_is_declared(): void {
        $xml = file_get_contents(__DIR__ . '/../db/install.xml');

        $this->assertStringContainsString('TABLE NAME="local_proctoring_migration"', $xml);
        $this->assertStringContainsString('FIELD NAME="migrationversion"', $xml);
    }
}
