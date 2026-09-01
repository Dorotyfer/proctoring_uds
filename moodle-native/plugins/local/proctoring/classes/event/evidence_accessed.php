<?php

namespace local_proctoring\event;

defined('MOODLE_INTERNAL') || die();

final class evidence_accessed extends \core\event\base {
  protected function init(): void {
    $this->data['crud'] = 'r';
    $this->data['edulevel'] = self::LEVEL_OTHER;
    $this->data['objecttable'] = 'local_proctoring_evidence';
  }

  public static function get_name(): string {
    return get_string('eventevidenceaccessed', 'local_proctoring');
  }

  public function get_description(): string {
    return "The user with id '{$this->userid}' accessed evidence with id '{$this->objectid}'.";
  }

  public function get_url(): \moodle_url {
    return new \moodle_url('/local/proctoring/evidence.php', ['evidenceid' => $this->objectid]);
  }
}
