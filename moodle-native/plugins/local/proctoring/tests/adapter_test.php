<?php

namespace local_proctoring\tests;

defined('MOODLE_INTERNAL') || die();

final class adapter_test extends \advanced_testcase {
  public function test_invalid_adapter_signature_is_rejected(): void {
    $this->markTestIncomplete('Requires adapter fixtures in an installed Moodle test environment.');
  }
}
