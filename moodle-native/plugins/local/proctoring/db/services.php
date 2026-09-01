<?php

defined('MOODLE_INTERNAL') || die();

$functions = [
    'local_proctoring_start_attempt' => [
        'classname' => 'local_proctoring\\external\\start_attempt_session',
        'methodname' => 'execute',
        'description' => 'Create or return the native proctoring session for a quiz attempt.',
        'type' => 'write',
        'ajax' => true,
    ],
    'local_proctoring_get_attempt' => [
        'classname' => 'local_proctoring\\external\\get_attempt_session',
        'methodname' => 'execute',
        'description' => 'Read the current native proctoring session for a quiz attempt.',
        'type' => 'read',
        'ajax' => true,
    ],
    'local_proctoring_activate_attempt' => [
        'classname' => 'local_proctoring\\external\\activate_attempt_session',
        'methodname' => 'execute',
        'description' => 'Activate a prepared native proctoring session.',
        'type' => 'write',
        'ajax' => true,
    ],
    'local_proctoring_complete_attempt' => [
        'classname' => 'local_proctoring\\external\\complete_attempt_session',
        'methodname' => 'execute',
        'description' => 'Complete a native proctoring session.',
        'type' => 'write',
        'ajax' => true,
    ],
    'local_proctoring_record_events' => [
        'classname' => 'local_proctoring\\external\\record_session_events',
        'methodname' => 'execute',
        'description' => 'Record idempotent browser or adapter events.',
        'type' => 'write',
        'ajax' => true,
    ],
    'local_proctoring_record_incident' => [
        'classname' => 'local_proctoring\\external\\record_incident',
        'methodname' => 'execute',
        'description' => 'Record one incident and derive a reviewable alert when applicable.',
        'type' => 'write',
        'ajax' => true,
    ],
    'local_proctoring_upload_evidence' => [
        'classname' => 'local_proctoring\\external\\upload_evidence',
        'methodname' => 'execute',
        'description' => 'Store encrypted evidence in the Moodle private File API.',
        'type' => 'write',
        'ajax' => true,
    ],
    'local_proctoring_record_biometric_check' => [
        'classname' => 'local_proctoring\\external\\record_biometric_check',
        'methodname' => 'execute',
        'description' => 'Record a biometric verification result for an attempt.',
        'type' => 'write',
        'ajax' => true,
    ],
];
$services = [];
