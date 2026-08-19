<?php

require_once(__DIR__ . '/../../../../config.php');

$attemptid = required_param('attemptid', PARAM_INT);
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
$token = $client->issue_browser_token($local->remotesessionid);
$returnurl = new moodle_url('/mod/quiz/attempt.php', [
    'attempt' => $attemptid,
    'proctoringready' => 1
]);
$launchurl = $panelurl . '/session/' . rawurlencode($token) . '?' . http_build_query([
    'returnUrl' => $returnurl->out(false)
]);

redirect($launchurl);
