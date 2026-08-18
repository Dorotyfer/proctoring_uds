<?php
// This file is part of Moodle - http://moodle.org/.

namespace local_proctoring;

defined('MOODLE_INTERNAL') || die();

/** Creates sessions and records non-secret attempt metadata. */
final class session_manager {
    /** @var api_client */
    private $client;
    /** @var callable */
    private $metadatawriter;
    /** @var callable */
    private $clock;

    public function __construct(?api_client $client = null, ?callable $metadatawriter = null, ?callable $clock = null) {
        $this->client = $client ?? new api_client();
        $this->metadatawriter = $metadatawriter ?? static function(int $attemptid, string $sessionid, string $expiresat): void {
            global $DB;
            $DB->insert_record('local_proctoring_attempt', (object)[
                'quizattemptid' => $attemptid,
                'sessionid' => $sessionid,
                'expiresat' => $expiresat,
                'timecreated' => time(),
            ]);
        };
        $this->clock = $clock ?? static function(): \DateTimeImmutable {
            return new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        };
    }

    /**
     * @param \stdClass $attempt Moodle quiz_attempts record with id, userid and quiz.
     * @param \stdClass $quiz Moodle quiz record with id and course.
     * @param string $devicemode browser or seb, chosen by a quiz access-rule adapter.
     * @return array Session id, expiry and one-time browser launch token.
     */
    public function create_for_attempt(\stdClass $attempt, \stdClass $quiz, string $devicemode): array {
        if (!in_array($devicemode, ['browser', 'seb'], true)) {
            throw new \invalid_parameter_exception('Invalid proctoring device mode.');
        }
        foreach (['id', 'userid', 'quiz'] as $field) {
            if (empty($attempt->{$field})) {
                throw new \invalid_parameter_exception('Attempt is missing required field: ' . $field);
            }
        }
        foreach (['id', 'course'] as $field) {
            if (empty($quiz->{$field})) {
                throw new \invalid_parameter_exception('Quiz is missing required field: ' . $field);
            }
        }
        if ((int)$attempt->quiz !== (int)$quiz->id) {
            throw new \invalid_parameter_exception('Attempt does not belong to this quiz.');
        }

        $issuedat = ($this->clock)();
        $expiresat = $issuedat->modify('+1 hour');
        $response = $this->client->create_session([
            'moodleUserId' => (string)$attempt->userid,
            'moodleCourseId' => (string)$quiz->course,
            'moodleQuizId' => (string)$quiz->id,
            'moodleAttemptId' => (string)$attempt->id,
            'deviceMode' => $devicemode,
            'issuedAt' => $this->format_contract_timestamp($issuedat),
            'expiresAt' => $this->format_contract_timestamp($expiresat),
        ]);

        ($this->metadatawriter)((int)$attempt->id, $response['session']['id'], $response['session']['expiresAt']);

        return [
            'sessionid' => $response['session']['id'],
            'expiresat' => $response['session']['expiresAt'],
            'browsertoken' => $response['browserToken'],
        ];
    }

    /** Format an API timestamp accepted by Zod's strict datetime schema. */
    private function format_contract_timestamp(\DateTimeImmutable $time): string {
        return $time->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\\TH:i:s.v\\Z');
    }
}
