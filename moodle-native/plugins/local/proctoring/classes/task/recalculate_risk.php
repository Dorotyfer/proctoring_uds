<?php

namespace local_proctoring\task;

use local_proctoring\domain\risk_score;
use local_proctoring\repository\risk_repository;

defined('MOODLE_INTERNAL') || die();

final class recalculate_risk extends \core\task\scheduled_task {
  public function get_name(): string {
    return get_string('taskrisk', 'local_proctoring');
  }

  public function execute(): void {
    global $DB;
    $sessions = $DB->get_records_select('local_proctoring_session', 'timemodified >= ?', [time() - DAYSECS], 'id ASC', '*', 0, 100);
    $repository = new risk_repository($DB);
    foreach ($sessions as $session) {
      $events = [];
      foreach ($DB->get_records('local_proctoring_event', ['sessionid' => $session->id]) as $event) {
        $events[] = [
          'id' => $event->id,
          'type' => $event->type,
          'metadata' => json_decode($event->metadata, true) ?: [],
        ];
      }
      $repository->create((int)$session->id, risk_score::calculate($events), $session->policyversion);
    }
  }
}
