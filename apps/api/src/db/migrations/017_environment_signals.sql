CREATE TABLE IF NOT EXISTS proctoring_environment_signals (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  event_id CHAR(36) NOT NULL UNIQUE,
  object_type VARCHAR(64) NOT NULL,
  object_count TINYINT UNSIGNED NOT NULL,
  confidence DECIMAL(5, 4) NOT NULL,
  box_json JSON NOT NULL,
  model_version VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT proctoring_environment_signals_session_fk
    FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
