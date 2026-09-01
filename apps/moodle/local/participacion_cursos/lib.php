<?php

defined('MOODLE_INTERNAL') || die();

function local_participacion_cursos_extend_navigation_course($navigation, $course, $context): void {
    if (!has_capability('moodle/course:view', $context)) {
        return;
    }

    $navigation->add(
        get_string('tab_name', 'local_participacion_cursos'),
        new moodle_url('/local/participacion_cursos/index.php', ['id' => $course->id]),
        navigation_node::TYPE_SETTING,
        null,
        'participacion_cursos_link'
    );
}
