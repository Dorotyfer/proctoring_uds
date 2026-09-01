<?php

namespace local_proctoring\tests;

defined('MOODLE_INTERNAL') || die();

final class evidence_service_test extends \advanced_testcase {
  public function test_rejects_evidence_larger_than_two_hundred_kilobytes(): void {
    $this->markTestIncomplete('Requires the Moodle File API in an installed Moodle test environment.');
  }

  public function test_student_cannot_authorize_another_session_evidence(): void {
    $this->markTestIncomplete('Requires the Moodle File API in an installed Moodle test environment.');
  }
}
