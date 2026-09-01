<?php

namespace local_proctoring\tests;

defined('MOODLE_INTERNAL') || die();

final class lti_launch_service_test extends \advanced_testcase {
    public function test_reviewer_launches_to_scoped_panel(): void {
        $service = new \local_proctoring\service\lti_launch_service();

        $url = $service->resolve_destination([
            'courseid' => 7,
            'userid' => 2,
            'reviewer' => true,
        ]);

        $this->assertSame('/local/proctoring/index.php', $url->get_path());
        $this->assertSame('7', $url->get_param('courseid'));
    }
}
