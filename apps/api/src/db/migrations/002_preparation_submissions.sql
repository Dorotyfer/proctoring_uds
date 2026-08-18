CREATE TABLE proctoring_preparation_submissions (
  session_id CHAR(36) NOT NULL PRIMARY KEY,
  evidence_json JSON NOT NULL,
  submitted_at DATETIME(3) NOT NULL,
  CONSTRAINT proctoring_preparation_session_fk
    FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB;
