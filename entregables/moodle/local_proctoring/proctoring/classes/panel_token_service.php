<?php

namespace local_proctoring;

defined('MOODLE_INTERNAL') || die();

class panel_token_service {
    public function issue(
        int $userid,
        string $displayname,
        array $capabilities,
        array $courseids,
        array $reviewcourseids
    ): string {
        $secret = (string)get_config('local_proctoring', 'panelssosecret');
        if (strlen($secret) < 32) {
            throw new \moodle_exception('panelnotconfigured', 'local_proctoring');
        }

        $header = $this->base64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload = $this->base64url(json_encode([
            'moodleUserId' => (string)$userid,
            'displayName' => $displayname,
            'capabilities' => array_values($capabilities),
            'courseIds' => array_values(array_map('strval', $courseids)),
            'reviewCourseIds' => array_values(array_map('strval', $reviewcourseids)),
            'aud' => 'proctoring-panel-sso',
            'iat' => time(),
            'exp' => time() + 120
        ]));
        $signature = $this->base64url(hash_hmac('sha256', $header . '.' . $payload, $secret, true));
        return $header . '.' . $payload . '.' . $signature;
    }

    private function base64url(string $value): string {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
