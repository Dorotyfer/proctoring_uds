<?php

namespace local_proctoring\service;

use local_proctoring\repository\alert_repository;
use local_proctoring\repository\event_repository;

defined('MOODLE_INTERNAL') || die();

class event_service {
  private $sessions;
  private $events;
  private $alerts;

  public function __construct($db = null, ?session_service $sessions = null, ?event_repository $events = null, ?alert_repository $alerts = null) {
    global $DB;
    $db = $db ?? $DB;
    $this->sessions = $sessions ?? new session_service($db);
    $this->events = $events ?? new event_repository($db);
    $this->alerts = $alerts ?? new alert_repository($db);
  }

  public function record_batch(int $attemptid, array $items): array {
    $session = $this->sessions->owned_session($attemptid);
    $stored = [];
    $alerts = [];
    foreach ($items as $item) {
      $clienteventid = (string)($item['clienteventid'] ?? '');
      $type = (string)($item['type'] ?? '');
      if ($clienteventid === '' || $type === '') {
        throw new \invalid_parameter_exception('Event id and type are required.');
      }
      $metadata = $item['metadata'] ?? [];
      if (is_string($metadata)) {
        $metadata = json_decode($metadata, true) ?: [];
      }
      $event = $this->events->insert_idempotent(
        (int)$session->id,
        $clienteventid,
        $type,
        (int)($item['occurredat'] ?? time()),
        is_array($metadata) ? $metadata : []
      );
      $alert = $this->alerts->create_for_event($event);
      $stored[] = self::serialize_event($event);
      if ($alert) {
        $alerts[] = self::serialize_alert($alert);
      }
    }
    return ['sessionid' => (int)$session->id, 'events' => $stored, 'alerts' => $alerts];
  }

  public static function serialize_event(\stdClass $event): array {
    return [
      'id' => (int)$event->id,
      'sessionid' => (int)$event->sessionid,
      'clienteventid' => $event->clienteventid,
      'type' => $event->type,
      'occurredat' => (int)$event->occurredat,
      'metadata' => $event->metadata,
    ];
  }

  public static function serialize_alert(\stdClass $alert): array {
    return [
      'id' => (int)$alert->id,
      'sessionid' => (int)$alert->sessionid,
      'eventid' => (int)$alert->eventid,
      'type' => $alert->type,
      'severity' => $alert->severity,
      'status' => $alert->status,
      'capturestatus' => $alert->capturestatus,
      'timecreated' => (int)$alert->timecreated,
    ];
  }
}
