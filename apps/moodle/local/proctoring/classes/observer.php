<?php
// This file is part of Moodle - http://moodle.org/.

namespace local_proctoring;

defined('MOODLE_INTERNAL') || die();

/** Creates a session synchronously after Moodle assigns an attempt id. */
final class observer {
    public static function attempt_started(\mod_quiz\event\attempt_started $event): void {
        global $CFG, $DB, $SESSION;

        $attempt = $event->get_record_snapshot('quiz_attempts', $event->objectid);
        $quiz = $event->get_record_snapshot('quiz', $attempt->quiz);
        if (!$DB->record_exists('quizaccess_proctoring', ['quizid' => $quiz->id, 'enabled' => 1])) {
            return;
        }
        if ($DB->record_exists('local_proctoring_attempt', ['quizattemptid' => $attempt->id])) {
            return;
        }

        try {
            $adapter = new quiz_access_rule_adapter();
            $session = $adapter->create_session_for_attempt($attempt, $quiz, self::native_seb_enabled((int)$quiz->id));
            $SESSION->local_proctoring_launch_tokens[$attempt->id] = $session['browsertoken'];
        } catch (\Throwable $exception) {
            require_once($CFG->dirroot . '/mod/quiz/locallib.php');
            quiz_delete_attempt($attempt, $quiz);
            if ($exception instanceof \moodle_exception) {
                throw $exception;
            }
            throw new \moodle_exception('sessioncreationfailed', 'local_proctoring', '', null, $exception->getMessage());
        }
    }

    private static function native_seb_enabled(int $quizid): bool {
        global $DB;
        return $DB->record_exists_select(
            'quizaccess_seb_quizsettings',
            'quizid = :quizid AND requiresafeexambrowser <> :disabled',
            ['quizid' => $quizid, 'disabled' => 0]
        );
    }
}
