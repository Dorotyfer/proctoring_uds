<?php

defined('MOODLE_INTERNAL') || die();

class quizaccess_proctoring extends quiz_access_rule_base {
    public static function make($quizobj, $timenow, $canignoretimelimits) {
        $settings = (new \local_proctoring\service\quiz_policy_service())->for_quiz($quizobj->get_quizid());
        if (empty($settings['enabled'])) {
            return null;
        }

        return new self($quizobj, $timenow);
    }

    public function prevent_access() {
        global $DB, $USER;

        $attempt = $DB->get_record_sql(
            'SELECT * FROM {quiz_attempts} WHERE quiz = ? AND userid = ? AND state = ? ORDER BY id DESC',
            [$this->quizobj->get_quizid(), $USER->id, 'inprogress']
        );
        if (!$attempt) {
            return false;
        }

        $session = $DB->get_record('local_proctoring_session', ['attemptid' => $attempt->id]);
        if (!$session) {
            return get_string('preparationrequired', 'quizaccess_proctoring');
        }
        if ($session->status === 'active') {
            return false;
        }
        if ($session->status === 'expired' || (int)$session->expiresat < time()) {
            return get_string('sessionexpired', 'quizaccess_proctoring');
        }
        if ($session->status === 'completed') {
            return get_string('sessioncompleted', 'quizaccess_proctoring');
        }
        return get_string('preparationrequired', 'quizaccess_proctoring');
    }

    public function description() {
        return get_string('proctoringrequired', 'quizaccess_proctoring');
    }

    public function setup_attempt_page($page) {
        $attemptid = optional_param('attemptid', 0, PARAM_INT);
        $page->requires->js_call_amd('quizaccess_proctoring/launch', 'start', [[
            'attemptid' => $attemptid,
        ]]);
    }

