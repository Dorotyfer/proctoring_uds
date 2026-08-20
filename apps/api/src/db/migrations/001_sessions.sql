CREATE TABLE IF NOT EXISTS proctoring_sessions (
  id CHAR(36) PRIMARY KEY,
  moodle_user_id VARCHAR(255) NOT NULL,
  moodle_course_id VARCHAR(255) NOT NULL,
  moodle_quiz_id VARCHAR(255) NOT NULL,
  moodle_attempt_id VARCHAR(255) NOT NULL UNIQUE,
  device_mode VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  issued_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT proctoring_sessions_device_mode_check CHECK (device_mode IN ('browser', 'seb')),
  CONSTRAINT proctoring_sessions_status_check CHECK (status IN ('pending', 'active', 'completed', 'expired')),
  CONSTRAINT proctoring_sessions_expiry_check CHECK (expires_at > issued_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS proctoring_sessions_course_id_idx ON proctoring_sessions (moodle_course_id);
