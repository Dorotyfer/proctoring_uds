<?php

namespace quizaccess_proctoring;

defined('MOODLE_INTERNAL') || die();

class rule_test extends \advanced_testcase {
    public function test_saves_and_deletes_quiz_policy(): void {
        global $CFG, $DB;

        require_once($CFG->dirroot . '/mod/quiz/accessrule/proctoring/rule.php');
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course();
        $quiz = $this->getDataGenerator()->get_plugin_generator('mod_quiz')->create_instance([
            'course' => $course->id
        ]);
        $quiz->proctoringenabled = 1;
        $quiz->proctoringallowedmode = 'either';
        $quiz->proctoringfailurepolicy = 'block';

        \quizaccess_proctoring::save_settings($quiz);
        $settings = $DB->get_record('quizaccess_proctoring', ['quizid' => $quiz->id], '*', MUST_EXIST);
        $this->assertEquals(1, $settings->enabled);
        $this->assertEquals('either', $settings->allowedmode);

        \quizaccess_proctoring::delete_settings($quiz);
        $this->assertFalse($DB->record_exists('quizaccess_proctoring', ['quizid' => $quiz->id]));
    }
}
