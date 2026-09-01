<?php

defined('MOODLE_INTERNAL') || die();

$observers = [
    [
        'eventname' => '\\mod_quiz\\event\\attempt_started',
        'callback' => 'quizaccess_proctoring\\observer::attempt_started',
    ],
    [
        'eventname' => '\\mod_quiz\\event\\attempt_submitted',
        'callback' => 'quizaccess_proctoring\\observer::attempt_finished',
    ],
    [
        'eventname' => '\\mod_quiz\\event\\attempt_becameoverdue',
        'callback' => 'quizaccess_proctoring\\observer::attempt_finished',
    ],
];
