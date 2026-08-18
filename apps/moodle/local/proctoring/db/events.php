<?php
// This file is part of Moodle - http://moodle.org/.

defined('MOODLE_INTERNAL') || die();

$observers = [
    [
        'eventname' => '\\mod_quiz\\event\\attempt_started',
        'callback' => '\\local_proctoring\\observer::attempt_started',
        'internal' => false,
        'priority' => 9999,
    ],
];
