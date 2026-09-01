<?php

namespace local_proctoring\service;

use local_proctoring\repository\biometric_repository;

defined('MOODLE_INTERNAL') || die();

final class biometric_service {
  private $db;
  private $crypto;
  private $repository;
  private $events;

  public function __construct($db = null, ?crypto_service $crypto = null, ?biometric_repository $repository = null, ?event_service $events = null) {
    global $DB;
    $this->db = $db ?? $DB;
    $this->crypto = $crypto ?? new crypto_service();
    $this->repository = $repository ?? new biometric_repository($this->db);
    $this->events = $events;
  }

  public function enroll(int $userid, array $samples): array {
    $descriptor = $this->average_descriptor($samples);
    $profile = $this->repository->find_profile_by_user($userid) ?: $this->repository->create_profile($userid, 'biometric-v1');
    $version = $this->repository->next_version((int)$profile->id);
    $encrypted = $this->crypto->encrypt(json_encode($descriptor, JSON_THROW_ON_ERROR));
    $stored = $this->repository->create_version((int)$profile->id, [
      'version' => $version,
      'algorithm' => 'cosine-v1',
      'descriptorciphertext' => $encrypted['ciphertext'],
      'descriptorlength' => count($descriptor),
      'encryptioniv' => $encrypted['iv'],
      'encryptiontag' => $encrypted['tag'],
      'consentversion' => 'biometric-v1',
      'consentedat' => time(),
    ]);
    return [
      'profileid' => (int)$profile->id,
      'profileversionid' => (int)$stored->id,
      'version' => (int)$stored->version,
      'status' => 'enrolled',
    ];
  }

  public function check(int $sessionid, array $samples): array {
    $session = $this->db->get_record('local_proctoring_session', ['id' => $sessionid], '*', MUST_EXIST);
    $profile = $this->repository->find_profile_by_user((int)$session->userid);
    $descriptor = $this->average_descriptor($samples);
    $threshold = (float)(get_config('local_proctoring', 'biometricthreshold') ?: 0.5);
    $result = 'invalid';
    $similarity = null;
    $version = null;
    if ($profile && $profile->status === 'active') {
      $version = $this->repository->find_active_version($profile);
      if ($version) {
        $reference = json_decode($this->crypto->decrypt([
          'ciphertext' => $version->descriptorciphertext,
          'iv' => $version->encryptioniv,
          'tag' => $version->encryptiontag,
        ]), true, 512, JSON_THROW_ON_ERROR);
        $similarity = $this->cosine_similarity($reference, $descriptor);
        $result = $similarity >= $threshold ? 'matched' : 'mismatch';
      }
    }
    $check = $this->repository->create_check($sessionid, [
      'profileid' => $profile->id ?? null,
      'profileversionid' => $version->id ?? null,
      'userid' => $session->userid,
      'result' => $result,
      'similarity' => $similarity,
      'threshold' => $threshold,
      'samplecount' => count($samples),
      'enrollmentversion' => (int)($version->version ?? 0),
    ]);
    if ($result === 'mismatch' && $this->events) {
      $this->events->record_batch((int)$session->attemptid, [[
        'clienteventid' => 'biometric-check-' . $check->id,
        'type' => 'biometric_mismatch',
        'occurredat' => time(),
        'metadata' => ['similarity' => $similarity, 'threshold' => $threshold],
      ]]);
    }
    return [
      'id' => (int)$check->id,
      'result' => $result,
      'similarity' => $similarity,
      'threshold' => $threshold,
      'profileversionid' => (int)($version->id ?? 0),
    ];
  }

  private function average_descriptor(array $samples): array {
    if (count($samples) !== 3 || !is_array($samples[0])) {
      throw new \invalid_parameter_exception('Exactly three biometric samples are required.');
    }
    $length = count($samples[0]);
    if ($length < 8 || $length > 1024) {
      throw new \invalid_parameter_exception('Invalid biometric descriptor length.');
    }
    $average = array_fill(0, $length, 0.0);
    foreach ($samples as $sample) {
      if (!is_array($sample) || count($sample) !== $length) {
        throw new \invalid_parameter_exception('Biometric samples must have equal dimensions.');
      }
      foreach ($sample as $index => $value) {
        if (!is_numeric($value)) {
          throw new \invalid_parameter_exception('Biometric descriptors must be numeric.');
        }
        $average[$index] += (float)$value / 3;
      }
    }
    return $average;
  }

  private function cosine_similarity(array $left, array $right): float {
    if (count($left) !== count($right)) {
      return 0.0;
    }
    $dot = 0.0;
    $leftnorm = 0.0;
    $rightnorm = 0.0;
    foreach ($left as $index => $value) {
      $leftvalue = (float)$value;
      $rightvalue = (float)$right[$index];
      $dot += $leftvalue * $rightvalue;
      $leftnorm += $leftvalue ** 2;
      $rightnorm += $rightvalue ** 2;
    }
    if ($leftnorm === 0.0 || $rightnorm === 0.0) {
      return 0.0;
    }
    return $dot / (sqrt($leftnorm) * sqrt($rightnorm));
  }
}
