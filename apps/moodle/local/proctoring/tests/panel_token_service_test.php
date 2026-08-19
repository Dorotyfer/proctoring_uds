<?php

namespace local_proctoring;

defined('MOODLE_INTERNAL') || die();

class panel_token_service_test extends \advanced_testcase {
    public function test_issues_short_lived_course_scoped_token(): void {
        $this->resetAfterTest();
        set_config('panelssosecret', 'panel-sso-secret-with-at-least-32-characters', 'local_proctoring');

        $service = new panel_token_service();
        $token = $service->issue(
            42,
            ['local/proctoring:viewowncoursereports'],
            [10, 20],
            [10]
        );
        $parts = explode('.', $token);
        $payload = json_decode($this->decode_base64url($parts[1]), true);

        $this->assertCount(3, $parts);
        $this->assertSame('42', $payload['moodleUserId']);
        $this->assertSame(['10', '20'], $payload['courseIds']);
        $this->assertSame(['10'], $payload['reviewCourseIds']);
        $this->assertLessThanOrEqual(time() + 120, $payload['exp']);
    }

    private function decode_base64url(string $value): string {
        return base64_decode(strtr($value, '-_', '+/'));
    }
}
