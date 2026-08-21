<?php

require_once(__DIR__ . '/../../config.php');

require_login();

$systemcontext = context_system::instance();
$institutional = has_capability('local/proctoring:viewinstitutionreports', $systemcontext);
$courseids = [];
$reviewcourseids = [];

if (!$institutional) {
    $courses = enrol_get_my_courses(['id']);
    foreach ($courses as $course) {
        $context = context_course::instance($course->id);
        if (has_capability('local/proctoring:viewowncoursereports', $context)) {
            $courseids[] = $course->id;
        }
        if (has_capability('local/proctoring:reviewowncoursealerts', $context)) {
            $reviewcourseids[] = $course->id;
        }
    }
    if (empty($courseids)) {
        throw new required_capability_exception(
            $systemcontext,
            'local/proctoring:viewinstitutionreports',
            'nopermissions',
            ''
        );
    }
}

$capabilities = [];
if ($institutional) {
    $capabilities[] = 'local/proctoring:viewinstitutionreports';
    if (has_capability('local/proctoring:managepolicies', $systemcontext)) {
        $capabilities[] = 'local/proctoring:managepolicies';
    }
}
if ($institutional || !empty($courseids)) {
    $capabilities[] = 'local/proctoring:viewowncoursereports';
}
if ($institutional || !empty($reviewcourseids)) {
    $capabilities[] = 'local/proctoring:reviewowncoursealerts';
}
if (has_capability('local/proctoring:viewbiometricevidence', $systemcontext)) {
    $capabilities[] = 'local/proctoring:viewbiometricevidence';
}

$apiurl = rtrim((string)get_config('local_proctoring', 'apiurl'), '/');
$publicapiurl = rtrim((string)get_config('local_proctoring', 'publicapiurl'), '/');
$panelurl = rtrim((string)get_config('local_proctoring', 'panelurl'), '/');
if (empty($apiurl) || empty($panelurl)) {
    throw new moodle_exception('panelnotconfigured', 'local_proctoring');
}
$publicapiurl = $publicapiurl ?: $apiurl;

$service = new \local_proctoring\panel_token_service();
$token = $service->issue($USER->id, fullname($USER), $capabilities, $courseids, $reviewcourseids);
$returnurl = $panelurl . '/panel';
$destination = $publicapiurl . '/v1/panel/sso?' . http_build_query([
    'token' => $token,
    'returnUrl' => $returnurl
]);
redirect($destination);
