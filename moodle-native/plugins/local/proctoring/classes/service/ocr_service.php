<?php

namespace local_proctoring\service;

defined('MOODLE_INTERNAL') || die();

final class ocr_service {
  private $engine;

  public function __construct(?callable $engine = null) {
    $this->engine = $engine;
  }

  public function read_document(string $jpeg): array {
    if (!$this->engine) {
      return ['status' => 'unavailable', 'reason' => 'no_local_ocr_engine'];
    }
    $result = ($this->engine)($jpeg);
    return is_array($result) ? $result : ['status' => 'unavailable', 'reason' => 'invalid_ocr_result'];
  }
}
