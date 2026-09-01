<?php

namespace quizaccess_proctoring;

use local_proctoring\repository\session_repository;

defined('MOODLE_INTERNAL') || die();

class observer {
    public static function attempt_started(\mod_quiz\event\attempt_started $event): void {
        global $DB;

        $attempt = $event->get_record_snapshot('quiz_attempts', $event->objectid);
        $quiz = $DB->get_record('quiz', ['id' => $attempt->quiz], '*', MUST_EXIST);
        $settings = $DB->get_record('quizaccess_proctoring', ['quizid' => $quiz->id]);
        if (!$settings || empty($settings->enabled)) {
            return;
        }

        $attempt->courseid = $quiz->course;
        $policy = json_decode((string)$settings->policyjson, true) ?: [];
        $policy['version'] = $settings->policyversion;
        $policy['devicepolicy'] = $settings->allowedmode;
        $policy['controllevel'] = $settings->controllevel;
        (new session_repository($DB))->create_for_attempt($attempt, $policy);
    }

    public static function attempt_finished(\core\event\base $event): void {
        global $DB;

        $session = $DB->get_record('local_proctoring_session', ['attemptid' => $event->objectid]);
        if (!$session || $session->status !== 'active') {
            return;
        }
        (new session_repository($DB))->transition((int)$session->id, 'completed');
    }
}
