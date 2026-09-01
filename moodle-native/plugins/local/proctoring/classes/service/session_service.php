<?php

namespace local_proctoring\service;

use local_proctoring\repository\session_repository;

defined('MOODLE_INTERNAL') || die();

class session_service {
  private $db;
  private $sessions;

  public function __construct($db = null, ?session_repository $sessions = null) {
    global $DB;
    $this->db = $db ?? $DB;
    $this->sessions = $sessions ?? new session_repository($this->db);
  }

  public function start_attempt(int $attemptid): array {
    $attempt = $this->owned_attempt($attemptid);
    $session = $this->sessions->create_for_attempt($attempt, $this->policy_for_quiz((int)$attempt->quiz));
    return self::serialize_session($session);
  }

  public function get_attempt(int $attemptid): array {
    $this->owned_attempt($attemptid);
    $session = $this->sessions->find_by_attempt($attemptid);
    return [
      'found' => (bool)$session,
      'session' => $session ? self::serialize_session($session) : null,
    ];
  }

  public function activate_attempt(int $attemptid, array $input): array {
    $attempt = $this->owned_attempt($attemptid);
    $session = $this->sessions->find_by_attempt($attemptid);
    if (!$session) {
      $this->start_attempt($attemptid);
      $session = $this->sessions->find_by_attempt($attemptid);
    }
    if (($input['prepared'] ?? false) !== true || ($input['consent'] ?? false) !== true) {
      throw new \moodle_exception('preparationrequired', 'local_proctoring');
    }
    $session = $this->sessions->prepare_and_activate($session->id, (string)($input['devicemode'] ?? 'browser'));
    return self::serialize_session($session);
  }

  public function complete_attempt(int $attemptid): array {
    $this->owned_attempt($attemptid);
    $session = $this->sessions->find_by_attempt($attemptid);
    if (!$session) {
      throw new \moodle_exception('sessionnotfound', 'local_proctoring');
    }
    if ($session->status === 'active') {
      $session = $this->sessions->transition((int)$session->id, 'completed');
    }
    return self::serialize_session($session);
  }

  public function owned_session(int $attemptid): \stdClass {
    $this->owned_attempt($attemptid);
    $session = $this->sessions->find_by_attempt($attemptid);
    if (!$session) {
      throw new \moodle_exception('sessionnotfound', 'local_proctoring');
    }
    return $session;
  }

  private function owned_attempt(int $attemptid): \stdClass {
    global $USER;
    $attempt = $this->db->get_record('quiz_attempts', ['id' => $attemptid], '*', MUST_EXIST);
    if ((int)$attempt->userid !== (int)$USER->id) {
      throw new \moodle_exception('nopermission', 'local_proctoring');
    }
    return $attempt;
  }

  private function policy_for_quiz(int $quizid): array {
    $records = $this->db->get_records('local_proctoring_policy', ['quizid' => $quizid], 'timecreated DESC', '*', 0, 1);
    $record = reset($records);
    if (!$record) {
      return [
        'version' => 'native-policy-v1',
        'signals' => [],
        'devicepolicy' => 'either',
        'controllevel' => 'medium',
      ];
    }
    $policy = json_decode($record->policyjson, true) ?: [];
    $policy['id'] = (int)$record->id;
    $policy['version'] = $record->version;
    return $policy;
  }

  public static function serialize_session(\stdClass $session): array {
    return [
      'id' => (int)$session->id,
      'attemptid' => (int)$session->attemptid,
      'userid' => (int)$session->userid,
      'courseid' => (int)$session->courseid,
      'quizid' => (int)$session->quizid,
      'status' => $session->status,
      'devicemode' => $session->devicemode,
      'devicepolicy' => $session->devicepolicy,
      'controllevel' => $session->controllevel,
      'policyversion' => $session->policyversion,
      'policysnapshot' => $session->policysnapshot,
      'expiresat' => (int)$session->expiresat,
      'timeissued' => (int)$session->timeissued,
      'timeprepared' => (int)($session->timeprepared ?? 0),
      'timeactivated' => (int)($session->timeactivated ?? 0),
      'timecompleted' => (int)($session->timecompleted ?? 0),
    ];
  }
}
