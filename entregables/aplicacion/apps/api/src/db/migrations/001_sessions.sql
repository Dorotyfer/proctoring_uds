CREATE TABLE proctoring_sessions (
  id UUID PRIMARY KEY,
  moodle_user_id TEXT NOT NULL,
  moodle_course_id TEXT NOT NULL,
  moodle_quiz_id TEXT NOT NULL,
  moodle_attempt_id TEXT NOT NULL UNIQUE,
  device_mode TEXT NOT NULL CHECK (device_mode IN ('browser', 'seb')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'expired')),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > issued_at),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX proctoring_sessions_course_id_idx ON proctoring_sessions (moodle_course_id);
