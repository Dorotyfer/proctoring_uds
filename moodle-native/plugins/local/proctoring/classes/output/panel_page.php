<?php

namespace local_proctoring\output;

defined('MOODLE_INTERNAL') || die();

final class panel_page implements \renderable, \templatable {
  private $data;

  public function __construct(array $data = []) {
    $this->data = $data;
  }

  public function export_for_template(\renderer_base $output): array {
    return [
      'title' => $this->data['title'] ?? get_string('panel', 'local_proctoring'),
      'message' => $this->data['message'] ?? '',
      'sesskey' => sesskey(),
      'courseid' => (int)($this->data['courseid'] ?? 0),
    ];
  }
}
