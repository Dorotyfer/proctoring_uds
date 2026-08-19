<?php

namespace quizaccess_proctoring;

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
        $duration = empty($quiz->timelimit) ? 6 * HOURSECS : $quiz->timelimit + HOURSECS;
        $attempt->proctoringexpiresat = time() + $duration;
        if (!empty($quiz->timeclose)) {
            $attempt->proctoringexpiresat = min($attempt->proctoringexpiresat, $quiz->timeclose + HOURSECS);
        }
        $manager = new \local_proctoring\session_manager(new \local_proctoring\api_client());

        try {
            $manager->create_for_attempt($attempt, self::resolve_device_mode($settings));
        } catch (\Throwable $error) {
            if ($settings->failurepolicy === 'allow_with_alert') {
                self::record_failed_session($attempt->id);
                return;
            }
            throw new \moodle_exception('apiunavailable', 'local_proctoring', '', null, $error->getMessage());
        }
    }

    public static function attempt_finished(\core\event\base $event): void {
        global $DB;

        $local = $DB->get_record('local_proctoring_sessions', ['attemptid' => $event->objectid]);
        if (!$local || empty($local->remotesessionid) || $local->status === 'completed') {
            return;
        }

        try {
            $client = new \local_proctoring\api_client();
            $client->complete_session($local->remotesessionid);
            $local->status = 'completed';
        } catch (\Throwable $error) {
            $local->status = 'close_failed';
        }

        $local->timemodified = time();
        $DB->update_record('local_proctoring_sessions', $local);
    }

    private static function resolve_device_mode(\stdClass $settings): string {
        if ($settings->allowedmode === 'browser') {
            return 'browser';
        }

        $sebrequired = self::is_seb_required((int)$settings->quizid);
        if ($settings->allowedmode === 'seb' && !$sebrequired) {
            throw new \moodle_exception('sebrequired', 'quizaccess_proctoring');
        }

        return $sebrequired ? 'seb' : 'browser';
    }

    private static function is_seb_required(int $quizid): bool {
        global $DB;

        $dbmanager = $DB->get_manager();
        $sebtable = new \xmldb_table('quizaccess_seb_quizsettings');
        if (!$dbmanager->table_exists($sebtable)) {
            return false;
        }

        $sebsettings = $DB->get_record('quizaccess_seb_quizsettings', ['quizid' => $quizid]);
        return $sebsettings && !empty($sebsettings->requiresafeexambrowser);
    }

    private static function record_failed_session(int $attemptid): void {
        global $DB;

        if ($DB->record_exists('local_proctoring_sessions', ['attemptid' => $attemptid])) {
            return;
        }

        $now = time();
        $DB->insert_record('local_proctoring_sessions', (object)[
            'attemptid' => $attemptid,
            'remotesessionid' => null,
            'status' => 'api_failed',
            'expiresat' => 0,
            'timecreated' => $now,
            'timemodified' => $now
        ]);
    }
}
