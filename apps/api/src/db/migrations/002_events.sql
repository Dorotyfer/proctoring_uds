CREATE TABLE proctoring_events (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES proctoring_sessions(id) ON DELETE CASCADE,
  client_event_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'camera_interrupted',
    'face_absent',
    'multiple_faces',
    'face_out_of_frame',
    'identity_check_failed',
    'liveness_check_failed',
    'page_visibility_changed',
    'network_disconnected',
    'network_reconnected',
    'seb_event'
  )),
  occurred_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, client_event_id)
);

CREATE INDEX proctoring_events_session_time_idx
  ON proctoring_events (session_id, occurred_at);
