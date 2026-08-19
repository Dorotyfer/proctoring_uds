CREATE TABLE proctoring_evidence (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('identity', 'interval', 'alert')),
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  sha256 CHAR(64) NOT NULL,
  encryption_iv BYTEA NOT NULL,
  encryption_tag BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX proctoring_evidence_session_created_idx
  ON proctoring_evidence (session_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX proctoring_evidence_retention_idx
  ON proctoring_evidence (expires_at)
  WHERE deleted_at IS NULL;

ALTER TABLE proctoring_sessions
  ADD COLUMN reference_evidence_id UUID REFERENCES proctoring_evidence(id);

ALTER TABLE proctoring_alerts
  ADD COLUMN reviewed_by TEXT,
  ADD COLUMN review_note TEXT;

CREATE TABLE proctoring_evidence_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evidence_id UUID NOT NULL REFERENCES proctoring_evidence(id),
  actor_moodle_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('view', 'download', 'delete', 'retention_delete')),
  ip_address INET,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX proctoring_evidence_audit_evidence_time_idx
  ON proctoring_evidence_audit (evidence_id, occurred_at DESC);
