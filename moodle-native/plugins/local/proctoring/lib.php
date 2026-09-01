<?php

defined('MOODLE_INTERNAL') || die();

function local_proctoring_extend_navigation(global_navigation $navigation): void {
    if (!isloggedin() || isguestuser()) {
        return;
    }

    $context = context_system::instance();
    if (!has_capability('local/proctoring:viewinstitutionreports', $context)) {
        return;
    }

    $navigation->add(
        get_string('panel', 'local_proctoring'),
        new moodle_url('/local/proctoring/index.php'),
        navigation_node::TYPE_CUSTOM,
        null,
        'local_proctoring_panel'
    );
}
