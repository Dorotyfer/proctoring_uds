ALTER TABLE proctoring_evidence
  DROP CONSTRAINT proctoring_evidence_kind_check,
  ADD CONSTRAINT proctoring_evidence_kind_check
    CHECK (kind IN ('identity', 'identity_document', 'interval', 'alert'));

ALTER TABLE proctoring_sessions
  ADD COLUMN IF NOT EXISTS identity_document_evidence_id CHAR(36) NULL;
