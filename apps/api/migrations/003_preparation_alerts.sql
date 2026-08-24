ALTER TABLE proctoring_sessions
  ADD COLUMN IF NOT EXISTS prepared_at DATETIME(3) NULL,
  ADD COLUMN IF NOT EXISTS reference_capture_ciphertext BLOB NULL,
  ADD COLUMN IF NOT EXISTS reference_capture_iv BLOB NULL,
  ADD COLUMN IF NOT EXISTS reference_capture_tag BLOB NULL,
  ADD COLUMN IF NOT EXISTS reference_capture_hash CHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS liveness_challenge JSON NULL;

CREATE TABLE IF NOT EXISTS proctoring_alerts (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  event_id CHAR(36) NOT NULL UNIQUE,
  type VARCHAR(64) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reviewed_at DATETIME(3) NULL,
  CONSTRAINT proctoring_alerts_session_fk
    FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
  CONSTRAINT proctoring_alerts_event_fk
    FOREIGN KEY (event_id) REFERENCES proctoring_events(id) ON DELETE CASCADE,
  CONSTRAINT proctoring_alerts_severity_check CHECK (severity IN ('low', 'medium', 'high')),
  CONSTRAINT proctoring_alerts_status_check CHECK (status IN ('open', 'reviewed', 'dismissed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS proctoring_alerts_session_status_idx ON proctoring_alerts (session_id, status, created_at);
