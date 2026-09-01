<?php

namespace quizaccess_proctoring;

defined('MOODLE_INTERNAL') || die();

final class observer_test extends \advanced_testcase {
  public function test_started_attempt_gets_one_native_session(): void {
    $this->markTestIncomplete('Requires an installed Moodle test environment.');
  }

  public function test_finished_attempt_transitions_active_session(): void {
    $this->markTestIncomplete('Requires an installed Moodle test environment.');
  }
}
