<?php

namespace local_proctoring\tests;

defined('MOODLE_INTERNAL') || die();

final class biometric_service_test extends \advanced_testcase {
  public function test_biometric_mismatch_creates_a_mismatch_result(): void {
    $this->markTestIncomplete('Requires the Moodle database and encryption settings in an installed Moodle test environment.');
  }
}
