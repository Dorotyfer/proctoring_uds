<?php

namespace local_proctoring\domain;

defined('MOODLE_INTERNAL') || die();

final class risk_score {
    private const WEIGHTS = [
        'biometric_mismatch' => 40, 'biometric_monitor_mismatch' => 40,
        'multiple_faces' => 30, 'camera_interrupted' => 25,
        'environment_intrusion' => 20, 'facial_pattern_detected' => 10,
        'page_visibility_changed' => 10, 'network_disconnected' => 5,
        'seb_event' => 15, 'liveness_check_failed' => 30,
        'identity_check_failed' => 30, 'face_absent' => 10,
    ];

    public static function calculate(array $signals): array {
        $seen = [];
        $factors = [];
        foreach ($signals as $signal) {
            $type = (string)($signal['type'] ?? '');
            $key = (string)($signal['id'] ?? $signal['clienteventid'] ?? '');
            if ($key !== '' && isset($seen[$key])) {
                continue;
            }
            if ($key !== '') {
                $seen[$key] = true;
            }
            if ($type === 'seb_event' && (($signal['metadata']['suspicious'] ?? false) !== true)) {
                continue;
            }
            $weight = (int)($signal['weight'] ?? self::WEIGHTS[$type] ?? 0);
            if ($weight < 1) {
                continue;
            }
            if (!isset($factors[$type])) {
                $factors[$type] = ['type' => $type, 'weight' => $weight, 'count' => 0, 'contribution' => 0];
            }
            $factors[$type]['count']++;
            $factors[$type]['contribution'] += $weight;
        }

        $factors = array_values($factors);
        usort($factors, static function(array $left, array $right): int {
            return $right['contribution'] <=> $left['contribution'] ?: strcmp($left['type'], $right['type']);
        });
        $score = min(100, array_sum(array_column($factors, 'contribution')));

        return [
            'score' => $score,
            'category' => $score >= 75 ? 'high_risk' : ($score >= 50 ? 'medium_risk' : ($score >= 20 ? 'observation' : 'normal')),
            'factors' => $factors,
            'calculatedat' => time(),
        ];
    }
}
