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
     * @param \stdClass $attempt Attempt record with id, userid, courseid and quiz id.
     * @param string $devicemode browser or seb, chosen by a quiz access-rule adapter.
     * @return array Session id, expiry and one-time browser launch token.
     */
    public function create_for_attempt(\stdClass $attempt, string $devicemode): array {
        if (!in_array($devicemode, ['browser', 'seb'], true)) {
            throw new \invalid_parameter_exception('Invalid proctoring device mode.');
        }
        foreach (['id', 'userid', 'courseid', 'quizid'] as $field) {
            if (empty($attempt->{$field})) {
                throw new \invalid_parameter_exception('Attempt is missing required field: ' . $field);
            }
        }

        $issuedat = ($this->clock)();
        $expiresat = $issuedat->modify('+1 hour');
        $response = $this->client->create_session([
            'moodleUserId' => (string)$attempt->userid,
            'moodleCourseId' => (string)$attempt->courseid,
            'moodleQuizId' => (string)$attempt->quizid,
            'moodleAttemptId' => (string)$attempt->id,
            'deviceMode' => $devicemode,
            'issuedAt' => $issuedat->format(DATE_ATOM),
            'expiresAt' => $expiresat->format(DATE_ATOM),
        ]);

        ($this->metadatawriter)((int)$attempt->id, $response['session']['id'], $response['session']['expiresAt']);

        return [
            'sessionid' => $response['session']['id'],
            'expiresat' => $response['session']['expiresAt'],
            'browsertoken' => $response['browserToken'],
        ];
    }
}
