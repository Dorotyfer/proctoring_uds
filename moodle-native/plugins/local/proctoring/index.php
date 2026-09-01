<?php

require_once(__DIR__ . '/../../config.php');

require_login();
$courseid = optional_param('courseid', 0, PARAM_INT);
$context = $courseid ? context_course::instance($courseid) : context_system::instance();
if ($courseid) {
    if (!has_capability('local/proctoring:viewowncoursereports', $context)
            && !has_capability('local/proctoring:viewinstitutionreports', context_system::instance())) {
        throw new required_capability_exception($context, 'local/proctoring:viewowncoursereports', 'nopermissions', 'local_proctoring');
    }
}
$PAGE->set_url(new moodle_url('/local/proctoring/index.php', ['courseid' => $courseid]));
$PAGE->set_context($context);
$PAGE->set_title(get_string('panel', 'local_proctoring'));
$PAGE->set_heading(get_string('panel', 'local_proctoring'));
$PAGE->requires->css(new moodle_url('/local/proctoring/styles.css'));
$PAGE->requires->js_call_amd('local_proctoring/panel', 'init');

echo $OUTPUT->header();
echo $OUTPUT->render(new local_proctoring\output\panel_page(['courseid' => $courseid]));
echo $OUTPUT->footer();
