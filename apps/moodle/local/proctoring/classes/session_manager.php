<?php

namespace local_proctoring;

defined('MOODLE_INTERNAL') || die();

class session_manager {
    public function __construct(private api_client $client) {
    }

    public function create_for_attempt(\stdClass $attempt, string $devicemode): array {
        global $DB;

        if (!in_array($devicemode, ['browser', 'seb'], true)) {
            throw new \coding_exception('Unsupported proctoring device mode.');
        }

        $existing = $DB->get_record('local_proctoring_sessions', ['attemptid' => $attempt->id]);
        if ($existing && !empty($existing->remotesessionid)) {
            return [
                'session' => [
                    'id' => $existing->remotesessionid,
                    'status' => $existing->status
                ]
            ];
        }

        $issuedat = time();
        $expiresat = $attempt->proctoringexpiresat ?? ($issuedat + (6 * HOURSECS));
        $course = $DB->get_record('course', ['id' => $attempt->courseid], 'id, fullname', MUST_EXIST);
        $quiz = $DB->get_record('quiz', ['id' => $attempt->quiz], 'id, name', MUST_EXIST);
        $student = $DB->get_record(
            'user',
            ['id' => $attempt->userid],
            'id, firstname, lastname, firstnamephonetic, lastnamephonetic, middlename, alternatename, idnumber',
            MUST_EXIST
        );
        $studentdocument = trim((string)$student->idnumber);
        $payload = [
            'moodleUserId' => (string)$attempt->userid,
            'moodleCourseId' => (string)$attempt->courseid,
            'moodleQuizId' => (string)$attempt->quiz,
            'moodleAttemptId' => (string)$attempt->id,
            'courseName' => $course->fullname,
            'quizName' => $quiz->name,
            'studentName' => fullname($student),
            'studentDocument' => $studentdocument === '' ? null : $studentdocument,
            'deviceMode' => $devicemode,
            'issuedAt' => gmdate('Y-m-d\\TH:i:s.000\\Z', $issuedat),
            'expiresAt' => gmdate('Y-m-d\\TH:i:s.000\\Z', $expiresat)
        ];

        $result = $this->client->create_session($payload);
        $record = (object)[
            'attemptid' => $attempt->id,
            'remotesessionid' => $result['session']['id'],
            'status' => $result['session']['status'] ?? 'pending',
            'expiresat' => $expiresat,
            'timecreated' => $issuedat,
            'timemodified' => $issuedat
        ];

        if ($existing) {
            $record->id = $existing->id;
            $DB->update_record('local_proctoring_sessions', $record);
        } else {
            $DB->insert_record('local_proctoring_sessions', $record);
        }

        return $result;
    }
}
