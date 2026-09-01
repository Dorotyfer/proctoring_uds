<?php

namespace local_proctoring\tests\external;

use local_proctoring\service\session_service;

defined('MOODLE_INTERNAL') || die();

final class session_service_test extends \advanced_testcase {
  public function test_attempt_owner_is_required(): void {
    global $USER;
    $this->resetAfterTest(true);
    $USER = (object)['id' => 22];
    $db = new class {
      public function get_record(string $table, array $conditions, string $fields = '*', int $strictness = 0): \stdClass {
        if ($table === 'quiz_attempts') {
          return (object)['id' => $conditions['id'], 'userid' => 99, 'quiz' => 1];
        }
        throw new \RuntimeException('Unexpected lookup in ownership test.');
      }
    };

    $this->expectException(\moodle_exception::class);
    (new session_service($db))->start_attempt(1);
  }

  public function test_start_attempt_returns_the_same_session_on_retry(): void {
    $this->markTestIncomplete('Requires the Moodle quiz attempt generator in an installed Moodle test environment.');
  }
}
