<?php
// This file is part of Moodle - http://moodle.org/.

use mod_quiz\local\access_rule_base;
use mod_quiz\quiz_settings;

defined('MOODLE_INTERNAL') || die();

/** Moodle 4.3 quiz access rule that enables proctoring for a quiz. */
class quizaccess_proctoring extends access_rule_base {
    public static function make(quiz_settings $quizobj, $timenow, $canignoretimelimits) {
        if (empty($quizobj->get_quiz()->proctoring_enabled)) {
            return null;
        }
        return new self($quizobj, $timenow);
    }

    public function prevent_new_attempt($numprevattempts, $lastattempt) {
        if (empty(get_config('local_proctoring', 'apiurl')) || empty(get_config('local_proctoring', 'integrationkey'))) {
            return get_string('configurationerror', 'quizaccess_proctoring');
        }
        return false;
    }

    public function description() {
        return get_string('proctoringrequired', 'quizaccess_proctoring');
    }

    public function setup_attempt_page($page) {
        global $SESSION;

        $attemptid = optional_param('attempt', 0, PARAM_INT);
        if (!empty($attemptid) && !empty($SESSION->local_proctoring_launch_tokens[$attemptid])) {
            $page->requires->js_call_amd('quizaccess_proctoring/launch', 'init', [
                (new \moodle_url('/local/proctoring/launch.php', ['attempt' => $attemptid]))->out(false),
            ]);
        }
    }

    public static function add_settings_form_fields(mod_quiz_mod_form $quizform, MoodleQuickForm $mform) {
        $mform->addElement('advcheckbox', 'proctoring_enabled', get_string('requireproctoring', 'quizaccess_proctoring'));
        $mform->addHelpButton('proctoring_enabled', 'requireproctoring', 'quizaccess_proctoring');
    }

    public static function save_settings($quiz) {
        global $DB;
        $enabled = empty($quiz->proctoring_enabled) ? 0 : 1;
        $record = $DB->get_record('quizaccess_proctoring', ['quizid' => $quiz->id]);
        if ($record) {
            $record->enabled = $enabled;
            $DB->update_record('quizaccess_proctoring', $record);
            return;
        }
        $DB->insert_record('quizaccess_proctoring', (object)['quizid' => $quiz->id, 'enabled' => $enabled]);
    }

    public static function delete_settings($quiz) {
        global $DB;
        $DB->delete_records('quizaccess_proctoring', ['quizid' => $quiz->id]);
    }

    public static function get_settings_sql($quizid) {
        return [
            'proctoring.enabled AS proctoring_enabled',
            'LEFT JOIN {quizaccess_proctoring} proctoring ON proctoring.quizid = quiz.id',
            [],
        ];
    }
}
