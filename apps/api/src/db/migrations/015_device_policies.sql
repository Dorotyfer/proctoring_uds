ALTER TABLE proctoring_sessions
  ADD COLUMN IF NOT EXISTS seb_version VARCHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS seb_config_id VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS seb_config_hash CHAR(64) NULL;

ALTER TABLE proctoring_events
  DROP CONSTRAINT proctoring_events_type_check,
  ADD CONSTRAINT proctoring_events_type_check CHECK (type IN (
    'camera_interrupted', 'face_absent', 'multiple_faces', 'face_out_of_frame',
    'identity_check_failed', 'biometric_mismatch', 'liveness_check_failed',
    'page_visibility_changed', 'network_disconnected', 'network_reconnected',
    'seb_event', 'attention_signal', 'biometric_monitor_mismatch',
    'environment_intrusion', 'facial_pattern_detected', 'window_blur',
    'window_focus', 'fullscreen_exit', 'page_unload', 'device_mode_mismatch'
  ));
