CREATE TABLE IF NOT EXISTS proctoring_evidence (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  kind VARCHAR(20) NOT NULL,
  object_key VARCHAR(768) NOT NULL UNIQUE,
  content_type VARCHAR(255) NOT NULL,
  byte_size INT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  encryption_iv BLOB NOT NULL,
  encryption_tag BLOB NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,
  CONSTRAINT proctoring_evidence_session_fk
    FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
  CONSTRAINT proctoring_evidence_kind_check CHECK (kind IN ('identity', 'interval', 'alert')),
  CONSTRAINT proctoring_evidence_size_check CHECK (byte_size > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS proctoring_evidence_session_created_idx
  ON proctoring_evidence (deleted_at, session_id, created_at);
CREATE INDEX IF NOT EXISTS proctoring_evidence_retention_idx
  ON proctoring_evidence (deleted_at, expires_at);

ALTER TABLE proctoring_sessions
  ADD COLUMN IF NOT EXISTS reference_evidence_id CHAR(36) NULL;

ALTER TABLE proctoring_alerts
  ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS review_note TEXT NULL;

CREATE TABLE IF NOT EXISTS proctoring_evidence_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  evidence_id CHAR(36) NOT NULL,
  actor_moodle_user_id VARCHAR(255) NOT NULL,
  action VARCHAR(32) NOT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT proctoring_evidence_audit_evidence_fk
    FOREIGN KEY (evidence_id) REFERENCES proctoring_evidence(id),
  CONSTRAINT proctoring_evidence_audit_action_check
    CHECK (action IN ('view', 'download', 'delete', 'retention_delete'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS proctoring_evidence_audit_evidence_time_idx
  ON proctoring_evidence_audit (evidence_id, occurred_at);
