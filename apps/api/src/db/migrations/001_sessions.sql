CREATE TABLE proctoring_sessions (
  id UUID PRIMARY KEY,
  moodle_user_id TEXT NOT NULL,
  moodle_course_id TEXT NOT NULL,
  moodle_quiz_id TEXT NOT NULL,
  moodle_attempt_id TEXT NOT NULL,
  device_mode TEXT NOT NULL CHECK (device_mode IN ('browser', 'seb')),
  status TEXT NOT NULL CHECK (status IN ('created', 'active', 'completed', 'expired')),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CHECK (expires_at > issued_at)
);

CREATE INDEX proctoring_sessions_moodle_attempt_id_index
  ON proctoring_sessions (moodle_attempt_id);
