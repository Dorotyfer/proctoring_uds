<?php

namespace local_proctoring\output;

defined('MOODLE_INTERNAL') || die();

final class session_detail implements \renderable, \templatable {
  private $detail;

  public function __construct(array $detail) {
    $this->detail = $detail;
  }

  public function export_for_template(\renderer_base $output): array {
    return [
      'sessionid' => $this->detail['session']['id'] ?? 0,
      'attemptid' => $this->detail['session']['attemptid'] ?? 0,
      'status' => $this->detail['session']['status'] ?? '',
      'datajson' => json_encode($this->detail, JSON_UNESCAPED_UNICODE),
    ];
  }
}
