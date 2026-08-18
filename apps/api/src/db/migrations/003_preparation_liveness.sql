ALTER TABLE proctoring_sessions
  MODIFY COLUMN status ENUM('created', 'ready', 'active', 'completed', 'expired') NOT NULL,
  ADD COLUMN liveness_challenge_id CHAR(36) NULL AFTER created_at,
  ADD COLUMN liveness_challenge_completed_at DATETIME(3) NULL AFTER liveness_challenge_id;
