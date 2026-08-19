<?php

defined('MOODLE_INTERNAL') || die();

class quizaccess_proctoring extends quiz_access_rule_base {
    public static function make(quiz $quizobj, $timenow, $canignoretimelimits) {
        global $DB;

        $settings = $DB->get_record('quizaccess_proctoring', ['quizid' => $quizobj->get_quizid()]);
        if (!$settings || empty($settings->enabled)) {
            return null;
        }

        return new self($quizobj, $timenow);
    }

    public function prevent_access() {
        if (empty(get_config('local_proctoring', 'apiurl')) || empty(get_config('local_proctoring', 'integrationkey'))) {
            return get_string('servicenotconfigured', 'quizaccess_proctoring');
        }

        return false;
    }

    public function description() {
        return get_string('proctoringrequired', 'quizaccess_proctoring');
    }

    public function setup_attempt_page($page) {
        $attemptid = optional_param('attempt', 0, PARAM_INT);
        if ($attemptid > 0 && optional_param('proctoringready', 0, PARAM_BOOL) === 0) {
            $page->requires->js_call_amd('quizaccess_proctoring/launch', 'redirect', [$attemptid]);
        }
    }

    public static function add_settings_form_fields($quizform, $mform) {
        $mform->addElement('selectyesno', 'proctoringenabled', get_string('enabled', 'quizaccess_proctoring'));
        $mform->addHelpButton('proctoringenabled', 'enabled', 'quizaccess_proctoring');
        $mform->setDefault('proctoringenabled', 0);

        $mform->addElement('select', 'proctoringallowedmode', get_string('allowedmode', 'quizaccess_proctoring'), [
            'either' => get_string('modeeither', 'quizaccess_proctoring'),
            'browser' => get_string('modebrowser', 'quizaccess_proctoring'),
            'seb' => get_string('modeseb', 'quizaccess_proctoring')
        ]);
        $mform->setDefault('proctoringallowedmode', 'either');
        $mform->hideIf('proctoringallowedmode', 'proctoringenabled', 'eq', 0);

        $mform->addElement('select', 'proctoringfailurepolicy', get_string('failurepolicy', 'quizaccess_proctoring'), [
            'block' => get_string('policyblock', 'quizaccess_proctoring'),
            'allow_with_alert' => get_string('policyallow', 'quizaccess_proctoring')
        ]);
        $mform->setDefault('proctoringfailurepolicy', 'block');
        $mform->hideIf('proctoringfailurepolicy', 'proctoringenabled', 'eq', 0);
    }

    public static function save_settings($quiz) {
        global $DB;

        $record = (object)[
            'quizid' => $quiz->id,
            'enabled' => empty($quiz->proctoringenabled) ? 0 : 1,
            'allowedmode' => $quiz->proctoringallowedmode ?? 'either',
            'failurepolicy' => $quiz->proctoringfailurepolicy ?? 'block'
        ];
        $existing = $DB->get_record('quizaccess_proctoring', ['quizid' => $quiz->id]);

        if ($existing) {
            $record->id = $existing->id;
            $DB->update_record('quizaccess_proctoring', $record);
        } else {
            $DB->insert_record('quizaccess_proctoring', $record);
        }
    }

    public static function delete_settings($quiz) {
        global $DB;
        $DB->delete_records('quizaccess_proctoring', ['quizid' => $quiz->id]);
    }
}
