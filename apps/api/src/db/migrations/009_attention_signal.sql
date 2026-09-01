ALTER TABLE proctoring_events
  DROP CONSTRAINT proctoring_events_type_check,
  ADD CONSTRAINT proctoring_events_type_check CHECK (type IN (
    'camera_interrupted', 'face_absent', 'multiple_faces', 'face_out_of_frame',
    'identity_check_failed', 'biometric_mismatch', 'liveness_check_failed',
    'page_visibility_changed', 'network_disconnected', 'network_reconnected',
    'seb_event', 'attention_signal'
  ));
