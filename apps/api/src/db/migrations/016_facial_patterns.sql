CREATE TABLE IF NOT EXISTS proctoring_facial_patterns (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  event_id CHAR(36) NOT NULL UNIQUE,
  category VARCHAR(20) NOT NULL,
  confidence DECIMAL(5, 4) NOT NULL,
  model_version VARCHAR(64) NOT NULL,
  policy_version VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT proctoring_facial_patterns_session_fk
    FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
  CONSTRAINT proctoring_facial_patterns_category_check
    CHECK (category IN ('neutral', 'positive', 'negative', 'uncertain'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
