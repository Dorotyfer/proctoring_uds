<?php
// This file is part of Moodle - http://moodle.org/.

namespace local_proctoring;

defined('MOODLE_INTERNAL') || die();

/**
 * Integration boundary for a future supported quiz-access-rule adapter.
 *
 * A quizaccess rule and the synchronous mod_quiz attempt_started event call this
 * adapter after Moodle has assigned an attempt id and before startattempt.php redirects.
 */
final class quiz_access_rule_adapter {
    /** @var session_manager */
    private $sessionmanager;

    public function __construct(?session_manager $sessionmanager = null) {
        $this->sessionmanager = $sessionmanager ?? new session_manager();
    }

    public function create_session_for_attempt(\stdClass $attempt, \stdClass $quiz, bool $nativesebactive): array {
        return $this->sessionmanager->create_for_attempt($attempt, $quiz, $nativesebactive ? 'seb' : 'browser');
    }
}
