CREATE TABLE proctoring_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  moodle_user_id VARCHAR(255) NOT NULL,
  moodle_course_id VARCHAR(255) NOT NULL,
  moodle_quiz_id VARCHAR(255) NOT NULL,
  moodle_attempt_id VARCHAR(255) NOT NULL,
  device_mode ENUM('browser', 'seb') NOT NULL,
  status ENUM('created', 'active', 'completed', 'expired') NOT NULL,
  issued_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  CHECK (expires_at > issued_at)
) ENGINE=InnoDB;

CREATE INDEX proctoring_sessions_moodle_attempt_id_index
  ON proctoring_sessions (moodle_attempt_id);
