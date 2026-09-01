<?php

namespace local_proctoring\tests;

defined('MOODLE_INTERNAL') || die();

final class privacy_provider_test extends \advanced_testcase {
  public function test_user_data_is_exportable_and_deletable(): void {
    $this->markTestIncomplete('Requires Moodle Privacy API and File API in an installed Moodle test environment.');
  }
}
