<?php

namespace local_proctoring\tests;

defined('MOODLE_INTERNAL') || die();

final class legacy_migration_service_test extends \advanced_testcase {
    public function test_preview_does_not_write_native_policy(): void {
        $service = new \local_proctoring\service\legacy_migration_service(
            new \local_proctoring\repository\legacy_settings_repository($GLOBALS['DB']),
            new \local_proctoring\repository\migration_repository($GLOBALS['DB']),
            new \local_proctoring\domain\legacy_policy_mapper(),
            new \local_proctoring\service\quiz_policy_service($GLOBALS['DB'])
        );

        $result = $service->migrate(2, true);

        $this->assertTrue($result['dryrun']);
        $this->assertGreaterThanOrEqual(0, $result['quizzes_seen']);
        $this->assertSame(0, $GLOBALS['DB']->count_records('quizaccess_proctoring'));
    }
}
