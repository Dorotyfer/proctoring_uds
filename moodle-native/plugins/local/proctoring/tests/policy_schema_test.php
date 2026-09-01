<?php

namespace local_proctoring\tests;

defined('MOODLE_INTERNAL') || die();

final class policy_schema_test extends \advanced_testcase {
    public function test_defaults_contain_all_unified_sections(): void {
        $policy = \local_proctoring\domain\policy_schema::defaults();

        $this->assertFalse($policy['enabled']);
        $this->assertSame('either', $policy['devicepolicy']);
        $this->assertSame('medium', $policy['controllevel']);
        $this->assertArrayHasKey('capture', $policy);
        $this->assertArrayHasKey('signals', $policy);
        $this->assertArrayHasKey('alerts', $policy);
        $this->assertArrayHasKey('identity', $policy);
        $this->assertArrayHasKey('risk', $policy);
        $this->assertArrayHasKey('privacy', $policy);
    }

    public function test_normalize_rejects_unknown_device_mode(): void {
        $result = \local_proctoring\domain\policy_schema::normalize([
            'devicepolicy' => 'desktop',
        ]);

        $this->assertContains('devicepolicy', $result['errors']);
        $this->assertFalse($result['valid']);
    }
}
