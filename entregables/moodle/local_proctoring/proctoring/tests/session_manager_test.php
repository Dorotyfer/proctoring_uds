<?php

namespace local_proctoring;

defined('MOODLE_INTERNAL') || die();

class session_manager_test extends \advanced_testcase {
    public function test_rejects_unsupported_device_mode(): void {
        $client = $this->createMock(api_client::class);
        $manager = new session_manager($client);
        $attempt = (object)['id' => 1];

        $this->expectException(\coding_exception::class);
        $manager->create_for_attempt($attempt, 'desktop');
    }
}
