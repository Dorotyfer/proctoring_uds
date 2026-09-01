<?php

namespace local_proctoring\event;

defined('MOODLE_INTERNAL') || die();

final class alert_reviewed extends \core\event\base {
  protected function init(): void {
    $this->data['crud'] = 'u';
    $this->data['edulevel'] = self::LEVEL_OTHER;
    $this->data['objecttable'] = 'local_proctoring_alert';
  }

  public static function get_name(): string {
    return get_string('eventalertreviewed', 'local_proctoring');
  }

  public function get_description(): string {
    return "The user with id '{$this->userid}' reviewed alert with id '{$this->objectid}'.";
  }

  public function get_url(): \moodle_url {
    return new \moodle_url('/local/proctoring/index.php');
  }
}
