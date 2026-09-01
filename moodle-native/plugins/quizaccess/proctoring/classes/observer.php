<?php

namespace quizaccess_proctoring;

defined('MOODLE_INTERNAL') || die();

class observer {
    public static function attempt_started(\mod_quiz\event\attempt_started $event): void {
    }

    public static function attempt_finished(\core\event\base $event): void {
    }
}
