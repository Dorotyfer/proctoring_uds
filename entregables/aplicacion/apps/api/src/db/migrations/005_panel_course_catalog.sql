CREATE TABLE IF NOT EXISTS proctoring_courses (
  moodle_course_id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE proctoring_sessions
  ADD COLUMN IF NOT EXISTS quiz_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS student_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS student_document VARCHAR(100) NULL;

INSERT INTO proctoring_courses (moodle_course_id, name, updated_at)
SELECT DISTINCT moodle_course_id, CONCAT('Curso ', moodle_course_id), UTC_TIMESTAMP(3)
FROM proctoring_sessions
ON DUPLICATE KEY UPDATE moodle_course_id = VALUES(moodle_course_id);
