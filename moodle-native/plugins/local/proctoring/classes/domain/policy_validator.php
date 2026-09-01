<?php

namespace local_proctoring\domain;

defined('MOODLE_INTERNAL') || die();

final class policy_validator {
    private const SIGNAL_TYPES = [
        'camera_interrupted', 'face_absent', 'face_out_of_frame', 'multiple_faces',
        'identity_check_failed', 'biometric_mismatch', 'liveness_check_failed',
        'page_visibility_changed', 'network_disconnected', 'seb_event',
        'attention_signal', 'biometric_monitor_mismatch', 'environment_intrusion',
        'facial_pattern_detected', 'window_blur', 'window_focus', 'fullscreen_exit',
        'page_unload', 'device_mode_mismatch', 'clipboard_activity', 'developer_tools',
        'window_resize', 'phone_detected', 'voice_detected', 'gaze_deviation',
        'emotion_analysis', 'predictive_analysis',
    ];

    public static function validate(array $policy): array {
        $errors = [];
        $signals = $policy['signals'] ?? [];
        $seen = [];

        if (!is_array($signals) || count($signals) > 20) {
            $errors[] = 'signals_limit';
            $signals = [];
        }

        foreach ($signals as $signaltype => $signalvalue) {
            if (is_bool($signalvalue) || is_numeric($signalvalue)) {
                $signal = [
                    'type' => (string)$signaltype,
                    'enabled' => (bool)$signalvalue,
                ];
            } else {
                $signal = $signalvalue;
            }
            if (!is_array($signal)) {
                $errors[] = 'signal_format';
                continue;
            }
            $type = (string)($signal['type'] ?? '');
            if (!in_array($type, self::SIGNAL_TYPES, true)) {
                $errors[] = 'signal_type:' . $type;
            }
            if (isset($seen[$type])) {
                $errors[] = 'duplicate_signal:' . $type;
            }
            $seen[$type] = true;
            if (isset($signal['threshold']) && (!is_numeric($signal['threshold']) || (int)$signal['threshold'] < 1)) {
                $errors[] = 'invalid_threshold:' . $type;
            }
            if (isset($signal['windowseconds']) && (!is_numeric($signal['windowseconds']) || (int)$signal['windowseconds'] < 1)) {
                $errors[] = 'invalid_window:' . $type;
            }
        }

        $devicepolicy = (string)($policy['devicepolicy'] ?? 'either');
        if (!in_array($devicepolicy, ['browser', 'seb', 'either'], true)) {
            $errors[] = 'devicepolicy';
        }
        $controllevel = (string)($policy['controllevel'] ?? 'medium');
        if (!in_array($controllevel, ['low', 'medium', 'high'], true)) {
            $errors[] = 'controllevel';
        }

        $normalized = $policy;
        $normalized['version'] = (string)($policy['version'] ?? 'native-policy-v1');
        $normalized['signals'] = array_values($signals);
        $normalized['devicepolicy'] = $devicepolicy;
        $normalized['controllevel'] = $controllevel;

        return [
            'valid' => $errors === [],
            'errors' => array_values(array_unique($errors)),
            'policy' => $normalized,
        ];
    }
}
