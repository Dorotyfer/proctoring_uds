<?php

namespace local_proctoring\domain;

defined('MOODLE_INTERNAL') || die();

final class lti_request_validator {
    public static function validate(array $request, string $consumersecret, int $now): array {
        $warnings = [];
        foreach (['lti_message_type', 'lti_version', 'oauth_consumer_key', 'oauth_signature_method'] as $key) {
            if (empty($request[$key])) {
                $warnings[] = $key;
            }
        }
        if (($request['lti_message_type'] ?? '') !== 'basic-lti-launch-request') {
            $warnings[] = 'message_type';
        }
        if (($request['oauth_signature_method'] ?? '') !== 'HMAC-SHA1') {
            $warnings[] = 'signature_method';
        }
        if (empty($request['oauth_nonce'])) {
            $warnings[] = 'nonce';
        }
        $timestamp = (int)($request['oauth_timestamp'] ?? 0);
        if (!$timestamp || abs($now - $timestamp) > 300) {
            $warnings[] = 'timestamp';
        }
        if (empty($request['user_id'])) {
            $warnings[] = 'user_id';
        }
        if (empty($request['context_id'])) {
            $warnings[] = 'context_id';
        }
        if (empty($request['resource_link_id'])) {
            $warnings[] = 'resource_link_id';
        }
        if ($consumersecret === '' || empty($request['oauth_signature'])) {
            $warnings[] = 'signature';
        } else {
            $expected = self::signature($request, $consumersecret);
            if (!hash_equals($expected, (string)$request['oauth_signature'])) {
                $warnings[] = 'signature';
            }
        }

        return [
            'valid' => $warnings === [],
            'userid' => (int)($request['custom_userid'] ?? $request['user_id']),
            'courseid' => (int)($request['custom_courseid'] ?? $request['context_id']),
            'resourceid' => (string)$request['resource_link_id'],
            'warnings' => array_values(array_unique($warnings)),
        ];
    }

    private static function signature(array $request, string $secret): string {
        $url = (string)($request['oauth_signature_url'] ?? '');
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