    public static function add_settings_form_fields($quizform, $mform) {
        $mform->addElement('header', 'proctoringheader', get_string('pluginname', 'quizaccess_proctoring'));
        $mform->addElement(
            'selectyesno',
            'proctoringenabled',
            get_string('enabled', 'quizaccess_proctoring')
        );
        $mform->setDefault('proctoringenabled', 0);
        $mform->addElement('select', 'proctoringallowedmode', get_string('allowedmode', 'quizaccess_proctoring'), [
            'either' => get_string('modeeither', 'quizaccess_proctoring'),
            'browser' => get_string('modebrowser', 'quizaccess_proctoring'),
            'seb' => get_string('modeseb', 'quizaccess_proctoring'),
        ]);
        $mform->setDefault('proctoringallowedmode', 'either');
        $mform->addElement('select', 'proctoringfailurepolicy', get_string('failurepolicy', 'quizaccess_proctoring'), [
            'block' => get_string('failureblock', 'quizaccess_proctoring'),
            'allow_with_alert' => get_string('failureallowalert', 'quizaccess_proctoring'),
        ]);
        $mform->setDefault('proctoringfailurepolicy', 'block');
        $mform->addElement('select', 'proctoringcontrollevel', get_string('controllevel', 'quizaccess_proctoring'), [
            'low' => get_string('levellow', 'quizaccess_proctoring'),
            'medium' => get_string('levelmedium', 'quizaccess_proctoring'),
            'high' => get_string('levelhigh', 'quizaccess_proctoring'),
        ]);
        $mform->setDefault('proctoringcontrollevel', 'medium');
        $mform->addElement('header', 'proctoringcapture', get_string('captureheading', 'quizaccess_proctoring'));
        foreach ([
            'captureinterval' => [get_string('captureinterval', 'quizaccess_proctoring'), 60],
            'capturewidth' => [get_string('capturewidth', 'quizaccess_proctoring'), 1280],
            'maximagekb' => [get_string('maximagekb', 'quizaccess_proctoring'), 200],
        ] as $field => [$label, $default]) {
            $mform->addElement('text', 'proctoring_' . $field, $label);
            $mform->setType('proctoring_' . $field, PARAM_INT);
            $mform->setDefault('proctoring_' . $field, $default);
        }
        $mform->addElement('header', 'proctoringsignals', get_string('signalsheading', 'quizaccess_proctoring'));
        foreach ([
            'tabswitch', 'fullscreen', 'clipboard', 'f12', 'resize', 'phone', 'voice', 'gaze',
            'environmentanalysis', 'emotionanalysis', 'predictiveanalysis',
        ] as $field) {
            $mform->addElement('advcheckbox', 'proctoring_' . $field, get_string('detect_' . $field, 'quizaccess_proctoring'));
            $mform->setType('proctoring_' . $field, PARAM_BOOL);
        }
        $mform->addElement('header', 'proctoringalerts', get_string('alertsheading', 'quizaccess_proctoring'));
        $mform->addElement('text', 'proctoring_maxwarnings', get_string('maxwarnings', 'quizaccess_proctoring'));
        $mform->setType('proctoring_maxwarnings', PARAM_INT);
        $mform->setDefault('proctoring_maxwarnings', 3);
        $mform->addElement('select', 'proctoring_warningaction', get_string('warningaction', 'quizaccess_proctoring'), [
            'block' => get_string('failureblock', 'quizaccess_proctoring'),
            'allow_with_alert' => get_string('failureallowalert', 'quizaccess_proctoring'),
        ]);
        $mform->setDefault('proctoring_warningaction', 'allow_with_alert');
        $mform->addElement('advcheckbox', 'proctoring_notifyreviewers', get_string('notifyreviewers', 'quizaccess_proctoring'));
        $mform->setType('proctoring_notifyreviewers', PARAM_BOOL);
        $mform->addElement('header', 'proctoringidentity', get_string('identityheading', 'quizaccess_proctoring'));
        $mform->addElement('advcheckbox', 'proctoring_biometricenabled', get_string('biometricenabled', 'quizaccess_proctoring'));
        $mform->setType('proctoring_biometricenabled', PARAM_BOOL);
        $mform->addElement('text', 'proctoring_biometricthreshold', get_string('biometricthreshold', 'quizaccess_proctoring'));
        $mform->setType('proctoring_biometricthreshold', PARAM_FLOAT);
        $mform->setDefault('proctoring_biometricthreshold', 0.5);
        $mform->addElement('advcheckbox', 'proctoring_identityautoclose', get_string('identityautoclose', 'quizaccess_proctoring'));
        $mform->setType('proctoring_identityautoclose', PARAM_BOOL);
        $mform->addElement('text', 'proctoring_identityautoclosestreak', get_string('identityautoclosestreak', 'quizaccess_proctoring'));
        $mform->setType('proctoring_identityautoclosestreak', PARAM_INT);
        $mform->setDefault('proctoring_identityautoclosestreak', 3);
        $mform->addElement('text', 'proctoring_identityautocloseseconds', get_string('identityautocloseseconds', 'quizaccess_proctoring'));
        $mform->setType('proctoring_identityautocloseseconds', PARAM_INT);
        $mform->setDefault('proctoring_identityautocloseseconds', 0);
        $mform->addElement('text', 'proctoring_consentversion', get_string('consentversion', 'quizaccess_proctoring'));
        $mform->setType('proctoring_consentversion', PARAM_ALPHANUMEXT);
        $mform->setDefault('proctoring_consentversion', 'proctoring-v1');
        $mform->addElement('header', 'proctoringprivacy', get_string('privacyheading', 'quizaccess_proctoring'));
        $mform->addElement('advcheckbox', 'proctoring_legalevidence', get_string('legalevidence', 'quizaccess_proctoring'));
        $mform->setType('proctoring_legalevidence', PARAM_BOOL);
        $mform->addElement('hidden', 'proctoringpolicyjson', '');
        $mform->setType('proctoringpolicyjson', PARAM_RAW);
    }

    public static function save_settings($quiz) {
        global $USER;
        (new \local_proctoring\service\quiz_policy_service())->save($quiz, (int)$USER->id);
    }

    public static function delete_settings($quiz) {
        global $DB;
        $DB->delete_records('quizaccess_proctoring', ['quizid' => $quiz->id]);
    }
}
