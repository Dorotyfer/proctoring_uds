<?php

defined('MOODLE_INTERNAL') || die();

class quizaccess_proctoring extends quiz_access_rule_base {
    public static function make($quizobj, $timenow, $canignoretimelimits) {
        global $DB;

        $settings = $DB->get_record(
            'quizaccess_proctoring',
            ['quizid' => $quizobj->get_quizid()]
        );

        if (!$settings || empty($settings->enabled)) {
            return null;
        }

        return new self($quizobj, $timenow);
    }

    public function prevent_access() {
        return false;
    }

    public function description() {
        return get_string('proctoringrequired', 'quizaccess_proctoring');
    }

    public static function add_settings_form_fields($quizform, $mform) {
        $mform->addElement(
            'selectyesno',
            'proctoringenabled',
            get_string('enabled', 'quizaccess_proctoring')
        );
        $mform->setDefault('proctoringenabled', 0);
    }

    public static function save_settings($quiz) {
        global $DB;

        $record = (object)[
            'quizid' => $quiz->id,
            'enabled' => empty($quiz->proctoringenabled) ? 0 : 1
        ];
        $existing = $DB->get_record('quizaccess_proctoring', ['quizid' => $quiz->id]);

        if ($existing) {
            $record->id = $existing->id;
            $DB->update_record('quizaccess_proctoring', $record);
            return;
        }

        $DB->insert_record('quizaccess_proctoring', $record);
    }

    public static function delete_settings($quiz) {
        global $DB;
        $DB->delete_records('quizaccess_proctoring', ['quizid' => $quiz->id]);
    }
}
