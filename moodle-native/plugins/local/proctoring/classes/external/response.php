<?php

namespace local_proctoring\external;

defined('MOODLE_INTERNAL') || die();

final class response {
  public static function session(int $required = VALUE_REQUIRED): \external_single_structure {
    return new \external_single_structure([
      'id' => new \external_value(PARAM_INT),
      'attemptid' => new \external_value(PARAM_INT),
      'userid' => new \external_value(PARAM_INT),
      'courseid' => new \external_value(PARAM_INT),
      'quizid' => new \external_value(PARAM_INT),
      'status' => new \external_value(PARAM_ALPHA),
      'devicemode' => new \external_value(PARAM_ALPHA),
      'devicepolicy' => new \external_value(PARAM_ALPHA),
      'controllevel' => new \external_value(PARAM_ALPHA),
      'policyversion' => new \external_value(PARAM_TEXT),
      'policysnapshot' => new \external_value(PARAM_RAW),
      'expiresat' => new \external_value(PARAM_INT),
      'timeissued' => new \external_value(PARAM_INT),
      'timeprepared' => new \external_value(PARAM_INT),
      'timeactivated' => new \external_value(PARAM_INT),
      'timecompleted' => new \external_value(PARAM_INT),
    ], '', $required);
  }

  public static function event(): \external_single_structure {
    return new \external_single_structure([
      'id' => new \external_value(PARAM_INT),
      'sessionid' => new \external_value(PARAM_INT),
      'clienteventid' => new \external_value(PARAM_TEXT),
      'type' => new \external_value(PARAM_TEXT),
      'occurredat' => new \external_value(PARAM_INT),
      'metadata' => new \external_value(PARAM_RAW),
    ]);
  }

  public static function alert(): \external_single_structure {
    return new \external_single_structure([
      'id' => new \external_value(PARAM_INT),
      'sessionid' => new \external_value(PARAM_INT),
      'eventid' => new \external_value(PARAM_INT),
      'type' => new \external_value(PARAM_TEXT),
      'severity' => new \external_value(PARAM_ALPHA),
      'status' => new \external_value(PARAM_ALPHA),
      'capturestatus' => new \external_value(PARAM_ALPHA),
      'timecreated' => new \external_value(PARAM_INT),
    ]);
  }

  public static function events_result(): \external_single_structure {
    return new \external_single_structure([
      'sessionid' => new \external_value(PARAM_INT),
      'events' => new \external_multiple_structure(self::event()),
      'alerts' => new \external_multiple_structure(self::alert()),
    ]);
  }
}
