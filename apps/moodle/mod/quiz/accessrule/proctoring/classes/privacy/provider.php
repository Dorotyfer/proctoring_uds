<?php
// This file is part of Moodle - http://moodle.org/.

namespace quizaccess_proctoring\privacy;

defined('MOODLE_INTERNAL') || die();

/** The per-quiz enablement flag stores no personal user data. */
final class provider implements \core_privacy\local\metadata\null_provider {
    public static function get_reason(): string {
        return 'privacy:metadata';
    }
}
