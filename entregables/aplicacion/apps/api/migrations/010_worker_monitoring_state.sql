ALTER TABLE proctoring_events
  DROP CONSTRAINT proctoring_events_type_check,
  ADD CONSTRAINT proctoring_events_type_check CHECK (type IN (
    'camera_interrupted', 'face_absent', 'multiple_faces', 'face_out_of_frame',
    'identity_check_failed', 'biometric_mismatch', 'liveness_check_failed',
    'page_visibility_changed', 'network_disconnected', 'network_reconnected',
    'seb_event', 'biometric_monitor_mismatch', 'environment_intrusion',
    'analysis_unavailable'
  ));

ALTER TABLE proctoring_analysis_jobs
  ADD COLUMN IF NOT EXISTS challenge_id CHAR(36) NULL,
  ADD CONSTRAINT proctoring_analysis_jobs_challenge_fk
    FOREIGN KEY (challenge_id) REFERENCES proctoring_liveness_challenges(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS proctoring_monitoring_state (
  session_id CHAR(36) PRIMARY KEY,
  last_sface_check_at DATETIME(3) NULL,
  last_interval_evidence_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT proctoring_monitoring_state_session_fk
    FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS proctoring_monitoring_observations (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  anomalies JSON NOT NULL,
  observed_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT proctoring_monitoring_observations_session_fk
    FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS proctoring_monitoring_observations_window_idx
  ON proctoring_monitoring_observations (session_id, observed_at, id);

CREATE TABLE IF NOT EXISTS proctoring_sface_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  profile_id CHAR(36) NULL,
  session_id CHAR(36) NULL,
  job_id CHAR(36) NULL,
  moodle_user_id VARCHAR(255) NOT NULL,
  action VARCHAR(20) NOT NULL,
  metadata JSON NOT NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT proctoring_sface_audit_profile_fk
    FOREIGN KEY (profile_id) REFERENCES proctoring_sface_profiles(id) ON DELETE SET NULL,
  CONSTRAINT proctoring_sface_audit_session_fk
    FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE SET NULL,
  CONSTRAINT proctoring_sface_audit_job_fk
    FOREIGN KEY (job_id) REFERENCES proctoring_analysis_jobs(id) ON DELETE SET NULL,
  CONSTRAINT proctoring_sface_audit_action_check CHECK (action IN ('enroll', 'verify'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS proctoring_sface_audit_user_time_idx
  ON proctoring_sface_audit (moodle_user_id, occurred_at);
