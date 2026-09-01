<?php

namespace local_proctoring\tests;

defined('MOODLE_INTERNAL') || die();

final class quiz_policy_service_test extends \advanced_testcase {
    public function test_form_policy_merges_defaults_and_explicit_values(): void {
        $service = new \local_proctoring\service\quiz_policy_service();
        $quiz = (object)[
            'id' => 41,
            'course' => 7,
            'proctoringenabled' => 1,
            'proctoringallowedmode' => 'browser',
            'proctoringfailurepolicy' => 'allow_with_alert',
            'proctoringcontrollevel' => 'high',
            'proctoringsignals' => json_encode(['page_visibility_changed']),
        ];

        $policy = $service->from_quiz_form($quiz);

        $this->assertTrue($policy['enabled']);
        $this->assertSame('browser', $policy['devicepolicy']);
        $this->assertSame('allow_with_alert', $policy['failurepolicy']);
        $this->assertSame('high', $policy['controllevel']);
    }
}
