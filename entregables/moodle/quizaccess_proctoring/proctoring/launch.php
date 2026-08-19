<?php

require_once(__DIR__ . '/../../../../config.php');

$attemptid = required_param('attemptid', PARAM_INT);
$callback = optional_param('callback', 0, PARAM_BOOL);
$mode = optional_param('mode', 'prepare', PARAM_ALPHA);
$attempt = $DB->get_record('quiz_attempts', ['id' => $attemptid], '*', MUST_EXIST);
$quiz = $DB->get_record('quiz', ['id' => $attempt->quiz], '*', MUST_EXIST);

require_login($quiz->course, false);
if ((int)$attempt->userid !== (int)$USER->id) {
    throw new moodle_exception('invalidattempt', 'quizaccess_proctoring');
}

$policy = $DB->get_record('quizaccess_proctoring', ['quizid' => $quiz->id]);
if (!$policy || empty($policy->enabled)) {
    throw new moodle_exception('invalidattempt', 'quizaccess_proctoring');
}

$local = $DB->get_record('local_proctoring_sessions', ['attemptid' => $attemptid]);
if (!$local || empty($local->remotesessionid)) {
    throw new moodle_exception('sessionmissing', 'quizaccess_proctoring');
}

$panelurl = rtrim((string)get_config('local_proctoring', 'panelurl'), '/');
if (empty($panelurl)) {
    throw new moodle_exception('servicenotconfigured', 'quizaccess_proctoring');
}

$client = new \local_proctoring\api_client();
$status = $client->get_session_status($local->remotesessionid);
if ($callback) {
    if ($status !== 'active') {
        throw new moodle_exception('sessionmissing', 'quizaccess_proctoring');
    }

    $local->status = 'active';
    $local->timemodified = time();
    $DB->update_record('local_proctoring_sessions', $local);
    redirect(new moodle_url('/mod/quiz/attempt.php', ['attempt' => $attemptid]));
}
if ($mode === 'monitor' && $status !== 'active') {
    throw new moodle_exception('sessionmissing', 'quizaccess_proctoring');
}

$token = $client->issue_browser_token($local->remotesessionid);
$returnurl = new moodle_url('/mod/quiz/accessrule/proctoring/launch.php', [
    'attemptid' => $attemptid,
    'callback' => 1
]);
$query = $mode === 'monitor'
    ? ['mode' => 'monitor']
    : ['returnUrl' => $returnurl->out(false)];
$launchurl = $panelurl . '/session/' . rawurlencode($token) . '?' . http_build_query($query);

redirect($launchurl);
