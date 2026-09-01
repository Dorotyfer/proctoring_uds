<?php

require_once(__DIR__ . '/../../config.php');

require_login();
$PAGE->set_url(new moodle_url('/local/proctoring/index.php'));
$PAGE->set_context(context_system::instance());
$PAGE->set_title(get_string('panel', 'local_proctoring'));
$PAGE->set_heading(get_string('panel', 'local_proctoring'));
$PAGE->requires->css(new moodle_url('/local/proctoring/styles.css'));
$PAGE->requires->js_call_amd('local_proctoring/panel', 'init');

echo $OUTPUT->header();
echo $OUTPUT->render(new local_proctoring\output\panel_page());
echo $OUTPUT->footer();
