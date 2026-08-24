CREATE TABLE IF NOT EXISTS proctoring_liveness_challenges (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  steps JSON NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT proctoring_liveness_challenges_session_fk
    FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
  CONSTRAINT proctoring_liveness_challenges_expiry_check CHECK (expires_at > created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS proctoring_liveness_challenges_session_idx
  ON proctoring_liveness_challenges (session_id, expires_at, used_at);

CREATE TABLE IF NOT EXISTS proctoring_analysis_jobs (
  id CHAR(36) PRIMARY KEY,
  analysis_id CHAR(36) NOT NULL,
  session_id CHAR(36) NOT NULL,
  type VARCHAR(20) NOT NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'queued',
  attempt_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  lease_owner_token CHAR(36) NULL,
  lease_expires_at DATETIME(3) NULL,
  result JSON NULL,
  last_error_code VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  started_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  CONSTRAINT proctoring_analysis_jobs_session_fk
    FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
  CONSTRAINT proctoring_analysis_jobs_type_check CHECK (type IN ('preparation', 'monitoring')),
  CONSTRAINT proctoring_analysis_jobs_state_check CHECK (state IN ('queued', 'processing', 'completed', 'failed', 'expired')),
  CONSTRAINT proctoring_analysis_jobs_attempt_count_check CHECK (attempt_count <= 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE UNIQUE INDEX IF NOT EXISTS proctoring_analysis_jobs_session_analysis_unique
  ON proctoring_analysis_jobs (session_id, analysis_id);

CREATE INDEX IF NOT EXISTS proctoring_analysis_jobs_claim_idx
  ON proctoring_analysis_jobs (state, available_at, created_at);
CREATE INDEX IF NOT EXISTS proctoring_analysis_jobs_session_type_idx
  ON proctoring_analysis_jobs (session_id, type, state, created_at);
CREATE INDEX IF NOT EXISTS proctoring_analysis_jobs_lease_idx
  ON proctoring_analysis_jobs (state, lease_expires_at);

CREATE TABLE IF NOT EXISTS proctoring_analysis_frames (
  id CHAR(36) PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  frame_order TINYINT UNSIGNED NOT NULL,
  object_key VARCHAR(768) NOT NULL UNIQUE,
  encryption_iv VARBINARY(16) NOT NULL,
  encryption_tag VARBINARY(16) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  byte_size INT UNSIGNED NOT NULL,
  width SMALLINT UNSIGNED NOT NULL,
  height SMALLINT UNSIGNED NOT NULL,
  cleanup_state VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY proctoring_analysis_frames_job_order_unique (job_id, frame_order),
  CONSTRAINT proctoring_analysis_frames_job_fk
    FOREIGN KEY (job_id) REFERENCES proctoring_analysis_jobs(id) ON DELETE CASCADE,
  CONSTRAINT proctoring_analysis_frames_cleanup_check CHECK (cleanup_state IN ('pending', 'retained', 'deleted')),
  CONSTRAINT proctoring_analysis_frames_dimensions_check CHECK (width BETWEEN 320 AND 1280 AND height BETWEEN 240 AND 720),
  CONSTRAINT proctoring_analysis_frames_size_check CHECK (byte_size BETWEEN 1 AND 204800)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS proctoring_model_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  job_id CHAR(36) NULL,
  model_name VARCHAR(128) NOT NULL,
  model_version VARCHAR(128) NOT NULL,
  action VARCHAR(32) NOT NULL,
  detector_name VARCHAR(128) NOT NULL,
  detector_version VARCHAR(128) NOT NULL,
  metric_name VARCHAR(64) NOT NULL,
  threshold DECIMAL(10,6) NULL,
  latency_ms INT UNSIGNED NULL,
  outcome VARCHAR(32) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT proctoring_model_audit_job_fk
    FOREIGN KEY (job_id) REFERENCES proctoring_analysis_jobs(id) ON DELETE SET NULL,
  CONSTRAINT proctoring_model_audit_action_check CHECK (action IN ('claimed', 'completed', 'failed', 'profile_enrolled', 'profile_checked'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS proctoring_sface_profiles (
  id CHAR(36) PRIMARY KEY,
  legacy_profile_id CHAR(36) NULL UNIQUE,
  moodle_user_id VARCHAR(255) NOT NULL,
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
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  active_moodle_user_id VARCHAR(255) AS (IF(status = 'active' AND algorithm = 'SFace', moodle_user_id, NULL)) STORED,
  UNIQUE KEY proctoring_sface_profiles_one_active_user (active_moodle_user_id),
  CONSTRAINT proctoring_sface_profiles_status_check CHECK (status IN ('active', 'revoked')),
  CONSTRAINT proctoring_sface_profiles_algorithm_check CHECK (algorithm IN ('SFace', 'Human')),
  CONSTRAINT proctoring_sface_profiles_active_algorithm_check CHECK (status <> 'active' OR algorithm = 'SFace')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS proctoring_sface_profiles_user_history_idx
  ON proctoring_sface_profiles (moodle_user_id, enrolled_at);

CREATE TABLE IF NOT EXISTS proctoring_sface_checks (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  profile_id CHAR(36) NULL,
  job_id CHAR(36) NULL,
  result VARCHAR(20) NOT NULL,
  similarity DECIMAL(8,6) NULL,
  threshold DECIMAL(8,6) NOT NULL,
  enrollment_version INT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT proctoring_sface_checks_session_fk FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
  CONSTRAINT proctoring_sface_checks_profile_fk FOREIGN KEY (profile_id) REFERENCES proctoring_sface_profiles(id) ON DELETE SET NULL,
  CONSTRAINT proctoring_sface_checks_job_fk FOREIGN KEY (job_id) REFERENCES proctoring_analysis_jobs(id) ON DELETE SET NULL,
  CONSTRAINT proctoring_sface_checks_result_check CHECK (result IN ('enrolled', 'matched', 'mismatch', 'invalid'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS proctoring_sface_checks_session_time_idx
  ON proctoring_sface_checks (session_id, created_at);

INSERT INTO proctoring_sface_profiles (
  id, legacy_profile_id, moodle_user_id, algorithm, descriptor_ciphertext, descriptor_length,
  encryption_iv, encryption_tag, enrollment_version, status, consent_version, consented_at,
  enrolled_at, revoked_at, created_at
)
SELECT
  legacy.id, legacy.id, legacy.moodle_user_id, legacy.algorithm, legacy.descriptor_ciphertext, legacy.descriptor_length,
  legacy.encryption_iv, legacy.encryption_tag, legacy.enrollment_version, 'revoked', legacy.consent_version,
  legacy.consented_at, legacy.enrolled_at, COALESCE(legacy.revoked_at, UTC_TIMESTAMP(3)), legacy.created_at
FROM proctoring_biometric_profiles legacy
WHERE NOT EXISTS (
  SELECT 1 FROM proctoring_sface_profiles history WHERE history.legacy_profile_id = legacy.id
);
