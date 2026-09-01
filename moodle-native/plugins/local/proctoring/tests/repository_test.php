<?php

namespace local_proctoring\tests;

use local_proctoring\repository\event_repository;
use local_proctoring\repository\session_repository;

defined('MOODLE_INTERNAL') || die();

final class repository_test extends \advanced_testcase {
  public function test_session_creation_is_idempotent_for_attempt(): void {
    global $DB;
    $this->resetAfterTest(true);
    $user = $this->getDataGenerator()->create_user();
    $course = $this->getDataGenerator()->create_course();
    $quiz = $this->getDataGenerator()->create_module('quiz', ['course' => $course->id]);
    $attempt = (object)['id' => 101, 'userid' => $user->id, 'quiz' => $quiz->id, 'course' => $course->id];
    $repository = new session_repository($DB);

    $first = $repository->create_for_attempt($attempt, ['version' => 'v1', 'signals' => []]);
    $second = $repository->create_for_attempt($attempt, ['version' => 'v1', 'signals' => []]);

    $this->assertSame($first->id, $second->id);
    $this->assertSame(1, $DB->count_records('local_proctoring_session', ['attemptid' => $attempt->id]));
  }

  public function test_event_insertion_is_idempotent_by_client_event_id(): void {
    global $DB;
    $this->resetAfterTest(true);
    $repository = new event_repository($DB);

    $first = $repository->insert_idempotent(1, 'client-1', 'face_absent', time(), []);
    $second = $repository->insert_idempotent(1, 'client-1', 'face_absent', time(), []);

    $this->assertSame($first->id, $second->id);
  }
}
