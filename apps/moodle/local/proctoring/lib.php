<?php

defined('MOODLE_INTERNAL') || die();

function local_proctoring_extend_navigation(global_navigation $navigation): void {
    if (!isloggedin() || isguestuser()) {
        return;
    }

    $systemcontext = context_system::instance();
    $canview = has_capability('local/proctoring:viewinstitutionreports', $systemcontext);
    if (!$canview) {
        foreach (enrol_get_my_courses(['id']) as $course) {
            if (has_capability('local/proctoring:viewowncoursereports', context_course::instance($course->id))) {
                $canview = true;
                break;
            }
        }
    }

    if ($canview) {
        $navigation->add(
            get_string('openpanel', 'local_proctoring'),
            new moodle_url('/local/proctoring/report.php'),
            navigation_node::TYPE_CUSTOM,
            null,
            'local_proctoring_panel'
        );
    }
}
