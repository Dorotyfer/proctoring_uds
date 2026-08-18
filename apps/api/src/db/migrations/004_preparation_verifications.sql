ALTER TABLE proctoring_preparation_submissions
  ADD COLUMN submission_id CHAR(36) NULL AFTER session_id;

UPDATE proctoring_preparation_submissions
  SET submission_id = UUID()
  WHERE submission_id IS NULL;

ALTER TABLE proctoring_preparation_submissions
  MODIFY COLUMN submission_id CHAR(36) NOT NULL;

CREATE TABLE proctoring_preparation_verifications (
  session_id CHAR(36) NOT NULL PRIMARY KEY,
  submission_id CHAR(36) NOT NULL,
  verification_json JSON NOT NULL,
  verified_at DATETIME(3) NOT NULL,
  CONSTRAINT proctoring_preparation_verification_session_fk
    FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB;
