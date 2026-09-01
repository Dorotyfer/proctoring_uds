<?php

namespace local_proctoring\domain;

defined('MOODLE_INTERNAL') || die();

final class alert_policy {
    private const SEVERITIES = [
        'camera_interrupted' => 'high', 'face_absent' => 'medium', 'face_out_of_frame' => 'low',
        'identity_check_failed' => 'high', 'biometric_mismatch' => 'high',
        'liveness_check_failed' => 'high', 'multiple_faces' => 'high',
        'network_disconnected' => 'low', 'page_visibility_changed' => 'low',
        'seb_event' => 'medium', 'biometric_monitor_mismatch' => 'high',
        'environment_intrusion' => 'high', 'facial_pattern_detected' => 'low',
        'window_blur' => 'low', 'fullscreen_exit' => 'medium', 'page_unload' => 'medium',
        'device_mode_mismatch' => 'high',
    ];

    public static function should_alert(array $policy, string $type, int $count, int $windowseconds): bool {
        foreach (($policy['signals'] ?? []) as $signal) {
            if (($signal['type'] ?? '') !== $type || ($signal['enabled'] ?? true) === false) {
                continue;
            }
            $threshold = max(1, (int)($signal['threshold'] ?? 1));
            $window = max(1, (int)($signal['windowseconds'] ?? 300));
            return $count >= $threshold && $windowseconds <= $window;
        }
        return false;
    }

    public static function severity_for_type(string $type): ?string {
        return self::SEVERITIES[$type] ?? null;
    }
}
