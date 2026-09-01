<?php

namespace local_proctoring\service;

use local_proctoring\repository\evidence_repository;

defined('MOODLE_INTERNAL') || die();

final class evidence_service {
  private const MAX_BYTES = 200 * 1024;
  private $db;
  private $crypto;
  private $files;
  private $repository;

  public function __construct($db = null, ?crypto_service $crypto = null, $files = null, ?evidence_repository $repository = null) {
    global $DB;
    $this->db = $db ?? $DB;
    $this->crypto = $crypto ?? new crypto_service();
    $this->files = $files ?? \get_file_storage();
    $this->repository = $repository ?? new evidence_repository($this->db);
  }

  public function store(int $sessionid, string $kind, string $jpeg, array $metadata = []): \stored_file {
    $plaintext = $this->decode_jpeg($jpeg);
    $encrypted = $this->crypto->encrypt($plaintext);
    $filename = 'capture-' . $encrypted['hash'] . '.bin';
    $fileinfo = [
      'contextid' => \context_system::instance()->id,
      'component' => 'local_proctoring',
      'filearea' => 'evidence',
      'itemid' => $sessionid,
      'filepath' => '/',
      'filename' => $filename,
      'userid' => 0,
      'mimetype' => 'application/octet-stream',
    ];
    $file = $this->files->create_file_from_string($fileinfo, $encrypted['ciphertext']);
    $this->repository->create($sessionid, $kind, [
      'eventid' => $metadata['eventid'] ?? null,
      'component' => 'local_proctoring',
      'filearea' => 'evidence',
      'itemid' => $sessionid,
      'filepath' => '/',
      'filename' => $filename,
      'mimetype' => 'image/jpeg',
      'filesize' => $encrypted['size'],
      'sha256' => $encrypted['hash'],
      'encryptioniv' => $encrypted['iv'],
      'encryptiontag' => $encrypted['tag'],
      'expiresat' => (int)($metadata['expiresat'] ?? (time() + ((int)get_config('local_proctoring', 'retentiondays') ?: 30) * DAYSECS)),
    ]);
    return $file;
  }

  public function metadata_for_file(int $sessionid, string $filename): ?\stdClass {
    return $this->repository->find_by_file($sessionid, $filename);
  }

  public function authorize(int $userid, int $sessionid, int $evidenceid): \stored_file {
    $evidence = $this->repository->find($evidenceid);
    $session = $this->db->get_record('local_proctoring_session', ['id' => $sessionid]);
    if (!$evidence || !$session || (int)$evidence->sessionid !== $sessionid) {
      throw new \moodle_exception('evidencenotfound', 'local_proctoring');
    }
    $context = \context_system::instance();
    $reviewer = \has_capability('local/proctoring:viewbiometricevidence', $context, $userid);
    if ((int)$session->userid !== $userid && !$reviewer) {
      throw new \moodle_exception('evidenceaccessdenied', 'local_proctoring');
    }
    $file = $this->files->get_file($context->id, 'local_proctoring', $evidence->filearea, $evidence->itemid, $evidence->filepath, $evidence->filename);
    if (!$file) {
      throw new \moodle_exception('evidencenotfound', 'local_proctoring');
    }
    return $file;
  }

  public function read_authorized(int $userid, int $sessionid, int $evidenceid): array {
    $evidence = $this->repository->find($evidenceid);
    $file = $this->authorize($userid, $sessionid, $evidenceid);
    $plaintext = $this->crypto->decrypt([
      'ciphertext' => $file->get_content(),
      'iv' => $evidence->encryptioniv,
      'tag' => $evidence->encryptiontag,
    ]);
    return ['content' => $plaintext, 'filename' => 'capture.jpg', 'mimetype' => 'image/jpeg'];
  }

  private function decode_jpeg(string $jpeg): string {
    $prefix = 'data:image/jpeg;base64,';
    if (str_starts_with($jpeg, $prefix)) {
      $jpeg = base64_decode(substr($jpeg, strlen($prefix)), true);
    }
    if ($jpeg === false || strlen($jpeg) > self::MAX_BYTES || strlen($jpeg) < 4 || substr($jpeg, 0, 2) !== "\xFF\xD8" || substr($jpeg, -2) !== "\xFF\xD9") {
      if (is_string($jpeg) && strlen($jpeg) > self::MAX_BYTES) {
        throw new \moodle_exception('capturetoolarge', 'local_proctoring');
      }
      throw new \moodle_exception('invalidcapture', 'local_proctoring');
    }
    return $jpeg;
  }
}
