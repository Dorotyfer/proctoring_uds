<?php

require_once(__DIR__ . '/../../../config.php');

require_login();
$sessionid = required_param('sessionid', PARAM_INT);
$detail = (new local_proctoring\service\panel_service())->get_session_detail($sessionid);
$PAGE->set_url(new moodle_url('/local/proctoring/session.php', ['sessionid' => $sessionid]));
$PAGE->set_context(context_system::instance());
$PAGE->set_title(get_string('panel', 'local_proctoring'));
$PAGE->set_heading(get_string('panel', 'local_proctoring'));
$PAGE->requires->css(new moodle_url('/local/proctoring/styles.css'));

echo $OUTPUT->header();
echo $OUTPUT->render(new local_proctoring\output\session_detail($detail));
echo $OUTPUT->footer();
