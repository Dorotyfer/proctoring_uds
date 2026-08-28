CREATE TABLE IF NOT EXISTS proctoring_biometric_monitor_checks (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  client_check_id CHAR(36) NOT NULL,
  profile_version_id CHAR(36) NULL,
  sample_count TINYINT UNSIGNED NOT NULL,
  similarity DECIMAL(5, 4) NULL,
  threshold DECIMAL(5, 4) NOT NULL,
  result VARCHAR(20) NOT NULL,
  alert_event_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY proctoring_biometric_monitor_check_unique (session_id, client_check_id),
  INDEX proctoring_biometric_monitor_checks_session_created_idx (session_id, created_at),
  CONSTRAINT proctoring_biometric_monitor_checks_session_fk
    FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
  CONSTRAINT proctoring_biometric_monitor_checks_profile_version_fk
    FOREIGN KEY (profile_version_id) REFERENCES proctoring_biometric_profile_versions(id),
  CONSTRAINT proctoring_biometric_monitor_checks_result_check
    CHECK (result IN ('matched', 'mismatch', 'unavailable', 'invalid'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
