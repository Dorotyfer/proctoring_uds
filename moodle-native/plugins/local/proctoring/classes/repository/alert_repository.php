<?php

namespace local_proctoring\repository;

use local_proctoring\domain\alert_policy;

defined('MOODLE_INTERNAL') || die();

class alert_repository {
  private $db;

  public function __construct($db = null) {
    global $DB;
    $this->db = $db ?? $DB;
  }

  public function create_for_event(\stdClass $event): ?\stdClass {
    $severity = alert_policy::severity_for_type((string)$event->type);
    if ($severity === null) {
      return null;
    }
    $existing = $this->db->get_record('local_proctoring_alert', ['eventid' => $event->id]);
    if ($existing) {
      return $existing;
    }
    $record = (object)[
      'sessionid' => (int)$event->sessionid,
      'eventid' => (int)$event->id,
      'type' => $event->type,
      'severity' => $severity,
      'status' => 'open',
      'capturestatus' => 'pending',
      'timecreated' => time(),
    ];
    $id = $this->db->insert_record('local_proctoring_alert', $record);
    return $this->db->get_record('local_proctoring_alert', ['id' => $id], '*', MUST_EXIST);
  }

  public function find_by_session(int $sessionid): array {
    return array_values($this->db->get_records('local_proctoring_alert', ['sessionid' => $sessionid], 'timecreated DESC, id DESC'));
  }

  public function review(int $alertid, int $reviewerid, string $status, string $note): \stdClass {
    if (!in_array($status, ['reviewed', 'dismissed'], true)) {
      throw new \invalid_parameter_exception('Invalid alert review status.');
    }
    $alert = $this->db->get_record('local_proctoring_alert', ['id' => $alertid], '*', MUST_EXIST);
    $alert->status = $status;
    $alert->reviewedby = $reviewerid;
    $alert->reviewnote = clean_param($note, PARAM_TEXT);
    $alert->timereviewed = time();
    $this->db->update_record('local_proctoring_alert', $alert);
    return $alert;
  }
}
