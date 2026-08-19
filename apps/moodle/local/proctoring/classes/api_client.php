<?php

namespace local_proctoring;

defined('MOODLE_INTERNAL') || die();

class api_client {
    public function create_session(array $payload): array {
        $decoded = $this->request('/v1/internal/sessions', $payload);

        if (empty($decoded['session']['id'])) {
            throw new \moodle_exception('apiunavailable', 'local_proctoring');
        }

        return $decoded;
    }

    public function issue_browser_token(string $sessionid): string {
        $decoded = $this->request(
            '/v1/internal/sessions/' . rawurlencode($sessionid) . '/browser-token',
            []
        );

        if (empty($decoded['browserToken'])) {
            throw new \moodle_exception('apiunavailable', 'local_proctoring');
        }

        return $decoded['browserToken'];
    }

    public function complete_session(string $sessionid): void {
        $this->request(
            '/v1/internal/sessions/' . rawurlencode($sessionid) . '/complete',
            []
        );
    }

    private function request(string $path, array $payload): array {
        $apiurl = rtrim((string)get_config('local_proctoring', 'apiurl'), '/');
        $integrationkey = (string)get_config('local_proctoring', 'integrationkey');

        if (empty($apiurl) || empty($integrationkey)) {
            throw new \moodle_exception('apiunavailable', 'local_proctoring');
        }

        $curl = new \curl();
        $curl->setopt([
            'CURLOPT_TIMEOUT' => 5,
            'CURLOPT_CONNECTTIMEOUT' => 5,
            'CURLOPT_SSL_VERIFYPEER' => true,
            'CURLOPT_HTTPHEADER' => [
                'Content-Type: application/json',
                'X-Moodle-Integration-Key: ' . $integrationkey,
                'X-Correlation-ID: ' . \core\session\manager::get_session_id()
            ]
        ]);

        $response = $curl->post($apiurl . $path, json_encode($payload));
        $info = $curl->get_info();
        $decoded = json_decode($response, true);

        if ($info['http_code'] < 200 || $info['http_code'] >= 300 || !is_array($decoded)) {
            throw new \moodle_exception('apiunavailable', 'local_proctoring');
        }

        return $decoded;
    }
}
