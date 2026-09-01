<?php

namespace local_proctoring\external;

use local_proctoring\service\panel_service;

defined('MOODLE_INTERNAL') || die();

final class review_alert extends \external_api {
  public static function execute(int $alertid, string $status, string $note = ''): string {
    $params = self::validate_parameters(self::execute_parameters(), compact('alertid', 'status', 'note'));
    \require_login();
    \require_sesskey();
    return json_encode((new panel_service())->review_alert((int)$params['alertid'], $params['status'], $params['note']), JSON_UNESCAPED_UNICODE);
  }

  public static function execute_parameters(): \external_function_parameters {
    return new \external_function_parameters([
      'alertid' => new \external_value(PARAM_INT),
      'status' => new \external_value(PARAM_ALPHA),
      'note' => new \external_value(PARAM_TEXT, '', VALUE_DEFAULT, ''),
    ]);
  }

  public static function execute_returns(): \external_value {
    return new \external_value(PARAM_RAW);
  }
}
