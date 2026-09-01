<?php

namespace local_proctoring\service;

use local_proctoring\repository\alert_repository;

defined('MOODLE_INTERNAL') || die();

final class panel_service {
  private $db;

  public function __construct($db = null) {
    global $DB;
    $this->db = $db ?? $DB;
  }

  public function list_courses(\context $context, array $filters = []): array {
    $search = trim((string)($filters['search'] ?? ''));
    $courses = [];
    foreach ($this->db->get_records('course', null, 'fullname ASC', 'id, fullname') as $course) {
      if ($search !== '' && stripos($course->fullname, $search) === false) {
        continue;
      }
      if (!$this->can_view_course((int)$course->id)) {
        continue;
      }
      $count = $this->db->count_records('local_proctoring_session', ['courseid' => $course->id]);
      if (!$count) {
        continue;
      }
      $openalerts = $this->db->count_records_sql(
        'SELECT COUNT(1) FROM {local_proctoring_alert} a JOIN {local_proctoring_session} s ON s.id = a.sessionid WHERE s.courseid = ? AND a.status = ?',
        [$course->id, 'open']
      );
      $courses[] = [
        'id' => (int)$course->id,
        'fullname' => format_string($course->fullname),
        'attempts' => (int)$count,
        'openalerts' => (int)$openalerts,
      ];
    }
    return ['courses' => $courses, 'total' => count($courses)];
  }

  public function list_attempts(int $courseid, array $filters = []): array {
    $this->require_course_access($courseid, 'local/proctoring:viewowncoursereports');
    $page = max(0, (int)($filters['page'] ?? 0));
    $pagesize = min(100, max(1, (int)($filters['pagesize'] ?? 25)));
    $conditions = ['s.courseid = :courseid'];
    $params = ['courseid' => $courseid];
    if (!empty($filters['status'])) {
      $conditions[] = 's.status = :status';
      $params['status'] = (string)$filters['status'];
    }
    if (!empty($filters['search'])) {
      $conditions[] = $this->db->sql_like("CONCAT(u.firstname, ' ', u.lastname)", ':search', false);
      $params['search'] = '%' . $this->db->sql_like_escape(trim((string)$filters['search'])) . '%';
    }
    $where = implode(' AND ', $conditions);
    $total = $this->db->count_records_sql(
      "SELECT COUNT(1) FROM {local_proctoring_session} s JOIN {user} u ON u.id = s.userid WHERE $where",
      $params
    );
    $records = $this->db->get_records_sql(
      "SELECT s.*, u.firstname, u.lastname, q.name AS quizname,
          (SELECT COUNT(1) FROM {local_proctoring_alert} a WHERE a.sessionid = s.id AND a.status = 'open') AS openalerts
       FROM {local_proctoring_session} s
       JOIN {user} u ON u.id = s.userid
       JOIN {quiz} q ON q.id = s.quizid
       WHERE $where ORDER BY s.timecreated DESC, s.id DESC",
      $params,
      $page * $pagesize,
      $pagesize
    );
    $attempts = [];
    foreach ($records as $record) {
      $attempts[] = [
        'id' => (int)$record->id,
        'attemptid' => (int)$record->attemptid,
        'userid' => (int)$record->userid,
        'studentname' => fullname((object)['firstname' => $record->firstname, 'lastname' => $record->lastname]),
        'quizname' => format_string($record->quizname),
        'status' => $record->status,
        'devicemode' => $record->devicemode,
        'controllevel' => $record->controllevel,
        'openalerts' => (int)$record->openalerts,
        'timecreated' => (int)$record->timecreated,
      ];
    }
    return [
      'attempts' => $attempts,
      'total' => (int)$total,
      'page' => $page,
      'pagesize' => $pagesize,
      'totalpages' => $pagesize ? (int)ceil($total / $pagesize) : 0,
    ];
  }

  public function get_session_detail(int $sessionid): array {
    $session = $this->db->get_record('local_proctoring_session', ['id' => $sessionid], '*', MUST_EXIST);
    $this->require_course_access((int)$session->courseid, 'local/proctoring:viewowncoursereports');
    $events = $this->db->get_records('local_proctoring_event', ['sessionid' => $sessionid], 'occurredat ASC, id ASC');
    $alerts = $this->db->get_records('local_proctoring_alert', ['sessionid' => $sessionid], 'timecreated DESC, id DESC');
    $evidence = $this->db->get_records('local_proctoring_evidence', ['sessionid' => $sessionid], 'timecreated ASC, id ASC');
    $risk = $this->db->get_record_sql(
      'SELECT * FROM {local_proctoring_riskscore} WHERE sessionid = ? ORDER BY calculatedat DESC, id DESC',
      [$sessionid]
    );
    $biometric = $this->db->get_record('local_proctoring_biocheck', ['sessionid' => $sessionid]);
    return [
      'session' => [
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
        'timecreated' => (int)$session->timecreated,
      ],
      'events' => array_map([self::class, 'serialize_event'], array_values($events)),
      'alerts' => array_map([self::class, 'serialize_alert'], array_values($alerts)),
      'evidence' => array_map([self::class, 'serialize_evidence'], array_values($evidence)),
      'risk' => $risk ? [
        'score' => (int)$risk->score,
        'category' => $risk->category,
        'factors' => json_decode($risk->factorsjson, true) ?: [],
        'calculatedat' => (int)$risk->calculatedat,
      ] : null,
      'biometric' => $biometric ? [
        'result' => $biometric->result,
        'similarity' => $biometric->similarity,
        'threshold' => $biometric->threshold,
        'timecreated' => (int)$biometric->timecreated,
      ] : null,
    ];
  }

