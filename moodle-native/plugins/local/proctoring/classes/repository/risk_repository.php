<?php

namespace local_proctoring\repository;

defined('MOODLE_INTERNAL') || die();

class risk_repository {
  private $db;

  public function __construct($db = null) {
    global $DB;
    $this->db = $db ?? $DB;
  }

  public function create(int $sessionid, array $risk, string $policyversion): \stdClass {
    $record = (object)[
      'sessionid' => $sessionid,
      'score' => max(0, min(100, (int)$risk['score'])),
      'category' => $risk['category'],
      'policyversion' => $policyversion,
      'factorsjson' => json_encode($risk['factors'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
      'calculatedat' => (int)($risk['calculatedat'] ?? time()),
      'timecreated' => time(),
    ];
    $id = $this->db->insert_record('local_proctoring_riskscore', $record);
    return $this->db->get_record('local_proctoring_riskscore', ['id' => $id], '*', MUST_EXIST);
  }

  public function latest(int $sessionid): ?\stdClass {
    $record = $this->db->get_record_sql(
      'SELECT * FROM {local_proctoring_riskscore} WHERE sessionid = ? ORDER BY calculatedat DESC, id DESC',
      [$sessionid]
    );
    return $record ?: null;
  }
}
