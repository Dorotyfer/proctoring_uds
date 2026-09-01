<?php

namespace local_proctoring\service;

defined('MOODLE_INTERNAL') || die();

class incident_service {
  private $events;

  public function __construct(?event_service $events = null) {
    $this->events = $events ?? new event_service();
  }

  public function record(int $attemptid, array $incident): array {
    $incident['clienteventid'] = (string)($incident['clienteventid'] ?? hash('sha256', uniqid('', true)));
    $incident['occurredat'] = (int)($incident['occurredat'] ?? time());
    return $this->events->record_batch($attemptid, [$incident]);
  }
}
