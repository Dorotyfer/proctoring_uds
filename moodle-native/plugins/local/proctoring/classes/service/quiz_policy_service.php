<?php

namespace local_proctoring\service;

use local_proctoring\domain\policy_schema;

defined('MOODLE_INTERNAL') || die();

final class quiz_policy_service {
    private $db;

    public function __construct($db = null) {
        global $DB;
        $this->db = $db ?? $DB;
    }

    public function defaults(): array {
        $policy = policy_schema::defaults();
        $policy['enabled'] = (bool)get_config('local_proctoring', 'enabled');
        $policy['capture']['interval'] = max(1, (int)get_config('local_proctoring', 'captureinterval') ?: 60);
        $policy['capture']['width'] = max(1, (int)get_config('local_proctoring', 'capturewidth') ?: 1280);
        $policy['capture']['maximagekb'] = max(1, (int)get_config('local_proctoring', 'maximagekb') ?: 200);
        $policy['alerts']['maxwarnings'] = max(1, (int)get_config('local_proctoring', 'maxwarnings') ?: 3);
        $policy['alerts']['action'] = (string)get_config('local_proctoring', 'warningaction') ?: 'allow_with_alert';
        $policy['alerts']['notifyreviewers'] = (bool)get_config('local_proctoring', 'notifyreviewers');
        $policy['identity']['enabled'] = (bool)get_config('local_proctoring', 'biometricenabled');
        $policy['identity']['threshold'] = (float)get_config('local_proctoring', 'biometricthreshold') ?: 0.5;
        $policy['identity']['autoclose'] = (bool)get_config('local_proctoring', 'identityautoclose');
        $policy['identity']['autoclosestreak'] = max(1, (int)get_config('local_proctoring', 'identityautoclosestreak') ?: 3);
        $policy['identity']['autocloseseconds'] = max(0, (int)get_config('local_proctoring', 'identityautocloseseconds'));
        $policy['privacy']['consentversion'] = (string)get_config('local_proctoring', 'consentversion') ?: 'proctoring-v1';
        $policy['privacy']['legalevidence'] = (bool)get_config('local_proctoring', 'legalevidence');
        $policy['risk']['weights'] = self::decode_config_json('riskweights');
        $policy['risk']['institutionrules'] = (string)get_config('local_proctoring', 'institutionrules') ?: '{}';
        $policy['signals'] = $this->configured_signals();
        return policy_schema::normalize($policy)['policy'];
    }

    public function from_quiz_form(\stdClass $quiz): array {
        $policy = $this->defaults();
        $policy['enabled'] = !empty($quiz->proctoringenabled);
        $policy['devicepolicy'] = (string)($quiz->proctoringallowedmode ?? 'either');
        $policy['failurepolicy'] = (string)($quiz->proctoringfailurepolicy ?? $policy['alerts']['action']);
        $policy['controllevel'] = (string)($quiz->proctoringcontrollevel ?? 'medium');
        $policy['version'] = (string)($quiz->proctoringpolicyversion ?? 'quiz-policy-1');

        foreach ([
            'captureinterval' => ['capture', 'interval', 'int'],
            'capturewidth' => ['capture', 'width', 'int'],
            'maximagekb' => ['capture', 'maximagekb', 'int'],
            'maxwarnings' => ['alerts', 'maxwarnings', 'int'],
            'identityautoclosestreak' => ['identity', 'autoclosestreak', 'int'],
            'identityautocloseseconds' => ['identity', 'autocloseseconds', 'int'],
        ] as $field => [$section, $name, $type]) {
            if (property_exists($quiz, 'proctoring_' . $field)) {
                $policy[$section][$name] = $type === 'int'
                    ? max(0, (int)$quiz->{'proctoring_' . $field})
                    : $quiz->{'proctoring_' . $field};
            }
        }
        foreach ([
            'notifyreviewers' => ['alerts', 'notifyreviewers'],
            'biometricenabled' => ['identity', 'enabled'],
            'identityautoclose' => ['identity', 'autoclose'],
            'legalevidence' => ['privacy', 'legalevidence'],
        ] as $field => [$section, $name]) {
            if (property_exists($quiz, 'proctoring_' . $field)) {
                $policy[$section][$name] = !empty($quiz->{'proctoring_' . $field});
            }
        }
        if (property_exists($quiz, 'proctoring_biometricthreshold')) {
            $policy['identity']['threshold'] = (float)$quiz->proctoring_biometricthreshold;
        }
        if (property_exists($quiz, 'proctoring_consentversion')) {
            $policy['privacy']['consentversion'] = (string)$quiz->proctoring_consentversion;
        }
        if (property_exists($quiz, 'proctoring_warningaction')) {
            $policy['alerts']['action'] = (string)$quiz->proctoring_warningaction;
        }

        $encodedsignals = (string)($quiz->proctoringsignals ?? '');
        if ($encodedsignals !== '') {
            $signals = json_decode($encodedsignals, true);
            if (is_array($signals)) {
                $policy['signals'] = $signals;
            }
        }

        foreach (policy_schema::legacy_signal_keys() as $field => $signaltype) {
            $formfield = 'proctoring_' . substr($field, 5);
            if (property_exists($quiz, $formfield)) {
                $policy['signals'][$signaltype] = !empty($quiz->{$formfield});
            }
        }

        return policy_schema::normalize($policy)['policy'];
    }

