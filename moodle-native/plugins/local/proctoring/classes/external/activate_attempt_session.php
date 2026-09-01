<?php

namespace local_proctoring\external;

use local_proctoring\service\session_service;

defined('MOODLE_INTERNAL') || die();

final class activate_attempt_session extends \external_api {
  public static function execute(int $attemptid, bool $prepared, bool $consent, string $devicemode = 'browser'): array {
    $params = self::validate_parameters(self::execute_parameters(), [
      'attemptid' => $attemptid,
      'prepared' => $prepared,
      'consent' => $consent,
      'devicemode' => $devicemode,
    ]);
    \require_login();
    \require_sesskey();
    return (new session_service())->activate_attempt((int)$params['attemptid'], $params);
  }

  public static function execute_parameters(): \external_function_parameters {
    return new \external_function_parameters([
      'attemptid' => new \external_value(PARAM_INT),
      'prepared' => new \external_value(PARAM_BOOL),
      'consent' => new \external_value(PARAM_BOOL),
      'devicemode' => new \external_value(PARAM_ALPHA, '', VALUE_DEFAULT, 'browser'),
    ]);
  }

  public static function execute_returns(): \external_single_structure {
    return response::session();
  }
}
