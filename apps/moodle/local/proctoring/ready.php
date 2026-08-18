<?php
// This file is part of Moodle - http://moodle.org/.

require_once(__DIR__ . '/../../../config.php');

$attemptid = required_param('attempt', PARAM_INT);
$attempt = $DB->get_record('quiz_attempts', ['id' => $attemptid], '*', MUST_EXIST);
$quiz = $DB->get_record('quiz', ['id' => $attempt->quiz], '*', MUST_EXIST);
$course = $DB->get_record('course', ['id' => $quiz->course], '*', MUST_EXIST);
$cm = get_coursemodule_from_instance('quiz', $quiz->id, $course->id, false, MUST_EXIST);
require_login($course, false, $cm);
if ((int)$attempt->userid !== (int)$USER->id) {
    throw new required_capability_exception(context_module::instance($cm->id), 'mod/quiz:attempt', 'nopermissions', '');
}
$session = $DB->get_record('local_proctoring_attempt', ['quizattemptid' => $attemptid], '*', MUST_EXIST);
if (!(new \local_proctoring\api_client())->is_session_ready($session->sessionid)) {
    throw new moodle_exception('preparationnotready', 'local_proctoring');
}
$SESSION->local_proctoring_ready_attempts[$attemptid] = true;
unset($SESSION->local_proctoring_launch_tokens[$attemptid]);
redirect(new moodle_url('/mod/quiz/attempt.php', ['attempt' => $attemptid]));
