CREATE TABLE IF NOT EXISTS proctoring_events (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  client_event_id CHAR(36) NOT NULL,
  type VARCHAR(64) NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  metadata JSON NOT NULL,
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY proctoring_events_session_client_event_unique (session_id, client_event_id),
  CONSTRAINT proctoring_events_session_fk
    FOREIGN KEY (session_id) REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
  CONSTRAINT proctoring_events_type_check CHECK (type IN (
    'camera_interrupted', 'face_absent', 'multiple_faces', 'face_out_of_frame',
    'identity_check_failed', 'liveness_check_failed', 'page_visibility_changed',
    'network_disconnected', 'network_reconnected', 'seb_event'
  ))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS proctoring_events_session_time_idx ON proctoring_events (session_id, occurred_at);
