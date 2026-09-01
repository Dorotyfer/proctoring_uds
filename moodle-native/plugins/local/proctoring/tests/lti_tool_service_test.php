<?php

namespace local_proctoring\tests;

defined('MOODLE_INTERNAL') || die();

final class lti_tool_service_test extends \advanced_testcase {
    public function test_registration_is_idempotent_and_named_proctoring(): void {
        $service = new \local_proctoring\service\lti_tool_service($GLOBALS['DB']);

        $first = $service->ensure_registered();
        $second = $service->ensure_registered();

        $this->assertSame('Proctoring', $first['name']);
        $this->assertSame($first['id'], $second['id']);
        $this->assertSame('/local/proctoring/lti/launch.php', parse_url($first['launchurl'], PHP_URL_PATH));
        $this->assertSame(1, $GLOBALS['DB']->count_records('lti_types', ['name' => 'Proctoring']));
    }
}
