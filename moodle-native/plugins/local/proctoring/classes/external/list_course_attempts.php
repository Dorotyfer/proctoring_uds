<?php

namespace local_proctoring\external;

use local_proctoring\service\panel_service;

defined('MOODLE_INTERNAL') || die();

final class list_course_attempts extends \external_api {
  public static function execute(int $courseid, int $page = 0, int $pagesize = 25, string $search = '', string $status = ''): string {
    $params = self::validate_parameters(self::execute_parameters(), compact('courseid', 'page', 'pagesize', 'search', 'status'));
    \require_login();
    \require_sesskey();
    return json_encode((new panel_service())->list_attempts((int)$params['courseid'], $params), JSON_UNESCAPED_UNICODE);
  }

  public static function execute_parameters(): \external_function_parameters {
    return new \external_function_parameters([
      'courseid' => new \external_value(PARAM_INT),
      'page' => new \external_value(PARAM_INT, '', VALUE_DEFAULT, 0),
      'pagesize' => new \external_value(PARAM_INT, '', VALUE_DEFAULT, 25),
      'search' => new \external_value(PARAM_TEXT, '', VALUE_DEFAULT, ''),
      'status' => new \external_value(PARAM_ALPHA, '', VALUE_DEFAULT, ''),
    ]);
  }

  public static function execute_returns(): \external_value {
    return new \external_value(PARAM_RAW);
  }
}
