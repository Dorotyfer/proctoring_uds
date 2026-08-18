<?php
// This file is part of Moodle - http://moodle.org/.

namespace local_proctoring;

defined('MOODLE_INTERNAL') || die();

/** Server-to-server client for the proctoring session API. */
final class api_client {
    /** @var callable */
    private $curlfactory;
    /** @var callable */
    private $configprovider;
    /** @var callable */
    private $correlationidgenerator;

    public function __construct(?callable $curlfactory = null, ?callable $configprovider = null,
            ?callable $correlationidgenerator = null) {
        $this->curlfactory = $curlfactory ?? static function(): \curl {
            return new \curl();
        };
        $this->configprovider = $configprovider ?? static function(string $name): string {
            return (string)get_config('local_proctoring', $name);
        };
        $this->correlationidgenerator = $correlationidgenerator ?? static function(): string {
            return bin2hex(random_bytes(16));
        };
    }

    /**
     * Creates a proctoring session. The integration key remains on Moodle's server.
     *
     * @param array $payload API session payload.
     * @return array API response.
     * @throws \moodle_exception When the API cannot create a valid session.
     */
    public function create_session(array $payload): array {
        $apiurl = rtrim(($this->configprovider)('apiurl'), '/');
        $integrationkey = ($this->configprovider)('integrationkey');
        if ($apiurl === '' || $integrationkey === '' || parse_url($apiurl, PHP_URL_SCHEME) !== 'https') {
            throw new \moodle_exception('configurationerror', 'local_proctoring');
        }

        $correlationid = ($this->correlationidgenerator)();
        $curl = ($this->curlfactory)();
        $curl->setopt([
            'CURLOPT_CONNECTTIMEOUT' => 5,
            'CURLOPT_TIMEOUT' => 5,
            'CURLOPT_SSL_VERIFYPEER' => true,
            'CURLOPT_SSL_VERIFYHOST' => 2,
        ]);
        $curl->setHeader('Content-Type: application/json');
        $curl->setHeader('Accept: application/json');
        $curl->setHeader('X-Moodle-Integration-Key: ' . $integrationkey);
        $curl->setHeader('X-Correlation-ID: ' . $correlationid);

        try {
            $response = $curl->post($apiurl . '/v1/internal/sessions', json_encode($payload, JSON_THROW_ON_ERROR));
        } catch (\Throwable $exception) {
            throw new \moodle_exception('sessioncreationfailed', 'local_proctoring', '', null, $exception->getMessage());
        }

        $curlinfo = $curl->get_info();
        if ($curl->get_errno() || !is_array($curlinfo) || ($curlinfo['http_code'] ?? 0) !== 201) {
            throw new \moodle_exception('sessioncreationfailed', 'local_proctoring');
        }

        try {
            $decoded = json_decode($response, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException $exception) {
            throw new \moodle_exception('sessioncreationfailed', 'local_proctoring', '', null, $exception->getMessage());
        }
        if (!isset($decoded['session']['id'], $decoded['session']['expiresAt'], $decoded['browserToken']) ||
                !is_string($decoded['session']['id']) || !is_string($decoded['session']['expiresAt']) ||
                !is_string($decoded['browserToken'])) {
            throw new \moodle_exception('sessioncreationfailed', 'local_proctoring');
        }

        return $decoded;
    }
}
