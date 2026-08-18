<?php
// This file is part of Moodle - http://moodle.org/.

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'quizaccess_proctoring';
$plugin->version = 2026081800;
$plugin->requires = 2023100900;
$plugin->release = '0.1.0';
$plugin->maturity = MATURITY_ALPHA;
$plugin->dependencies = [
    'local_proctoring' => 2026081800,
];
