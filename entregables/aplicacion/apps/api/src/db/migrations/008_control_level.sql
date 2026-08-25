ALTER TABLE proctoring_sessions
  ADD COLUMN IF NOT EXISTS control_level VARCHAR(10) NOT NULL DEFAULT 'medium';

ALTER TABLE proctoring_sessions
  DROP CONSTRAINT IF EXISTS proctoring_sessions_control_level_check;

ALTER TABLE proctoring_sessions
  ADD CONSTRAINT proctoring_sessions_control_level_check
  CHECK (control_level IN ('low', 'medium', 'high'));
