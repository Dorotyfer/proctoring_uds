<?php

namespace local_proctoring\tests;

defined('MOODLE_INTERNAL') || die();

final class lti_request_validator_test extends \advanced_testcase {
    public function test_validator_rejects_invalid_signature(): void {
        $result = \local_proctoring\domain\lti_request_validator::validate(
            $this->signed_request('wrong-secret'),
            'real-secret',
            1700000000
        );

        $this->assertFalse($result['valid']);
        $this->assertContains('signature', $result['warnings']);
    }

    public function test_validator_rejects_stale_timestamp_and_missing_nonce(): void {
        $request = $this->signed_request('real-secret');
        $request['oauth_timestamp'] = 1690000000;
        unset($request['oauth_nonce']);

        $result = \local_proctoring\domain\lti_request_validator::validate($request, 'real-secret', 1700000000);

        $this->assertFalse($result['valid']);
        $this->assertContains('timestamp', $result['warnings']);
        $this->assertContains('nonce', $result['warnings']);
    }

    private function signed_request(string $secret): array {
        $request = [
            'lti_message_type' => 'basic-lti-launch-request',
            'lti_version' => 'LTI-1p0',
            'oauth_consumer_key' => 'proctoring-internal',
            'oauth_signature_method' => 'HMAC-SHA1',
            'oauth_timestamp' => 1700000000,
            'oauth_nonce' => 'nonce-1',
            'user_id' => '2',
            'roles' => 'Instructor',
            'context_id' => '7',
            'resource_link_id' => 'quiz-41',
            'oauth_signature_url' => 'https://moodle.test/local/proctoring/lti/launch.php',
        ];
        $request['oauth_signature'] = $this->oauth_signature($request, $secret);
        return $request;
    }

    private function oauth_signature(array $request, string $secret): string {
        $url = $request['oauth_signature_url'];
        unset($request['oauth_signature'], $request['oauth_signature_url']);
        ksort($request);
        $pairs = [];
        foreach ($request as $key => $value) {
            $pairs[] = rawurlencode($key) . '=' . rawurlencode((string)$value);
        }
        $base = 'POST&' . rawurlencode($url) . '&' . rawurlencode(implode('&', $pairs));
        return base64_encode(hash_hmac('sha1', $base, rawurlencode($secret) . '&', true));
    }
}
