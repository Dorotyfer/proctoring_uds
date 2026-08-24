ALTER TABLE proctoring_events
  DROP CONSTRAINT proctoring_events_type_check,
  ADD CONSTRAINT proctoring_events_type_check CHECK (type IN (
    'camera_interrupted', 'face_absent', 'multiple_faces', 'face_out_of_frame',
    'identity_check_failed', 'biometric_mismatch', 'liveness_check_failed',
    'page_visibility_changed', 'network_disconnected', 'network_reconnected',
    'seb_event'
  ));

CREATE TABLE IF NOT EXISTS proctoring_biometric_profiles (
  id CHAR(36) PRIMARY KEY,
  moodle_user_id VARCHAR(255) NOT NULL UNIQUE,
  algorithm VARCHAR(64) NOT NULL,
  descriptor_ciphertext LONGBLOB NOT NULL,
  descriptor_length SMALLINT UNSIGNED NOT NULL,
  encryption_iv VARBINARY(16) NOT NULL,
  encryption_tag VARBINARY(16) NOT NULL,
  enrollment_version INT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  consent_version VARCHAR(64) NOT NULL,
  consented_at DATETIME(3) NOT NULL,
  enrolled_at DATETIME(3) NOT NULL,
  last_verified_at DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT proctoring_biometric_profile_status_check CHECK (status IN ('active', 'revoked'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS proctoring_biometric_profiles_status_idx
  ON proctoring_biometric_profiles (status, moodle_user_id);

CREATE TABLE IF NOT EXISTS proctoring_biometric_checks (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL UNIQUE,
  profile_id CHAR(36) NULL,
  moodle_user_id VARCHAR(255) NOT NULL,
  result VARCHAR(20) NOT NULL,
  similarity DECIMAL(8,6) NULL,
  threshold DECIMAL(8,6) NOT NULL,
  sample_count TINYINT UNSIGNED NOT NULL,
  enrollment_version INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT proctoring_biometric_check_session_fk
    FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
  CONSTRAINT proctoring_biometric_check_profile_fk
    FOREIGN KEY (profile_id) REFERENCES proctoring_biometric_profiles(id) ON DELETE SET NULL,
  CONSTRAINT proctoring_biometric_check_result_check CHECK (result IN ('enrolled', 'matched', 'mismatch', 'invalid')),
  CONSTRAINT proctoring_biometric_check_samples_check CHECK (sample_count = 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS proctoring_biometric_checks_user_time_idx
  ON proctoring_biometric_checks (moodle_user_id, created_at);

CREATE TABLE IF NOT EXISTS proctoring_biometric_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  profile_id CHAR(36) NULL,
  session_id CHAR(36) NULL,
  moodle_user_id VARCHAR(255) NOT NULL,
  action VARCHAR(20) NOT NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  metadata JSON NOT NULL,
  CONSTRAINT proctoring_biometric_audit_profile_fk
    FOREIGN KEY (profile_id) REFERENCES proctoring_biometric_profiles(id) ON DELETE SET NULL,
  CONSTRAINT proctoring_biometric_audit_session_fk
    FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE SET NULL,
  CONSTRAINT proctoring_biometric_audit_action_check CHECK (action IN ('enroll', 'verify', 'reset'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS proctoring_biometric_audit_user_time_idx
  ON proctoring_biometric_audit (moodle_user_id, occurred_at);
