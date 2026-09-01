<?php

namespace local_proctoring\domain;

defined('MOODLE_INTERNAL') || die();

final class session_state {
    private const TRANSITIONS = [
        'pending' => ['active', 'expired'],
        'active' => ['completed', 'expired'],
        'completed' => [],
        'expired' => [],
    ];

    public static function can_transition(string $from, string $to): bool {
        return in_array($to, self::TRANSITIONS[$from] ?? [], true);
    }
}
