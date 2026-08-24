ALTER TABLE proctoring_sessions
  ADD COLUMN IF NOT EXISTS failure_policy VARCHAR(32) NOT NULL DEFAULT 'block'
  CHECK (failure_policy IN ('block', 'allow_with_alert'));
