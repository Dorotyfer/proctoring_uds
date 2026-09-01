<?php

namespace local_proctoring\domain;

defined('MOODLE_INTERNAL') || die();

final class policy_schema {
    public static function defaults(): array {
        return [
            'enabled' => false,
            'devicepolicy' => 'either',
            'controllevel' => 'medium',
            'failurepolicy' => 'block',
            'capture' => [
                'interval' => 60,
                'width' => 1280,
                'maximagekb' => 200,
            ],
            'signals' => [],
            'alerts' => [
                'maxwarnings' => 3,
                'action' => 'allow_with_alert',
                'notifyreviewers' => true,
            ],
            'identity' => [
                'enabled' => false,
                'threshold' => 0.5,
                'autoclose' => false,
                'autoclosestreak' => 3,
                'autocloseseconds' => 0,
            ],
            'risk' => [
                'weights' => [],
                'institutionrules' => '',
            ],
            'privacy' => [
                'legalevidence' => false,
                'consentversion' => 'proctoring-v1',
            ],
            'version' => 'native-policy-v1',
        ];
    }

    public static function normalize(array $policy): array {
        $candidate = array_replace_recursive(self::defaults(), $policy);
        $candidate['enabled'] = !empty($candidate['enabled']);
        $candidate['failurepolicy'] = (string)$candidate['failurepolicy'];

        if (!is_array($candidate['signals'])) {
            $candidate['signals'] = [];
        }

        $result = policy_validator::validate($candidate);
        $result['policy'] = array_replace_recursive($candidate, $result['policy']);
        return $result;
    }

    public static function legacy_signal_keys(): array {
        return [
            'udsm_tabswitch' => 'page_visibility_changed',
            'udsm_fullscreen' => 'fullscreen_exit',
            'udsm_detectclipboard' => 'clipboard_activity',
            'udsm_detectf12' => 'developer_tools',
            'udsm_detectresize' => 'window_resize',
            'udsm_detectphone' => 'phone_detected',
            'udsm_detectvoice' => 'voice_detected',
            'udsm_detectgaze' => 'gaze_deviation',
        ];
    }
}
