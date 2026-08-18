<?php
// This file is part of Moodle - http://moodle.org/.

namespace local_proctoring;

defined('MOODLE_INTERNAL') || die();

final class api_client_test extends \advanced_testcase {
    public function test_create_session_uses_server_headers_and_secure_curl_options(): void {
        $curl = new class {
            public array $options = [];
            public array $headers = [];
            public string $url = '';
            public string $body = '';

            public function setopt(array $options): void {
                $this->options = $options;
            }
            public function setHeader(string $header): void {
                $this->headers[] = $header;
            }
            public function post(string $url, string $body): string {
                $this->url = $url;
                $this->body = $body;
                return json_encode([
                    'session' => ['id' => '11111111-1111-4111-8111-111111111111', 'expiresAt' => '2026-08-18T13:00:00.000Z'],
                    'browserToken' => 'short-lived-browser-token',
                ]);
            }
            public function get_errno(): int {
                return 0;
            }
            public function get_info(): array {
                return ['http_code' => 201];
            }
        };
        $client = new api_client(
            static fn() => $curl,
            static fn(string $name): string => [
                'apiurl' => 'https://proctoring.example.test/',
                'integrationkey' => 'server-secret',
            ][$name],
            static fn(): string => 'correlation-1'
        );

        $response = $client->create_session(['moodleAttemptId' => '12']);

        $this->assertSame('https://proctoring.example.test/v1/internal/sessions', $curl->url);
        $this->assertSame(['CURLOPT_CONNECTTIMEOUT' => 5, 'CURLOPT_TIMEOUT' => 5,
            'CURLOPT_SSL_VERIFYPEER' => true, 'CURLOPT_SSL_VERIFYHOST' => 2,
            'CURLOPT_FOLLOWLOCATION' => false], $curl->options);
        $this->assertContains('X-Moodle-Integration-Key: server-secret', $curl->headers);
        $this->assertContains('X-Correlation-ID: correlation-1', $curl->headers);
        $this->assertSame(['moodleAttemptId' => '12'], json_decode($curl->body, true));
        $this->assertSame('11111111-1111-4111-8111-111111111111', $response['session']['id']);
    }

    public function test_create_session_maps_api_failures_to_safe_exception(): void {
        $curl = new class {
            public function setopt(array $options): void {}
            public function setHeader(string $header): void {}
            public function post(string $url, string $body): string { return '{"error":"upstream details"}'; }
            public function get_errno(): int { return 28; }
            public function get_info(): array { return ['http_code' => 504]; }
        };
        $client = new api_client(
            static fn() => $curl,
            static fn(string $name): string => ['apiurl' => 'https://proctoring.example.test', 'integrationkey' => 'key'][$name]
        );

        $this->expectException(\moodle_exception::class);
        $this->expectExceptionMessage(get_string('sessioncreationfailed', 'local_proctoring'));
        $client->create_session([]);
    }

    public function test_create_session_rejects_non_https_api_urls(): void {
        $client = new api_client(
            fn() => $this->fail('Curl must not be created for an insecure URL'),
            static fn(string $name): string => ['apiurl' => 'http://proctoring.example.test', 'integrationkey' => 'key'][$name]
        );

        $this->expectException(\moodle_exception::class);
        $client->create_session([]);
    }
}
