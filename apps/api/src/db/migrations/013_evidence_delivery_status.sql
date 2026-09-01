ALTER TABLE proctoring_alerts
  ADD COLUMN IF NOT EXISTS capture_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD CONSTRAINT proctoring_alerts_capture_status_check
    CHECK (capture_status IN ('available', 'pending', 'unavailable', 'failed'));
