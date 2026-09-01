<?php

require_once(__DIR__ . '/../../../config.php');
require_once($CFG->dirroot . '/mod/lti/lib.php');
require_once($CFG->dirroot . '/mod/lti/locallib.php');

use local_proctoring\domain\lti_request_validator;
use local_proctoring\service\lti_launch_service;

$request = $_POST;
if (!$request) {
    $request = $_GET;
}
$consumerkey = required_param('oauth_consumer_key', PARAM_RAW);
$typeid = $DB->get_field_sql(
    "SELECT typeid FROM {lti_types_config} WHERE name = :name AND value = :value",
    ['name' => 'resourcekey', 'value' => $consumerkey]
);
if (!$typeid) {
    throw new moodle_exception('errortooltypenotfound', 'mod_lti');
}

lti_verify_oauth_signature((int)$typeid, $consumerkey);
$typeconfig = lti_get_type_config((int)$typeid);
$request['oauth_signature_url'] = rtrim($CFG->wwwroot, '/') . '/local/proctoring/lti/launch.php';
$validation = lti_request_validator::validate($request, (string)($typeconfig['password'] ?? ''), time());
if (!$validation['valid']) {
    throw new moodle_exception('invalidrequest', 'local_proctoring', '', implode(', ', $validation['warnings']));
}

$userid = $validation['userid'];
$courseid = $validation['courseid'];
$attemptid = (int)($request['custom_attemptid'] ?? 0);
if (!empty($request['custom_courseid'])) {
    $courseid = (int)$request['custom_courseid'];
}
if ($userid < 1 || !$DB->record_exists('user', ['id' => $userid, 'deleted' => 0])) {
    throw new moodle_exception('invaliduser', 'local_proctoring');
}

lti_set_session_user($userid);
$request['custom_userid'] = $userid;
$request['custom_courseid'] = $courseid;
$request['custom_attemptid'] = $attemptid;
$url = (new lti_launch_service())->launch($request);
redirect($url);