    public function save(\stdClass $quiz, int $actorid): array {
        $policy = $this->from_quiz_form($quiz);
        return $this->save_policy($quiz, $policy, $actorid);
    }

    public function save_policy(\stdClass $quiz, array $policy, int $actorid): array {
        $validation = policy_schema::normalize($policy);
        if (!$validation['valid']) {
            throw new \moodle_exception('invalidpolicy', 'quizaccess_proctoring', '', implode(', ', $validation['errors']));
        }
        $policy = $validation['policy'];
        $json = json_encode($policy, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $record = (object)[
            'quizid' => (int)$quiz->id,
            'enabled' => !empty($policy['enabled']) ? 1 : 0,
            'allowedmode' => $policy['devicepolicy'],
            'failurepolicy' => $policy['failurepolicy'],
            'controllevel' => $policy['controllevel'],
            'policyversion' => $policy['version'],
            'policyjson' => $json,
        ];
        $existing = $this->db->get_record('quizaccess_proctoring', ['quizid' => $record->quizid]);
        if ($existing) {
            $record->id = $existing->id;
            $this->db->update_record('quizaccess_proctoring', $record);
        } else {
            $this->db->insert_record('quizaccess_proctoring', $record);
        }

        $policyrecord = (object)[
            'courseid' => (int)$quiz->course,
            'quizid' => (int)$quiz->id,
            'version' => $policy['version'],
            'policyjson' => $json,
            'actorid' => $actorid,
            'timecreated' => time(),
        ];
        $existingpolicy = $this->db->get_record('local_proctoring_policy', [
            'quizid' => $policyrecord->quizid,
            'version' => $policyrecord->version,
        ]);
        if ($existingpolicy) {
            $policyrecord->id = $existingpolicy->id;
            $this->db->update_record('local_proctoring_policy', $policyrecord);
        } else {
            $this->db->insert_record('local_proctoring_policy', $policyrecord);
        }
        return $policy;
    }

    public function for_quiz(int $quizid): array {
        $record = $this->db->get_record('quizaccess_proctoring', ['quizid' => $quizid]);
        if (!$record) {
            return $this->defaults();
        }
        $policy = json_decode((string)$record->policyjson, true) ?: [];
        $policy['enabled'] = !empty($record->enabled);
        $policy['devicepolicy'] = (string)$record->allowedmode;
        $policy['failurepolicy'] = (string)$record->failurepolicy;
        $policy['controllevel'] = (string)$record->controllevel;
        $policy['version'] = (string)$record->policyversion;
        return policy_schema::normalize($policy)['policy'];
    }

    private function configured_signals(): array {
        $signals = [];
        foreach (policy_schema::legacy_signal_keys() as $setting => $signaltype) {
            $configkey = substr($setting, 5);
            if ((bool)get_config('local_proctoring', $configkey)) {
                $signals[$signaltype] = true;
            }
        }
        return $signals;
    }

    private static function decode_config_json(string $name): array {
        $value = json_decode((string)get_config('local_proctoring', $name), true);
        return is_array($value) ? $value : [];
    }
}
