<?php

namespace local_proctoring\repository;

defined('MOODLE_INTERNAL') || die();

class evidence_repository {
  private $db;

  public function __construct($db = null) {
    global $DB;
    $this->db = $db ?? $DB;
  }

  public function create(int $sessionid, string $kind, array $filemetadata): \stdClass {
    $record = (object)[
      'sessionid' => $sessionid,
      'eventid' => (int)($filemetadata['eventid'] ?? 0) ?: null,
      'kind' => $kind,
      'component' => $filemetadata['component'] ?? 'local_proctoring',
      'filearea' => $filemetadata['filearea'] ?? 'evidence',
      'itemid' => (int)($filemetadata['itemid'] ?? $sessionid),
      'filepath' => $filemetadata['filepath'] ?? '/',
      'filename' => $filemetadata['filename'] ?? 'capture.bin',
      'mimetype' => $filemetadata['mimetype'] ?? 'application/octet-stream',
      'filesize' => (int)($filemetadata['filesize'] ?? 0),
      'sha256' => $filemetadata['sha256'] ?? '',
      'encryptioniv' => $filemetadata['encryptioniv'] ?? '',
      'encryptiontag' => $filemetadata['encryptiontag'] ?? '',
      'expiresat' => (int)($filemetadata['expiresat'] ?? (time() + 2592000)),
      'timecreated' => time(),
    ];
    $id = $this->db->insert_record('local_proctoring_evidence', $record);
    return $this->db->get_record('local_proctoring_evidence', ['id' => $id], '*', MUST_EXIST);
  }

  public function find_by_session(int $sessionid, bool $include_deleted = false): array {
    $conditions = ['sessionid' => $sessionid];
    if (!$include_deleted) {
      $conditions['deletedat'] = 0;
    }
    return array_values($this->db->get_records('local_proctoring_evidence', $conditions, 'timecreated ASC, id ASC'));
  }

  public function find(int $evidenceid): ?\stdClass {
    $record = $this->db->get_record('local_proctoring_evidence', ['id' => $evidenceid]);
    return $record ?: null;
  }

  public function find_by_file(int $sessionid, string $filename): ?\stdClass {
    $records = $this->db->get_records('local_proctoring_evidence', [
      'sessionid' => $sessionid,
      'filename' => $filename,
    ], 'id DESC', '*', 0, 1);
    $record = reset($records);
    return $record ?: null;
  }

  public function mark_deleted(int $evidenceid): void {
    $record = $this->db->get_record('local_proctoring_evidence', ['id' => $evidenceid], 'id', MUST_EXIST);
    $record->deletedat = time();
    $this->db->update_record('local_proctoring_evidence', $record);
  }
}
