<?php

namespace local_proctoring\repository;

defined('MOODLE_INTERNAL') || die();

class event_repository {
  private $db;

  public function __construct($db = null) {
    global $DB;
    $this->db = $db ?? $DB;
  }

  public function insert_idempotent(int $sessionid, string $clienteventid, string $type, int $occurredat, array $metadata): \stdClass {
    $existing = $this->db->get_record('local_proctoring_event', [
      'sessionid' => $sessionid,
      'clienteventid' => $clienteventid,
    ]);
    if ($existing) {
      return $existing;
    }
    $now = time();
    $record = (object)[
      'sessionid' => $sessionid,
      'clienteventid' => substr($clienteventid, 0, 64),
      'type' => substr($type, 0, 64),
      'occurredat' => $occurredat,
      'metadata' => json_encode($metadata, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
      'timecreated' => $now,
    ];
    $id = $this->db->insert_record('local_proctoring_event', $record);
    return $this->db->get_record('local_proctoring_event', ['id' => $id], '*', MUST_EXIST);
  }

  public function find_by_session(int $sessionid): array {
    return array_values($this->db->get_records('local_proctoring_event', ['sessionid' => $sessionid], 'occurredat ASC, id ASC'));
  }
}
