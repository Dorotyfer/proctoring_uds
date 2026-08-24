ALTER TABLE proctoring_evidence
  ADD COLUMN IF NOT EXISTS event_id CHAR(36) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS proctoring_evidence_event_unique
  ON proctoring_evidence (event_id);
