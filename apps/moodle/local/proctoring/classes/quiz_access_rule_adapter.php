<?php
// This file is part of Moodle - http://moodle.org/.

namespace local_proctoring;

defined('MOODLE_INTERNAL') || die();

/**
 * Integration boundary for a future supported quiz-access-rule adapter.
 *
 * This class intentionally does not register a pre-attempt hook. A supported adapter
 * must call create_session_for_attempt() only after Moodle has created an attempt.
 */
final class quiz_access_rule_adapter {
    /** @var session_manager */
    private $sessionmanager;

    public function __construct(?session_manager $sessionmanager = null) {
        $this->sessionmanager = $sessionmanager ?? new session_manager();
    }

    public function create_session_for_attempt(\stdClass $attempt, bool $nativesebactive): array {
        return $this->sessionmanager->create_for_attempt($attempt, $nativesebactive ? 'seb' : 'browser');
    }
}
