<?php

namespace local_proctoring\external;

use local_proctoring\service\incident_service;

defined('MOODLE_INTERNAL') || die();

final class record_incident extends \external_api {
  public static function execute(int $attemptid, array $incident): array {
    $params = self::validate_parameters(self::execute_parameters(), ['attemptid' => $attemptid, 'incident' => $incident]);
    \require_login();
    \require_sesskey();
    return (new incident_service())->record((int)$params['attemptid'], $params['incident']);
  }

  public static function execute_parameters(): \external_function_parameters {
    return new \external_function_parameters([
      'attemptid' => new \external_value(PARAM_INT),
      'incident' => new \external_single_structure([
        'type' => new \external_value(PARAM_TEXT),
        'occurredat' => new \external_value(PARAM_INT, '', VALUE_OPTIONAL, 0),
        'clienteventid' => new \external_value(PARAM_TEXT, '', VALUE_OPTIONAL),
        'metadata' => new \external_value(PARAM_RAW, '', VALUE_OPTIONAL),
      ]),
    ]);
  }

  public static function execute_returns(): \external_single_structure {
    return response::events_result();
  }
}
