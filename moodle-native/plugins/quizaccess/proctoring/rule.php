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

    public function setup_attempt_page(\moodle_page $page): void {
        $attemptid = optional_param('attemptid', 0, PARAM_INT);
        $page->requires->js_call_amd('quizaccess_proctoring/launch', 'start', [[
            'attemptid' => $attemptid,
        ]]);
    }

    public static function add_settings_form_fields($quizform, $mform) {
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
        $mform->addElement('hidden', 'proctoringpolicyjson', '');
        $mform->setType('proctoringpolicyjson', PARAM_RAW);
    }

    public static function save_settings($quiz) {
        global $DB;

        global $USER;
        $policy = json_decode((string)($quiz->proctoringpolicyjson ?? ''), true) ?: [];
        $policy['version'] = (string)($quiz->proctoringpolicyversion ?? 'quiz-policy-1');
        $policy['signals'] = is_array($policy['signals'] ?? null) ? $policy['signals'] : [];
        $policy['devicepolicy'] = (string)($quiz->proctoringallowedmode ?? 'either');
        $policy['controllevel'] = (string)($quiz->proctoringcontrollevel ?? 'medium');
        $validation = \local_proctoring\domain\policy_validator::validate($policy);
        if (!$validation['valid']) {
            throw new moodle_exception('invalidpolicy', 'quizaccess_proctoring', '', implode(', ', $validation['errors']));
        }
        $policy = $validation['policy'];

        $record = (object)[
            'quizid' => $quiz->id,
            'enabled' => empty($quiz->proctoringenabled) ? 0 : 1,
            'allowedmode' => $policy['devicepolicy'],
            'failurepolicy' => (string)($quiz->proctoringfailurepolicy ?? 'block'),
            'controllevel' => $policy['controllevel'],
            'policyversion' => $policy['version'],
            'policyjson' => json_encode($policy, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ];
        $existing = $DB->get_record('quizaccess_proctoring', ['quizid' => $quiz->id]);

        if ($existing) {
            $record->id = $existing->id;
            $DB->update_record('quizaccess_proctoring', $record);
        } else {
            $DB->insert_record('quizaccess_proctoring', $record);
        }

        $policyrecord = (object)[
            'courseid' => (int)$quiz->course,
            'quizid' => (int)$quiz->id,
            'version' => $policy['version'],
            'policyjson' => $record->policyjson,
            'actorid' => (int)$USER->id,
            'timecreated' => time(),
        ];
        $existingpolicy = $DB->get_record('local_proctoring_policy', [
            'quizid' => $policyrecord->quizid,
            'version' => $policyrecord->version,
        ]);
        if ($existingpolicy) {
            $policyrecord->id = $existingpolicy->id;
            $DB->update_record('local_proctoring_policy', $policyrecord);
        } else {
            $DB->insert_record('local_proctoring_policy', $policyrecord);
        }
    }

    public static function delete_settings($quiz) {
        global $DB;
        $DB->delete_records('quizaccess_proctoring', ['quizid' => $quiz->id]);
    }
}
