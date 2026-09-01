<?php

namespace local_proctoring\adapter;

defined('MOODLE_INTERNAL') || die();

final class seb {
  public static function collect_metadata(): array {
    return [
      'status' => 'unavailable',
      'version' => (string)($_SERVER['HTTP_X_SAFEEXAMBROWSER_VERSION'] ?? ''),
      'configid' => (string)($_SERVER['HTTP_X_SAFEEXAMBROWSER_CONFIG_ID'] ?? ''),
    ];
  }

  public static function validate_signature(array $metadata, string $secret, string $signature): bool {
    $payload = json_encode($metadata, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    return $secret !== '' && $signature !== '' && hash_equals(hash_hmac('sha256', $payload, $secret), $signature);
  }
}
