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
    'local_proctoring_list_courses' => [
        'classname' => 'local_proctoring\\external\\list_courses',
        'methodname' => 'execute',
        'description' => 'List proctoring courses visible to the current reviewer.',
        'type' => 'read',
        'ajax' => true,
    ],
    'local_proctoring_list_course_attempts' => [
        'classname' => 'local_proctoring\\external\\list_course_attempts',
        'methodname' => 'execute',
        'description' => 'List scoped proctoring attempts for a course.',
        'type' => 'read',
        'ajax' => true,
    ],
    'local_proctoring_get_session_detail' => [
        'classname' => 'local_proctoring\\external\\get_session_detail',
        'methodname' => 'execute',
        'description' => 'Read a scoped proctoring session detail.',
        'type' => 'read',
        'ajax' => true,
    ],
    'local_proctoring_review_alert' => [
        'classname' => 'local_proctoring\\external\\review_alert',
        'methodname' => 'execute',
        'description' => 'Review or dismiss a proctoring alert.',
        'type' => 'write',
        'ajax' => true,
    ],
    'local_proctoring_reset_biometric_profile' => [
        'classname' => 'local_proctoring\\external\\reset_biometric_profile',
        'methodname' => 'execute',
        'description' => 'Revoke a user biometric profile.',
        'type' => 'write',
        'ajax' => true,
    ],
];
$services = [];