  public function review_alert(int $alertid, string $status, string $note): array {
    global $USER;
    $alert = $this->db->get_record('local_proctoring_alert', ['id' => $alertid], '*', MUST_EXIST);
    $session = $this->db->get_record('local_proctoring_session', ['id' => $alert->sessionid], '*', MUST_EXIST);
    $this->require_course_access((int)$session->courseid, 'local/proctoring:reviewowncoursealerts');
    $reviewed = (new alert_repository($this->db))->review($alertid, (int)$USER->id, $status, $note);
    \local_proctoring\event\alert_reviewed::create([
      'context' => \context_course::instance((int)$session->courseid),
      'objectid' => $alertid,
      'userid' => (int)$USER->id,
      'relateduserid' => (int)$session->userid,
      'other' => ['status' => $status],
    ])->trigger();
    return ['alert' => self::serialize_alert($reviewed)];
  }

  public function reset_biometric_profile(int $userid): array {
    global $USER;
    if (!\has_capability('local/proctoring:viewbiometricevidence', \context_system::instance())) {
      throw new \required_capability_exception(\context_system::instance(), 'local/proctoring:viewbiometricevidence', 'nopermissions', 'local_proctoring');
    }
    $profile = $this->db->get_record('local_proctoring_biometric', ['userid' => $userid]);
    if (!$profile) {
      return ['userid' => $userid, 'status' => 'not_found'];
    }
    $now = time();
    $profile->status = 'revoked';
    $profile->activeversionid = null;
    $profile->timerevoked = $now;
    $profile->timemodified = $now;
    $this->db->update_record('local_proctoring_biometric', $profile);
    $this->db->set_field('local_proctoring_biover', 'status', 'revoked', ['profileid' => $profile->id]);
    $this->db->set_field('local_proctoring_biover', 'revokedat', $now, ['profileid' => $profile->id]);
    return ['userid' => $userid, 'status' => 'revoked', 'actorid' => (int)$USER->id];
  }

  private function can_view_course(int $courseid): bool {
    $context = \context_course::instance($courseid);
    return \has_capability('local/proctoring:viewowncoursereports', $context)
      || \has_capability('local/proctoring:viewinstitutionreports', \context_system::instance());
  }

  private function require_course_access(int $courseid, string $capability): void {
    $coursecontext = \context_course::instance($courseid);
    if (\has_capability('local/proctoring:viewinstitutionreports', \context_system::instance())) {
      return;
    }
    if (!\has_capability($capability, $coursecontext)) {
      throw new \required_capability_exception($coursecontext, $capability, 'nopermissions', 'local_proctoring');
    }
  }

  private static function serialize_event(\stdClass $event): array {
    return [
      'id' => (int)$event->id,
      'type' => $event->type,
      'occurredat' => (int)$event->occurredat,
      'metadata' => json_decode($event->metadata, true) ?: [],
    ];
  }

  private static function serialize_alert(\stdClass $alert): array {
    return [
      'id' => (int)$alert->id,
      'eventid' => (int)$alert->eventid,
      'type' => $alert->type,
      'severity' => $alert->severity,
      'status' => $alert->status,
      'capturestatus' => $alert->capturestatus,
      'reviewedby' => (int)($alert->reviewedby ?? 0),
      'reviewnote' => $alert->reviewnote ?? '',
      'timereviewed' => (int)($alert->timereviewed ?? 0),
      'timecreated' => (int)$alert->timecreated,
    ];
  }

  private static function serialize_evidence(\stdClass $evidence): array {
    return [
      'id' => (int)$evidence->id,
      'eventid' => (int)($evidence->eventid ?? 0),
      'kind' => $evidence->kind,
      'filesize' => (int)$evidence->filesize,
      'filename' => $evidence->filename,
      'expiresat' => (int)$evidence->expiresat,
      'deletedat' => (int)($evidence->deletedat ?? 0),
    ];
  }
}
