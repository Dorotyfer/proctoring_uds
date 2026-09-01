<?php

namespace local_proctoring\repository;

defined('MOODLE_INTERNAL') || die();

class biometric_repository {
  private $db;

  public function __construct($db = null) {
    global $DB;
    $this->db = $db ?? $DB;
  }

  public function find_profile_by_user(int $userid): ?\stdClass {
    $record = $this->db->get_record('local_proctoring_biometric', ['userid' => $userid]);
    return $record ?: null;
  }

  public function find_version(int $versionid): ?\stdClass {
    $record = $this->db->get_record('local_proctoring_biover', ['id' => $versionid]);
    return $record ?: null;
  }

  public function find_active_version(\stdClass $profile): ?\stdClass {
    if (!empty($profile->activeversionid)) {
      return $this->find_version((int)$profile->activeversionid);
    }
    $record = $this->db->get_record('local_proctoring_biover', [
      'profileid' => $profile->id,
      'status' => 'active',
    ], 'id, profileid, version, algorithm, descriptorciphertext, descriptorlength, encryptioniv, encryptiontag, consentversion, consentedat, enrolledat, revokedat, status, timecreated');
    return $record ?: null;
  }

  public function next_version(int $profileid): int {
    $records = $this->db->get_records('local_proctoring_biover', ['profileid' => $profileid], 'version DESC', 'version', 0, 1);
    $record = reset($records);
    return $record ? ((int)$record->version + 1) : 1;
  }

  public function create_profile(int $userid, string $consentversion): \stdClass {
    $record = (object)[
      'userid' => $userid,
      'status' => 'active',
      'consentversion' => $consentversion,
      'consentedat' => time(),
      'timecreated' => time(),
      'timemodified' => time(),
    ];
    $id = $this->db->insert_record('local_proctoring_biometric', $record);
    return $this->db->get_record('local_proctoring_biometric', ['id' => $id], '*', MUST_EXIST);
  }

  public function create_version(int $profileid, array $descriptor): \stdClass {
    $record = (object)[
      'profileid' => $profileid,
      'version' => (int)$descriptor['version'],
      'algorithm' => $descriptor['algorithm'],
      'descriptorciphertext' => $descriptor['descriptorciphertext'],
      'descriptorlength' => (int)$descriptor['descriptorlength'],
      'encryptioniv' => $descriptor['encryptioniv'],
      'encryptiontag' => $descriptor['encryptiontag'],
      'consentversion' => $descriptor['consentversion'],
      'consentedat' => (int)$descriptor['consentedat'],
      'enrolledat' => time(),
      'status' => 'active',
      'timecreated' => time(),
    ];
    $id = $this->db->insert_record('local_proctoring_biover', $record);
    $profile = $this->db->get_record('local_proctoring_biometric', ['id' => $profileid], '*', MUST_EXIST);
    $profile->activeversionid = $id;
    $profile->timemodified = time();
    $this->db->update_record('local_proctoring_biometric', $profile);
    return $this->db->get_record('local_proctoring_biover', ['id' => $id], '*', MUST_EXIST);
  }

  public function create_check(int $sessionid, array $check): \stdClass {
    $record = (object)[
      'sessionid' => $sessionid,
      'profileid' => (int)($check['profileid'] ?? 0) ?: null,
      'profileversionid' => (int)($check['profileversionid'] ?? 0) ?: null,
      'userid' => (int)$check['userid'],
      'result' => $check['result'],
      'similarity' => $check['similarity'] ?? null,
      'threshold' => $check['threshold'],
      'samplecount' => (int)$check['samplecount'],
      'enrollmentversion' => (int)$check['enrollmentversion'],
      'timecreated' => time(),
    ];
    $id = $this->db->insert_record('local_proctoring_biocheck', $record);
    return $this->db->get_record('local_proctoring_biocheck', ['id' => $id], '*', MUST_EXIST);
  }
}
