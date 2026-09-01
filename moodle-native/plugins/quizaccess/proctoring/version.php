<?php

defined('MOODLE_INTERNAL') || die();

$plugin->component = 'quizaccess_proctoring';
$plugin->version = 2026090100;
$plugin->requires = 2023100900;
$plugin->maturity = MATURITY_ALPHA;
$plugin->release = '0.1.0-native';
$plugin->dependencies = ['local_proctoring' => 2026090100];
