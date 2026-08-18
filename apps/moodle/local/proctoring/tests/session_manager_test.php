<?php
// This file is part of Moodle - http://moodle.org/.

namespace local_proctoring;

defined('MOODLE_INTERNAL') || die();

final class session_manager_test extends \advanced_testcase {
    public function test_create_for_attempt_persists_only_session_identifier_and_expiry(): void {
        $curl = new class {
            public function setopt(array $options): void {}
            public function setHeader(string $header): void {}
            public function post(string $url, string $body): string {
                $payload = json_decode($body, true);
                if ($payload['deviceMode'] !== 'seb') {
                    throw new \RuntimeException('Expected SEB mode.');
                }
                return json_encode([
                    'session' => ['id' => '22222222-2222-4222-8222-222222222222', 'expiresAt' => '2026-08-18T13:00:00.000Z'],
                    'browserToken' => 'browser-token-must-not-persist',
                ]);
            }
            public function get_errno(): int { return 0; }
            public function get_info(): array { return ['http_code' => 201]; }
        };
        $client = new api_client(
            static fn() => $curl,
            static fn(string $name): string => ['apiurl' => 'https://proctoring.example.test', 'integrationkey' => 'key'][$name]
        );
        $written = [];
        $manager = new session_manager(
            $client,
            static function(int $attemptid, string $sessionid, string $expiresat) use (&$written): void {
                $written = compact('attemptid', 'sessionid', 'expiresat');
            },
            static fn(): \DateTimeImmutable => new \DateTimeImmutable('2026-08-18T12:00:00+00:00')
        );

        $result = $manager->create_for_attempt((object)[
            'id' => 4,
            'userid' => 5,
            'quiz' => 7,
        ], (object)['id' => 7, 'course' => 6], 'seb');

        $this->assertSame('22222222-2222-4222-8222-222222222222', $result['sessionid']);
        $this->assertSame('browser-token-must-not-persist', $result['browsertoken']);
        $this->assertSame([
            'attemptid' => 4,
            'sessionid' => '22222222-2222-4222-8222-222222222222',
            'expiresat' => '2026-08-18T13:00:00.000Z',
        ], $written);
        $this->assertNotContains('browser-token-must-not-persist', $written);
    }

    public function test_create_for_attempt_rejects_unknown_device_mode(): void {
        $manager = new session_manager();
        $this->expectException(\invalid_parameter_exception::class);
        $manager->create_for_attempt((object)['id' => 4, 'userid' => 5, 'quiz' => 7], (object)['id' => 7, 'course' => 6], 'desktop');
    }
}
