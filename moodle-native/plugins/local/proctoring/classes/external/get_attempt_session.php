<?php

namespace local_proctoring\external;

use local_proctoring\service\session_service;

defined('MOODLE_INTERNAL') || die();

final class get_attempt_session extends \external_api {
  public static function execute(int $attemptid): array {
    $params = self::validate_parameters(self::execute_parameters(), ['attemptid' => $attemptid]);
    \require_login();
    \require_sesskey();
    return (new session_service())->get_attempt((int)$params['attemptid']);
  }

  public static function execute_parameters(): \external_function_parameters {
    return new \external_function_parameters([
      'attemptid' => new \external_value(PARAM_INT, 'Moodle quiz attempt id'),
    ]);
  }

  public static function execute_returns(): \external_single_structure {
    return new \external_single_structure([
      'found' => new \external_value(PARAM_BOOL),
      'session' => response::session(VALUE_OPTIONAL),
    ]);
  }
}
