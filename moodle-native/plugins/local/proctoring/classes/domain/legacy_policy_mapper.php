<?php

namespace local_proctoring\domain;

defined('MOODLE_INTERNAL') || die();

final class legacy_policy_mapper {
    private const GLOBAL_KEYS = [
        'keepcapturedays',
        'maximagekb',
        'defaultidentitythresh',
    ];

    public static function map_global(array $source): array {
        $settings = [];
        $warnings = [];
        foreach ($source as $key => $value) {
            switch ($key) {
                case 'keepcapturedays':
                    $settings['retentiondays'] = max(1, (int)$value);
                    break;
                case 'maximagekb':
                    $settings['maximagekb'] = max(1, (int)$value);
                    break;
                case 'defaultidentitythresh':
                    $settings['biometricthreshold'] = min(1, max(0, (float)$value));
                    break;
                default:
                    if (!in_array($key, ['encryptionkey'], true)) {
                        $warnings[] = 'global:' . $key;
                    }
            }
        }

        return [
            'settings' => $settings,
            'warnings' => array_values(array_unique($warnings)),
            'redacted_sources' => array_values(array_intersect(array_keys($source), ['encryptionkey'])),
        ];
    }

    public static function map_quiz(array $source): array {
        $policy = policy_schema::defaults();
        $policy['signals'] = [];
        $warnings = [];
        $sourcekeys = array_keys($source);
        $signalmap = policy_schema::legacy_signal_keys();

        foreach ($source as $key => $value) {
            if ($key === 'udsm_enabled') {
                $policy['enabled'] = !empty($value);
            } elseif ($key === 'udsm_interval') {
                $policy['capture']['interval'] = max(1, (int)$value);
            } elseif ($key === 'udsm_imagewidth') {
                $policy['capture']['width'] = max(1, (int)$value);
            } elseif ($key === 'udsm_maxwarnings') {
                $policy['alerts']['maxwarnings'] = max(1, (int)$value);
            } elseif ($key === 'udsm_action') {
                $policy['failurepolicy'] = in_array((string)$value, ['close', 'block', 'terminate'], true)
                    ? 'block'
                    : 'allow_with_alert';
                $policy['alerts']['action'] = $policy['failurepolicy'];
            } elseif ($key === 'udsm_notify') {
                $policy['alerts']['notifyreviewers'] = !empty($value);
            } elseif ($key === 'udsm_identitycheck' || $key === 'udsm_biometricid') {
                $policy['identity']['enabled'] = !empty($value);
            } elseif ($key === 'udsm_identitythresh') {
                $policy['identity']['threshold'] = min(1, max(0, (float)$value));
            } elseif ($key === 'udsm_identityautoclose') {
                $policy['identity']['autoclose'] = !empty($value);
            } elseif ($key === 'udsm_identityautoclosestreak') {
                $policy['identity']['autoclosestreak'] = max(1, (int)$value);
            } elseif ($key === 'udsm_identityautoclosesecs') {
                $policy['identity']['autocloseseconds'] = max(0, (int)$value);
            } elseif ($key === 'udsm_legalevidence') {
                $policy['privacy']['legalevidence'] = !empty($value);
            } elseif ($key === 'udsm_emotionanalysis') {
                $policy['signals']['emotion_analysis'] = ['enabled' => !empty($value)];
            } elseif ($key === 'udsm_envscanning') {
                $policy['signals']['environment_intrusion'] = ['enabled' => !empty($value)];
            } elseif ($key === 'udsm_predictive') {
                $policy['signals']['predictive_analysis'] = ['enabled' => !empty($value)];
            } elseif (array_key_exists($key, $signalmap)) {
                $policy['signals'][$signalmap[$key]] = ['enabled' => !empty($value)];
            } elseif (!in_array($key, ['udsm_header', 'udsm_behavior_header', 'udsm_warnings_header', 'udsm_cones_header', 'udsm_v4_header', 'udsm_identity_header'], true)) {
                $warnings[] = 'quiz:' . $key;
            }
        }

        $policy['version'] = 'legacy-udsmonitor-v1';
        return [
            'policy' => $policy,
            'warnings' => array_values(array_unique($warnings)),
            'sourcekeys' => $sourcekeys,
        ];
    }

    public static function known_quiz_keys(): array {
        return [
            'udsm_enabled', 'udsm_interval', 'udsm_imagewidth', 'udsm_tabswitch',
            'udsm_fullscreen', 'udsm_detectclipboard', 'udsm_detectf12',
            'udsm_detectresize', 'udsm_maxwarnings', 'udsm_action', 'udsm_notify',
            'udsm_emotionanalysis', 'udsm_envscanning', 'udsm_predictive',
            'udsm_detectphone', 'udsm_detectvoice', 'udsm_detectgaze',
            'udsm_legalevidence', 'udsm_biometricid', 'udsm_identitycheck',
            'udsm_identitythresh', 'udsm_identityautoclose',
            'udsm_identityautoclosestreak', 'udsm_identityautoclosesecs',
        ];
    }
}
