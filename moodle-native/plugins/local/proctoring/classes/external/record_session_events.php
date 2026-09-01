<?php

namespace local_proctoring\external;

use local_proctoring\service\event_service;

defined('MOODLE_INTERNAL') || die();

final class record_session_events extends \external_api {
  public static function execute(int $attemptid, array $events): array {
    $params = self::validate_parameters(self::execute_parameters(), ['attemptid' => $attemptid, 'events' => $events]);
    \require_login();
    \require_sesskey();
    return (new event_service())->record_batch((int)$params['attemptid'], $params['events']);
  }

  public static function execute_parameters(): \external_function_parameters {
    return new \external_function_parameters([
      'attemptid' => new \external_value(PARAM_INT),
      'events' => new \external_multiple_structure(new \external_single_structure([
        'clienteventid' => new \external_value(PARAM_TEXT),
        'type' => new \external_value(PARAM_TEXT),
        'occurredat' => new \external_value(PARAM_INT),
        'metadata' => new \external_value(PARAM_RAW, '', VALUE_OPTIONAL),
      ])),
    ]);
  }

  public static function execute_returns(): \external_single_structure {
    return response::events_result();
  }
}
