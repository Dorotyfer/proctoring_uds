<?php

namespace local_proctoring\tests;

defined('MOODLE_INTERNAL') || die();

final class settings_contract_test extends \advanced_testcase {
    public function test_unified_settings_use_local_proctoring_component(): void {
        $settings = file_get_contents(__DIR__ . '/../settings.php');

        $this->assertStringContainsString("new admin_setting_heading('local_proctoring/generalheading'", $settings);
        $this->assertStringContainsString("'local_proctoring/captureinterval'", $settings);
        $this->assertStringContainsString("'local_proctoring/lti_enabled'", $settings);
        $this->assertStringNotContainsString('udsmonitor', strtolower($settings));
    }
}
