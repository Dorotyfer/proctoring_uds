<?php

namespace local_proctoring\tests;

defined('MOODLE_INTERNAL') || die();

final class task_test extends \advanced_testcase {
  public function test_expired_evidence_is_removed_idempotently(): void {
    $this->markTestIncomplete('Requires Moodle scheduled-task fixtures in an installed Moodle test environment.');
  }
}
