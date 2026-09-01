<?php

namespace local_proctoring\tests;

defined('MOODLE_INTERNAL') || die();

final class legacy_compatibility_service_test extends \advanced_testcase {
    public function test_legacy_ui_is_not_hidden_before_parity(): void {
        $service = new \local_proctoring\service\legacy_compatibility_service();

        $this->assertFalse($service->can_hide_legacy_ui());
    }

    public function test_parity_requires_zero_unmapped_fields(): void {
        $service = new \local_proctoring\service\legacy_compatibility_service();
        $result = $service->compare(41);

        $this->assertArrayHasKey('unmapped', $result);
        $this->assertArrayHasKey('equal', $result);
    }
}
