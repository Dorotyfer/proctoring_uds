<?php

namespace local_proctoring\repository;

use local_proctoring\domain\policy_validator;
use local_proctoring\domain\session_state;

defined('MOODLE_INTERNAL') || die();

class session_repository {
  private $db;

  public function __construct($db = null) {
    global $DB;
    $this->db = $db ?? $DB;
  }

  public function find_by_attempt(int $attemptid): ?\stdClass {
    $record = $this->db->get_record('local_proctoring_session', ['attemptid' => $attemptid]);
    return $record ?: null;
  }

  public function create_for_attempt(\stdClass $attempt, array $policy): \stdClass {
    $existing = $this->find_by_attempt((int)$attempt->id);
    if ($existing) {
      return $existing;
    }

    $validated = policy_validator::validate($policy);
    if (!$validated['valid']) {
      throw new \invalid_argument_exception('Invalid proctoring policy.');
    }
    $policy = $validated['policy'];
    $quizid = (int)($attempt->quizid ?? $attempt->quiz ?? 0);
    $courseid = (int)($attempt->courseid ?? $attempt->course ?? 0);
    if (!$courseid && $quizid) {
      $quiz = $this->db->get_record('quiz', ['id' => $quizid], 'id, course', IGNORE_MISSING);
      $courseid = (int)($quiz->course ?? 0);
    }
    $now = time();
    $record = (object)[
      'attemptid' => (int)$attempt->id,
      'userid' => (int)$attempt->userid,
      'courseid' => $courseid,
      'quizid' => $quizid,
      'policyid' => (int)($policy['id'] ?? 0) ?: null,
      'policyversion' => $policy['version'],
      'policysnapshot' => self::encode($policy),
      'devicemode' => 'browser',
      'devicepolicy' => $policy['devicepolicy'],
      'controllevel' => $policy['controllevel'],
      'status' => 'pending',
      'expiresat' => $now + max(60, (int)($policy['durationseconds'] ?? 7200)),
      'timeissued' => $now,
      'timecreated' => $now,
      'timemodified' => $now,
    ];
    $id = $this->db->insert_record('local_proctoring_session', $record);
    return $this->db->get_record('local_proctoring_session', ['id' => $id], '*', MUST_EXIST);
  }

  public function transition(int $sessionid, string $status): \stdClass {
    $session = $this->db->get_record('local_proctoring_session', ['id' => $sessionid], '*', MUST_EXIST);
    if (!session_state::can_transition((string)$session->status, $status)) {
      throw new \moodle_exception('invalidsessiontransition', 'local_proctoring');
    }
    $now = time();
    $session->status = $status;
    $session->timemodified = $now;
    if ($status === 'active') {
      $session->timeactivated = $now;
    } elseif ($status === 'completed') {
      $session->timecompleted = $now;
    }
    $this->db->update_record('local_proctoring_session', $session);
    return $session;
  }

  public function prepare_and_activate(int $sessionid, string $devicemode): \stdClass {
    $session = $this->db->get_record('local_proctoring_session', ['id' => $sessionid], '*', MUST_EXIST);
    if (!in_array($devicemode, ['browser', 'seb'], true)) {
      throw new \invalid_parameter_exception('Invalid device mode.');
    }
    $session->devicemode = $devicemode;
    $session->timeprepared = time();
    $session->timemodified = time();
    $this->db->update_record('local_proctoring_session', $session);
    return $this->transition($sessionid, 'active');
  }

  private static function encode(array $value): string {
    return json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  }
}
