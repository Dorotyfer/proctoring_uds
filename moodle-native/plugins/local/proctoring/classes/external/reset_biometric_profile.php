<?php

namespace local_proctoring\external;

use local_proctoring\service\panel_service;

defined('MOODLE_INTERNAL') || die();

final class reset_biometric_profile extends \external_api {
  public static function execute(int $userid): string {
    $params = self::validate_parameters(self::execute_parameters(), ['userid' => $userid]);
    \require_login();
    \require_sesskey();
    return json_encode((new panel_service())->reset_biometric_profile((int)$params['userid']), JSON_UNESCAPED_UNICODE);
  }

  public static function execute_parameters(): \external_function_parameters {
    return new \external_function_parameters([
      'userid' => new \external_value(PARAM_INT),
    ]);
  }

  public static function execute_returns(): \external_value {
    return new \external_value(PARAM_RAW);
  }
}
