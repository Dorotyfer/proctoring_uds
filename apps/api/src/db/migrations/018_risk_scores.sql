CREATE TABLE IF NOT EXISTS proctoring_risk_scores (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  score TINYINT UNSIGNED NOT NULL,
  category VARCHAR(20) NOT NULL,
  policy_version VARCHAR(64) NOT NULL,
  factors_json JSON NOT NULL,
  calculated_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX proctoring_risk_scores_session_calculated_idx (session_id, calculated_at),
  CONSTRAINT proctoring_risk_scores_session_fk
    FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
  CONSTRAINT proctoring_risk_scores_score_check CHECK (score BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
