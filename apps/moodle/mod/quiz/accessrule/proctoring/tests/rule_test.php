<?php
// This file is part of Moodle - http://moodle.org/.

namespace quizaccess_proctoring;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/mod/quiz/accessrule/proctoring/rule.php');

final class rule_test extends \basic_testcase {
    public function test_rule_only_applies_when_enabled(): void {
        $quiz = (object)['proctoring_enabled' => 1];
        $cm = (object)['id' => 1];
        $quizobj = new \mod_quiz\quiz_settings($quiz, $cm, null);
        $this->assertInstanceOf(\quizaccess_proctoring::class, \quizaccess_proctoring::make($quizobj, time(), false));

        $quiz->proctoring_enabled = 0;
        $quizobj = new \mod_quiz\quiz_settings($quiz, $cm, null);
        $this->assertNull(\quizaccess_proctoring::make($quizobj, time(), false));
    }
}
