<?php

namespace local_proctoring\external;

use local_proctoring\service\biometric_service;
use local_proctoring\service\session_service;

defined('MOODLE_INTERNAL') || die();

final class record_biometric_check extends \external_api {
  public static function execute(int $attemptid, array $samples): array {
    $params = self::validate_parameters(self::execute_parameters(), ['attemptid' => $attemptid, 'samples' => $samples]);
    \require_login();
    \require_sesskey();
    $session = (new session_service())->owned_session((int)$params['attemptid']);
    return (new biometric_service())->check((int)$session->id, $params['samples']);
  }

  public static function execute_parameters(): \external_function_parameters {
    return new \external_function_parameters([
      'attemptid' => new \external_value(PARAM_INT),
      'samples' => new \external_multiple_structure(new \external_multiple_structure(new \external_value(PARAM_FLOAT))),
    ]);
  }

  public static function execute_returns(): \external_single_structure {
    return new \external_single_structure([
      'id' => new \external_value(PARAM_INT),
      'result' => new \external_value(PARAM_ALPHA),
      'similarity' => new \external_value(PARAM_FLOAT, '', VALUE_OPTIONAL),
      'threshold' => new \external_value(PARAM_FLOAT),
      'profileversionid' => new \external_value(PARAM_INT),
    ]);
  }
}
