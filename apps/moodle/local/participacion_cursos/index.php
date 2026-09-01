<?php

require_once(__DIR__ . '/../../config.php');

$courseid = required_param('id', PARAM_INT);
$course = $DB->get_record('course', ['id' => $courseid], '*', MUST_EXIST);

require_login($course);
$context = context_course::instance($course->id);
require_capability('moodle/course:view', $context);

$PAGE->set_url(new moodle_url('/local/participacion_cursos/index.php', ['id' => $courseid]));
$PAGE->set_context($context);
$PAGE->set_title($course->fullname . ' - ' . get_string('pluginname', 'local_participacion_cursos'));
$PAGE->set_heading($course->fullname);
$PAGE->set_pagelayout('report');

$sql = <<<'SQL'
    SELECT
        c.id,
        c.fullname,
        (SELECT COUNT(*)
           FROM {course_modules_completion} cmc
           JOIN {course_modules} cm ON cm.id = cmc.coursemoduleid
          WHERE cm.course = c.id AND cmc.completionstate = 1) AS actividades,
        (SELECT COUNT(*)
           FROM {quiz_attempts} qa
           JOIN {quiz} q ON q.id = qa.quiz
          WHERE q.course = c.id AND qa.preview = 0) AS cuestionarios,
        (SELECT COUNT(*)
           FROM {assign_submission} asub
           JOIN {assign} a ON a.id = asub.assignment
          WHERE a.course = c.id AND asub.status = 'submitted') AS tareas,
        (SELECT COUNT(*)
           FROM {forum_posts} fp
           JOIN {forum_discussions} fd ON fd.id = fp.discussion
           JOIN {forum} f ON f.id = fd.forum
          WHERE f.course = c.id) AS foros
    FROM {course} c
    WHERE c.id = :courseid
SQL;

$record = $DB->get_record_sql($sql, ['courseid' => $courseid]);

$values = [
    (int) $record->actividades,
    (int) $record->cuestionarios,
    (int) $record->tareas,
    (int) $record->foros,
];

$chart = new \core\chart_pie();
$chart->set_title(get_string('chart_title', 'local_participacion_cursos'));
$chart->set_doughnut(true);
$chart->set_labels([
    get_string('metric_activities', 'local_participacion_cursos'),
    get_string('metric_quizzes', 'local_participacion_cursos'),
    get_string('metric_assignments', 'local_participacion_cursos'),
    get_string('metric_forums', 'local_participacion_cursos'),
]);
$chart->add_series(new \core\chart_series(
    get_string('series_participation', 'local_participacion_cursos'),
    $values
));

echo $OUTPUT->header();
echo $OUTPUT->heading(get_string('page_heading', 'local_participacion_cursos'));

$institutional = has_capability('local/proctoring:viewinstitutionreports', context_system::instance());
$canviewpanel = $institutional;
if (!$canviewpanel) {
    foreach (enrol_get_my_courses(['id']) as $enrolledcourse) {
        if (has_capability('local/proctoring:viewowncoursereports', context_course::instance($enrolledcourse->id))) {
            $canviewpanel = true;
            break;
        }
    }
}

if ($canviewpanel) {
    $panelbutton = $OUTPUT->single_button(
        new moodle_url('/local/proctoring/report.php'),
        get_string('open_panel', 'local_participacion_cursos'),
        'get'
    );
    echo html_writer::div($panelbutton, 'mb-4');
}

if (array_sum($values) === 0) {
    echo $OUTPUT->notification(get_string('nodata', 'local_participacion_cursos'), 'info');
} else {
    echo $OUTPUT->render($chart);
}

echo $OUTPUT->footer();
