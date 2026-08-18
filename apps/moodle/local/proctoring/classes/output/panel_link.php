<?php
// This file is part of Moodle - http://moodle.org/.

namespace local_proctoring\output;

defined('MOODLE_INTERNAL') || die();

/** Issues a short-lived, course-scoped RS256 panel token. */
final class panel_link {
    /** Returns the panel's actual SSO endpoint and a POST-only signed assertion. */
    public static function create_for_course(int $userid, int $courseid): array {
        $context = \context_course::instance($courseid);
        $canviewinstitution = has_capability('local/proctoring:viewinstitutionreports', \context_system::instance(), $userid);
        if (!$canviewinstitution && !has_capability('local/proctoring:viewowncoursereports', $context, $userid)) {
            throw new \required_capability_exception($context, 'local/proctoring:viewowncoursereports', 'nopermissions', '');
        }

        $capabilities = [];
        foreach ([
            'local/proctoring:viewowncoursereports',
            'local/proctoring:reviewowncoursealerts',
            'local/proctoring:viewbiometricevidence',
        ] as $capability) {
            if (has_capability($capability, $context, $userid)) {
                $capabilities[] = $capability;
            }
        }
        if ($canviewinstitution) {
            $capabilities[] = 'local/proctoring:viewinstitutionreports';
        }

        return [
            'action' => rtrim(self::config('panelurl'), '/') . '/sso/consume',
            'token' => self::issue_token($userid, $capabilities, [$courseid]),
        ];
    }

    private static function issue_token(int $userid, array $capabilities, array $courseids): string {
        $panelurl = self::config('panelurl');
        $privatekey = self::config('panelprivatekey');
        $publickey = self::config('jwtpublickey');
        if (parse_url($panelurl, PHP_URL_SCHEME) !== 'https' || $privatekey === '' || $publickey === '') {
            throw new \moodle_exception('configurationerror', 'local_proctoring');
        }
        $now = time();
        $header = self::base64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_THROW_ON_ERROR));
        $payload = self::base64url(json_encode([
            'moodleUserId' => (string)$userid,
            'capabilities' => array_values(array_unique($capabilities)),
            'courseIds' => array_map('strval', $courseids),
            'expiresAt' => gmdate('Y-m-d\\TH:i:s.000\\Z', $now + 300),
        ], JSON_THROW_ON_ERROR));
        $signed = $header . '.' . $payload;
        if (!openssl_sign($signed, $signature, $privatekey, OPENSSL_ALGO_SHA256) ||
                openssl_verify($signed, $signature, $publickey, OPENSSL_ALGO_SHA256) !== 1) {
            throw new \moodle_exception('configurationerror', 'local_proctoring');
        }
        return $signed . '.' . self::base64url($signature);
    }

    private static function config(string $name): string {
        return (string)get_config('local_proctoring', $name);
    }

    private static function base64url(string $value): string {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
