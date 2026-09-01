<?php

require_once(__DIR__ . '/../../../../config.php');

$attemptid = required_param('attemptid', PARAM_INT);
$attempt = $DB->get_record('quiz_attempts', ['id' => $attemptid], '*', MUST_EXIST);

require_login($attempt->courseid, false);

if ((int)$attempt->userid !== (int)$USER->id) {
    throw new moodle_exception('invalidattempt', 'quizaccess_proctoring');
}

$PAGE->set_url(new moodle_url('/mod/quiz/accessrule/proctoring/launch.php', [
    'attemptid' => $attemptid
]));
$PAGE->set_context(context_user::instance($USER->id));
$PAGE->set_title(get_string('preparationtitle', 'quizaccess_proctoring'));

echo $OUTPUT->header();
echo html_writer::start_div('local-proctoring-preparation', [
    'data-attemptid' => $attemptid
]);
echo html_writer::tag('p', get_string('preparationloading', 'quizaccess_proctoring'));
echo html_writer::end_div();
echo $OUTPUT->footer();
