ALTER TABLE proctoring_sessions
  ADD COLUMN prepared_at TIMESTAMPTZ,
  ADD COLUMN reference_capture_ciphertext BYTEA,
  ADD COLUMN reference_capture_iv BYTEA,
  ADD COLUMN reference_capture_tag BYTEA,
  ADD COLUMN reference_capture_hash CHAR(64),
  ADD COLUMN liveness_challenge JSONB;

CREATE TABLE proctoring_alerts (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
  event_id UUID NOT NULL UNIQUE REFERENCES proctoring_events(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX proctoring_alerts_session_status_idx
  ON proctoring_alerts (session_id, status, created_at);
