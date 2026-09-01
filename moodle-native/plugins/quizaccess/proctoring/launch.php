<?php

require_once(__DIR__ . '/../../../../config.php');

use local_proctoring\service\session_service;

$attemptid = required_param('attemptid', PARAM_INT);
$attempt = $DB->get_record('quiz_attempts', ['id' => $attemptid], '*', MUST_EXIST);
$quiz = $DB->get_record('quiz', ['id' => $attempt->quiz], '*', MUST_EXIST);

require_login($quiz->course, false);

if ((int)$attempt->userid !== (int)$USER->id) {
    throw new moodle_exception('invalidattempt', 'quizaccess_proctoring');
}

$PAGE->set_url(new moodle_url('/mod/quiz/accessrule/proctoring/launch.php', [
    'attemptid' => $attemptid
]));
$PAGE->set_context(context_module::instance(get_coursemodule_from_instance(
    'quiz',
    $quiz->id,
    $quiz->course,
    false,
    MUST_EXIST
)->id));
$PAGE->set_title(get_string('preparationtitle', 'quizaccess_proctoring'));
$session = (new session_service())->start_attempt($attemptid);
$PAGE->requires->js_call_amd('quizaccess_proctoring/launch', 'start', [[
    'attemptid' => $attemptid,
    'session' => $session,
]]);

echo $OUTPUT->header();
echo html_writer::start_div('local-proctoring-preparation', [
    'data-attemptid' => $attemptid,
    'data-sessionid' => $session['id'],
]);
echo html_writer::tag('p', get_string('preparationloading', 'quizaccess_proctoring'));
echo html_writer::end_div();
echo $OUTPUT->footer();
