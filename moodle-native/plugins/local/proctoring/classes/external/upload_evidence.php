<?php

namespace local_proctoring\external;

use local_proctoring\service\evidence_service;
use local_proctoring\service\session_service;

defined('MOODLE_INTERNAL') || die();

final class upload_evidence extends \external_api {
  public static function execute(int $attemptid, string $kind, string $jpeg, int $eventid = 0): array {
    $params = self::validate_parameters(self::execute_parameters(), [
      'attemptid' => $attemptid,
      'kind' => $kind,
      'jpeg' => $jpeg,
      'eventid' => $eventid,
    ]);
    \require_login();
    \require_sesskey();
    $session = (new session_service())->owned_session((int)$params['attemptid']);
    $service = new evidence_service();
    $file = $service->store((int)$session->id, $params['kind'], $params['jpeg'], [
      'eventid' => $params['eventid'] ?: null,
    ]);
    $evidence = $service->metadata_for_file((int)$session->id, $file->get_filename());
    return [
      'id' => (int)$evidence->id,
      'filename' => $file->get_filename(),
      'filesize' => (int)$file->get_filesize(),
    ];
  }

  public static function execute_parameters(): \external_function_parameters {
    return new \external_function_parameters([
      'attemptid' => new \external_value(PARAM_INT),
      'kind' => new \external_value(PARAM_ALPHANUMEXT),
      'jpeg' => new \external_value(PARAM_RAW),
      'eventid' => new \external_value(PARAM_INT, '', VALUE_DEFAULT, 0),
    ]);
  }

  public static function execute_returns(): \external_single_structure {
    return new \external_single_structure([
      'id' => new \external_value(PARAM_INT),
      'filename' => new \external_value(PARAM_FILE),
      'filesize' => new \external_value(PARAM_INT),
    ]);
  }
}
