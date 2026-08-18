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
if (empty($SESSION->local_proctoring_launch_tokens[$attemptid])) {
    throw new moodle_exception('sessioncreationfailed', 'local_proctoring');
}
$panelurl = rtrim((string)get_config('local_proctoring', 'panelurl'), '/');
if (parse_url($panelurl, PHP_URL_SCHEME) !== 'https') {
    throw new moodle_exception('configurationerror', 'local_proctoring');
}

header('Referrer-Policy: no-referrer');
$PAGE->set_url('/local/proctoring/prepare.php', ['attempt' => $attemptid]);
$PAGE->set_context(context_module::instance($cm->id));
$PAGE->set_title(get_string('pluginname', 'local_proctoring'));
echo $OUTPUT->header();
echo html_writer::tag('p', get_string('preparationmessage', 'local_proctoring'));
echo html_writer::start_tag('form', ['method' => 'post', 'action' => $panelurl . '/sessions/launch']);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'browserToken', 'value' => $SESSION->local_proctoring_launch_tokens[$attemptid]]);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'sessionId', 'value' => $session->sessionid]);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'returnUrl', 'value' => (new moodle_url('/local/proctoring/ready.php', ['attempt' => $attemptid]))->out(false)]);
echo html_writer::tag('button', get_string('startpreparation', 'quizaccess_proctoring'), ['type' => 'submit', 'class' => 'btn btn-primary']);
echo html_writer::end_tag('form');
echo $OUTPUT->footer();
