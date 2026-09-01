<?php

namespace local_proctoring\adapter;

defined('MOODLE_INTERNAL') || die();

final class extension {
  public static function validate(array $payload, int $sessionid, string $secret): bool {
    if ((int)($payload['sessionid'] ?? 0) !== $sessionid || empty($payload['nonce']) || empty($payload['signature'])) {
      return false;
    }
    $expected = hash_hmac('sha256', $sessionid . ':' . $payload['nonce'], $secret);
    return hash_equals($expected, (string)$payload['signature']);
  }
}
