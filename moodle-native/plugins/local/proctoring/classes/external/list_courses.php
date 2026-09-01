<?php

namespace local_proctoring\external;

use local_proctoring\service\panel_service;

defined('MOODLE_INTERNAL') || die();

final class list_courses extends \external_api {
  public static function execute(string $search = ''): string {
    $params = self::validate_parameters(self::execute_parameters(), ['search' => $search]);
    \require_login();
    \require_sesskey();
    return json_encode((new panel_service())->list_courses(\context_system::instance(), $params), JSON_UNESCAPED_UNICODE);
  }

  public static function execute_parameters(): \external_function_parameters {
    return new \external_function_parameters([
      'search' => new \external_value(PARAM_TEXT, '', VALUE_DEFAULT, ''),
    ]);
  }

  public static function execute_returns(): \external_value {
    return new \external_value(PARAM_RAW);
  }
}
