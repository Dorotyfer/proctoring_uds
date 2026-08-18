<?php
// This file is part of Moodle - http://moodle.org/.

require_once(__DIR__ . '/../../../config.php');

$courseid = required_param('course', PARAM_INT);
$course = $DB->get_record('course', ['id' => $courseid], '*', MUST_EXIST);
require_login($course);
$assertion = \local_proctoring\output\panel_link::create_for_course((int)$USER->id, $courseid);

header('Referrer-Policy: no-referrer');
$PAGE->set_url('/local/proctoring/panel.php', ['course' => $courseid]);
$PAGE->set_context(context_course::instance($courseid));
$PAGE->set_title(get_string('pluginname', 'local_proctoring'));
echo $OUTPUT->header();
echo html_writer::tag('p', get_string('panelredirecting', 'local_proctoring'));
echo html_writer::start_tag('form', ['id' => 'local-proctoring-panel-sso', 'method' => 'post', 'action' => $assertion['action']]);
echo html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'token', 'value' => $assertion['token']]);
echo html_writer::tag('button', get_string('openpanel', 'local_proctoring'), ['type' => 'submit', 'class' => 'btn btn-primary']);
echo html_writer::end_tag('form');
echo html_writer::tag('script', "document.getElementById('local-proctoring-panel-sso').submit();", ['type' => 'text/javascript']);
echo $OUTPUT->footer();
