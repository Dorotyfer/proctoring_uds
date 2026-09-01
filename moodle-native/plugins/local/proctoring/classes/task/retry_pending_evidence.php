<?php

namespace local_proctoring\task;

defined('MOODLE_INTERNAL') || die();

final class retry_pending_evidence extends \core\task\scheduled_task {
  public function get_name(): string {
    return get_string('taskretry', 'local_proctoring');
  }

  public function execute(): void {
    global $DB;
    $records = $DB->get_records('local_proctoring_alert', ['capturestatus' => 'pending'], 'id ASC', '*', 0, 100);
    foreach ($records as $alert) {
      $evidence = $DB->get_record('local_proctoring_evidence', ['eventid' => $alert->eventid]);
      $DB->set_field('local_proctoring_alert', 'capturestatus', $evidence ? 'available' : 'unavailable', ['id' => $alert->id]);
    }
  }
}
