<?php

namespace local_proctoring\external;

use local_proctoring\service\panel_service;

defined('MOODLE_INTERNAL') || die();

final class get_session_detail extends \external_api {
  public static function execute(int $sessionid): string {
    $params = self::validate_parameters(self::execute_parameters(), ['sessionid' => $sessionid]);
    \require_login();
    \require_sesskey();
    return json_encode((new panel_service())->get_session_detail((int)$params['sessionid']), JSON_UNESCAPED_UNICODE);
  }

  public static function execute_parameters(): \external_function_parameters {
    return new \external_function_parameters([
      'sessionid' => new \external_value(PARAM_INT),
    ]);
  }

  public static function execute_returns(): \external_value {
    return new \external_value(PARAM_RAW);
  }
}
