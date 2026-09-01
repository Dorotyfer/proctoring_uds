<?php

namespace local_proctoring\task;

defined('MOODLE_INTERNAL') || die();

final class purge_expired_evidence extends \core\task\scheduled_task {
  public function get_name(): string {
    return get_string('taskpurge', 'local_proctoring');
  }

  public function execute(): void {
    global $DB;
    $admin = get_admin();
    $now = time();
    $files = \get_file_storage();
    $records = $DB->get_records_select('local_proctoring_evidence', '(deletedat = 0 OR deletedat IS NULL) AND expiresat > 0 AND expiresat < ?', [$now], 'id ASC', '*', 0, 100);
    foreach ($records as $evidence) {
      $file = $files->get_file(\context_system::instance()->id, 'local_proctoring', $evidence->filearea, $evidence->itemid, $evidence->filepath, $evidence->filename);
      $file?->delete();
      $audit = (object)[
        'evidenceid' => $evidence->id,
        'actorid' => $admin->id,
        'action' => 'retention_delete',
        'timecreated' => $now,
      ];
      $DB->insert_record('local_proctoring_evaudit', $audit);
      $DB->set_field('local_proctoring_evidence', 'deletedat', $now, ['id' => $evidence->id]);
    }
  }
}
