<?php

namespace quizaccess_proctoring;

defined('MOODLE_INTERNAL') || die();

final class rule_test extends \advanced_testcase {
  public function test_saves_native_policy_settings(): void {
    $this->markTestIncomplete('Requires an installed Moodle test environment.');
  }

  public function test_unprepared_attempt_is_not_granted_access(): void {
    $this->markTestIncomplete('Requires an installed Moodle test environment.');
  }
}
