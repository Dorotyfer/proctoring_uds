<?php

namespace local_proctoring\tests;

defined('MOODLE_INTERNAL') || die();

final class legacy_policy_mapper_test extends \advanced_testcase {
    public function test_maps_legacy_quiz_controls(): void {
        $result = \local_proctoring\domain\legacy_policy_mapper::map_quiz([
            'udsm_enabled' => 1,
            'udsm_interval' => 15,
            'udsm_tabswitch' => 1,
            'udsm_maxwarnings' => 3,
            'udsm_action' => 'close',
            'udsm_identitycheck' => 1,
            'udsm_identitythresh' => 0.72,
        ]);

        $this->assertTrue($result['policy']['enabled']);
        $this->assertSame(15, $result['policy']['capture']['interval']);
        $this->assertTrue($result['policy']['signals']['page_visibility_changed']['enabled']);
        $this->assertSame(3, $result['policy']['alerts']['maxwarnings']);
        $this->assertTrue($result['policy']['identity']['enabled']);
        $this->assertSame(0.72, $result['policy']['identity']['threshold']);
    }

    public function test_unknown_legacy_keys_become_warnings(): void {
        $result = \local_proctoring\domain\legacy_policy_mapper::map_quiz([
            'udsm_future_option' => 'on',
        ]);

        $this->assertNotEmpty($result['warnings']);
        $this->assertSame([], $result['policy']['signals']);
    }

    public function test_global_mapping_does_not_return_secrets(): void {
        $result = \local_proctoring\domain\legacy_policy_mapper::map_global([
            'keepcapturedays' => 14,
            'maximagekb' => 128,
            'defaultidentitythresh' => 0.8,
            'encryptionkey' => 'must-not-be-copied',
        ]);

        $this->assertSame(14, $result['settings']['retentiondays']);
        $this->assertSame(128, $result['settings']['maximagekb']);
        $this->assertSame(0.8, $result['settings']['biometricthreshold']);
        $this->assertStringNotContainsString('must-not-be-copied', json_encode($result));
    }
}
