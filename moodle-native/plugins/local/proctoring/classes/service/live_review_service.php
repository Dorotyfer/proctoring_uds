<?php

namespace local_proctoring\service;

use local_proctoring\repository\alert_repository;
use local_proctoring\repository\event_repository;

defined('MOODLE_INTERNAL') || die();

final class live_review_service {
  private $db;
  private $events;
  private $alerts;

  public function __construct($db = null, ?event_repository $events = null, ?alert_repository $alerts = null) {
    global $DB;
    $this->db = $db ?? $DB;
    $this->events = $events ?? new event_repository($this->db);
    $this->alerts = $alerts ?? new alert_repository($this->db);
  }

  public function publish_signal(int $sessionid, array $signal): void {
    $session = $this->db->get_record('local_proctoring_session', ['id' => $sessionid], '*', MUST_EXIST);
    $event = $this->events->insert_idempotent(
      $sessionid,
      (string)($signal['clienteventid'] ?? hash('sha256', uniqid('', true))),
      (string)$signal['type'],
      (int)($signal['occurredat'] ?? time()),
      is_array($signal['metadata'] ?? null) ? $signal['metadata'] : []
    );
    $this->alerts->create_for_event($event);
  }
}
