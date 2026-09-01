<?php

namespace local_proctoring\tests;

defined('MOODLE_INTERNAL') || die();

final class panel_authorization_test extends \advanced_testcase {
  public function test_teacher_cannot_list_another_course(): void {
    $this->markTestIncomplete('Requires Moodle contexts, capabilities and panel fixtures.');
  }

  public function test_alert_review_does_not_modify_grade(): void {
    $this->markTestIncomplete('Requires Moodle quiz attempt and alert fixtures.');
  }
}
