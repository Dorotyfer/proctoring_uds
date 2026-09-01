CREATE TABLE IF NOT EXISTS proctoring_policies (
  id CHAR(36) PRIMARY KEY,
  moodle_course_id VARCHAR(255) NOT NULL,
  moodle_quiz_id VARCHAR(255) NOT NULL,
  version VARCHAR(64) NOT NULL,
  policy_json JSON NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY proctoring_policies_course_quiz_version_unique (moodle_course_id, moodle_quiz_id, version),
  INDEX proctoring_policies_course_quiz_created_idx (moodle_course_id, moodle_quiz_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE proctoring_sessions
  ADD COLUMN IF NOT EXISTS device_mode_policy VARCHAR(20) NOT NULL DEFAULT 'either',
  ADD COLUMN IF NOT EXISTS policy_version VARCHAR(64) NOT NULL DEFAULT 'quiz-policy-3',
  ADD COLUMN IF NOT EXISTS policy_snapshot JSON NULL,
  ADD CONSTRAINT proctoring_sessions_device_mode_policy_check
    CHECK (device_mode_policy IN ('browser', 'seb', 'either'));

UPDATE proctoring_sessions
SET policy_snapshot = JSON_OBJECT('version', 'quiz-policy-3', 'signals', JSON_ARRAY())
WHERE policy_snapshot IS NULL;

ALTER TABLE proctoring_sessions
  MODIFY COLUMN policy_snapshot JSON NOT NULL;
