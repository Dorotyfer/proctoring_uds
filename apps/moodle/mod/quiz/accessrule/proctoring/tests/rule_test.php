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

    public function test_uses_native_seb_mode_when_quiz_requires_safe_exam_browser(): void {
        global $DB, $USER;

        $this->resetAfterTest();
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $quiz = $this->getDataGenerator()->get_plugin_generator('mod_quiz')->create_instance([
            'course' => $course->id
        ]);
        $cm = get_coursemodule_from_instance('quiz', $quiz->id, $course->id, false, MUST_EXIST);
        $templateid = $DB->insert_record('quizaccess_seb_template', (object)[
            'name' => 'Pilot SEB template',
            'description' => 'Deterministic acceptance fixture',
            'content' => '',
            'enabled' => 1,
            'sortorder' => 1,
            'usermodified' => $USER->id
        ]);
        $DB->insert_record('quizaccess_seb_quizsettings', (object)[
            'quizid' => $quiz->id,
            'cmid' => $cm->id,
            'templateid' => $templateid,
            'requiresafeexambrowser' => 1,
            'usermodified' => $USER->id
        ]);
        $settings = (object)['allowedmode' => 'either', 'quizid' => $quiz->id];

        $this->assertSame('seb', $this->resolve_device_mode($settings));
    }

    public function test_mobile_browser_policy_remains_browser_without_seb_requirement(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $quiz = $this->getDataGenerator()->get_plugin_generator('mod_quiz')->create_instance([
            'course' => $course->id
        ]);
        $settings = (object)['allowedmode' => 'browser', 'quizid' => $quiz->id];

        $this->assertSame('browser', $this->resolve_device_mode($settings));
    }

    public function test_saves_the_control_level_for_a_quiz(): void {
        global $DB;

        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course();
        $quiz = $this->getDataGenerator()->get_plugin_generator('mod_quiz')->create_instance([
            'course' => $course->id
        ]);
        $quiz->proctoringenabled = 1;
        $quiz->proctoringallowedmode = 'either';
        $quiz->proctoringfailurepolicy = 'block';
        $quiz->proctoringcontrollevel = 'high';

        \quizaccess_proctoring::save_settings($quiz);

        $settings = $DB->get_record('quizaccess_proctoring', ['quizid' => $quiz->id], '*', MUST_EXIST);
        $this->assertSame('high', $settings->controllevel);
    }

    private function resolve_device_mode(\stdClass $settings): string {
        $method = new \ReflectionMethod(observer::class, 'resolve_device_mode');
        return $method->invoke(null, $settings);
    }
}
