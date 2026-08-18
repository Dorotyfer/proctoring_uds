<?php
// This file is part of Moodle - http://moodle.org/.

require_once(__DIR__ . '/../../../config.php');

$attemptid = required_param('attempt', PARAM_INT);
$attempt = $DB->get_record('quiz_attempts', ['id' => $attemptid], '*', MUST_EXIST);
require_login();
if ((int)$attempt->userid !== (int)$USER->id) {
    throw new required_capability_exception(context_system::instance(), 'moodle/site:config', 'nopermissions', '');
}
if (empty($SESSION->local_proctoring_launch_tokens[$attemptid])) {
    throw new moodle_exception('sessioncreationfailed', 'local_proctoring');
}
$token = $SESSION->local_proctoring_launch_tokens[$attemptid];
unset($SESSION->local_proctoring_launch_tokens[$attemptid]);

$panelurl = rtrim((string)get_config('local_proctoring', 'panelurl'), '/');
if (parse_url($panelurl, PHP_URL_SCHEME) !== 'https') {
    throw new moodle_exception('configurationerror', 'local_proctoring');
}
redirect(new moodle_url($panelurl . '/session/' . rawurlencode($token)));
