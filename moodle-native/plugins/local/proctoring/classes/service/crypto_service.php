<?php

namespace local_proctoring\service;

defined('MOODLE_INTERNAL') || die();

final class crypto_service {
  private const CIPHER = 'aes-256-gcm';
  private const IV_LENGTH = 12;
  private const TAG_LENGTH = 16;
  private $key;

  public function __construct(?string $base64key = null) {
    $base64key = $base64key ?? (string)get_config('local_proctoring', 'encryptionkey');
    $key = base64_decode($base64key, true);
    if ($key === false || strlen($key) !== 32) {
      throw new \moodle_exception('invalidencryptionkey', 'local_proctoring');
    }
    $this->key = $key;
  }

  public function encrypt(string $plaintext): array {
    $iv = random_bytes(self::IV_LENGTH);
    $tag = '';
    $ciphertext = openssl_encrypt($plaintext, self::CIPHER, $this->key, OPENSSL_RAW_DATA, $iv, $tag, '', self::TAG_LENGTH);
    if ($ciphertext === false || strlen($tag) !== self::TAG_LENGTH) {
      throw new \moodle_exception('encryptionfailed', 'local_proctoring');
    }
    return [
      'ciphertext' => base64_encode($ciphertext),
      'iv' => base64_encode($iv),
      'tag' => base64_encode($tag),
      'hash' => hash('sha256', $plaintext),
      'size' => strlen($plaintext),
    ];
  }

  public function decrypt(array $encrypted): string {
    $ciphertext = base64_decode((string)($encrypted['ciphertext'] ?? ''), true);
    $iv = base64_decode((string)($encrypted['iv'] ?? ''), true);
    $tag = base64_decode((string)($encrypted['tag'] ?? ''), true);
    if ($ciphertext === false || $iv === false || $tag === false || strlen($iv) !== self::IV_LENGTH || strlen($tag) !== self::TAG_LENGTH) {
      throw new \moodle_exception('decryptionfailed', 'local_proctoring');
    }
    $plaintext = openssl_decrypt($ciphertext, self::CIPHER, $this->key, OPENSSL_RAW_DATA, $iv, $tag, '');
    if ($plaintext === false) {
      throw new \moodle_exception('decryptionfailed', 'local_proctoring');
    }
    return $plaintext;
  }
}
